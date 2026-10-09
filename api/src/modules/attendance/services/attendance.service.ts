import { Prisma, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { scopeOf, type UserPermissions } from "@core/permissions";
import { fromDbDay, toDbDay, todayInBusinessZone } from "@core/utils/day";
import type { AuthenticatedUser } from "@core/utils/security";
import type { Notifier } from "@core/ports/notification.port";
import type { AuditLogger } from "@modules/audit";
import { assertGroupInScope, enrollmentScope } from "@modules/courses";
import { studentContacts } from "@modules/students";
import {
  DEFAULT_ATTENDANCE_THRESHOLD,
  alertTransition,
  attendancePct,
  belowThreshold,
  emptyCounts,
  totalOf,
  type AttendanceCounts,
} from "../models/entity/attendance-rules";
import type {
  GroupSummaryView,
  RollCallInput,
  SessionCreateInput,
  SessionRollView,
  SessionView,
  StudentAttendanceView,
  SummaryRow,
} from "../models/dto/attendance.dto";

type Client = PrismaClient | Prisma.TransactionClient;

const SYSTEM = { userId: null, userName: "sistema" };
const studentName = (s: { nombres: string; apellidoPaterno: string; apellidoMaterno: string | null }) =>
  [s.nombres, s.apellidoPaterno, s.apellidoMaterno].filter(Boolean).join(" ");
const studentSelect = { id: true, matricula: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true } as const;
const byName = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");

const sessionInclude = {
  group: { select: { id: true, nombre: true, active: true, closedAt: true, course: { select: { nombre: true } }, term: { select: { name: true } } } },
  records: { select: { status: true } },
} as const;
type SessionRow = Prisma.AttendanceSessionGetPayload<{ include: typeof sessionInclude }>;

const toSessionView = (row: SessionRow): SessionView => ({
  id: row.id,
  groupId: row.groupId,
  fecha: fromDbDay(row.fecha),
  hora: row.hora,
  tema: row.tema,
  registrados: row.records.length,
  faltas: row.records.filter((r) => r.status === "FALTA").length,
  annulled: !!row.deletedAt,
  deleteReason: row.deleteReason,
  createdAt: row.createdAt.toISOString(),
});

/**
 * M18: sesiones de asistencia, pase de lista, porcentajes y alerta por umbral.
 * La alerta se dispara por el puerto de notificaciones (M19).
 */
export class AttendanceService {
  private notifier?: Notifier;

  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  setNotifier(notifier: Notifier): void {
    this.notifier = notifier;
  }

  async threshold(client: Client = this.db): Promise<number> {
    const row = await client.setting.findUnique({ where: { key: "ATTENDANCE_THRESHOLD" } });
    const value = Number(row?.value ?? DEFAULT_ATTENDANCE_THRESHOLD);
    return Number.isFinite(value) ? value : DEFAULT_ATTENDANCE_THRESHOLD;
  }

  private async loadSession(id: string, client: Client = this.db): Promise<SessionRow> {
    const row = await client.attendanceSession.findUnique({ where: { id }, include: sessionInclude });
    if (!row) throw new HttpError(404, "SESSION_NOT_FOUND");
    return row;
  }

  /** Lecturas del pase completo: solo personal (AREA/ALL), no el alumno. */
  private async assertStaffView(user: UserPermissions, groupId: string): Promise<void> {
    const scope = scopeOf(user, "attendance.view");
    if (scope !== "ALL" && scope !== "AREA") throw new HttpError(403, "INSUFFICIENT_PERMISSIONS");
    await assertGroupInScope(this.db, user, "attendance.view", groupId);
  }

  private assertWritable(group: SessionRow["group"] | { active: boolean; closedAt: Date | null }): void {
    if (!group.active) throw new HttpError(409, "GROUP_INACTIVE");
    if (group.closedAt) throw new HttpError(409, "GROUP_CLOSED");
  }

  // --- sesiones -----------------------------------------------------------------

  async listSessions(groupId: string, user: UserPermissions): Promise<SessionView[]> {
    await this.assertStaffView(user, groupId);
    const rows = await this.db.attendanceSession.findMany({
      where: { groupId },
      include: sessionInclude,
      orderBy: [{ fecha: "desc" }, { hora: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toSessionView);
  }

  async createSession(groupId: string, input: SessionCreateInput, actor: AuthenticatedUser): Promise<SessionView> {
    await assertGroupInScope(this.db, actor, "attendance.manage", groupId);
    const group = await this.db.group.findUnique({ where: { id: groupId }, select: { active: true, closedAt: true } });
    if (!group) throw new HttpError(404, "GROUP_NOT_FOUND");
    this.assertWritable(group);
    if (input.fecha > todayInBusinessZone()) throw new HttpError(400, "FUTURE_DATE", { field: "fecha" });
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.attendanceSession.create({
          data: { groupId, fecha: toDbDay(input.fecha), hora: input.hora ?? null, tema: input.tema ?? null, createdBy: actor.id },
          include: sessionInclude,
        });
        await this.audit?.(
          { action: "ATTENDANCE_SESSION_CREATED", entityType: "AttendanceSession", entityId: row.id, userId: actor.id, userName: actor.username,
            newState: { groupId, fecha: input.fecha, hora: row.hora, tema: row.tema } },
          tx
        );
        return toSessionView(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "SESSION_DUPLICATE");
      throw error;
    }
  }

  /** Pase de lista de una sesión: inscritos vigentes (y quien ya tenga registro). */
  async getRoll(sessionId: string, user: UserPermissions): Promise<SessionRollView> {
    const session = await this.loadSession(sessionId);
    await this.assertStaffView(user, session.groupId);
    const enrollments = await this.db.enrollment.findMany({
      where: { groupId: session.groupId, OR: [{ status: "INSCRITO" }, { attendance: { some: { sessionId } } }] },
      select: {
        id: true,
        student: { select: studentSelect },
        attendance: { where: { sessionId }, select: { id: true, status: true, justification: { select: { status: true } } } },
      },
    });
    const rows = enrollments
      .map((e) => {
        const record = e.attendance[0];
        const justification = record?.justification?.status ?? null;
        return {
          enrollmentId: e.id,
          studentId: e.student.id,
          matricula: e.student.matricula,
          nombre: studentName(e.student),
          attendanceId: record?.id ?? null,
          status: record?.status ?? null,
          justification,
          locked: justification === "PENDIENTE" || justification === "APROBADA",
        };
      })
      .sort(byName);
    return {
      ...toSessionView(session),
      group: {
        id: session.group.id,
        nombre: session.group.nombre,
        courseNombre: session.group.course.nombre,
        termNombre: session.group.term.name,
        closed: !!session.group.closedAt || !session.group.active,
      },
      rows,
    };
  }

  /**
   * Guarda el pase (M18 §4.2–4.3): uno por inscrito vigente, upsert por
   * `(sesión, inscripción)`. Los registros con justificante pendiente o
   * aprobado no cambian (los resuelve el justificante).
   */
  async saveRoll(sessionId: string, input: RollCallInput, actor: AuthenticatedUser): Promise<{ sessionId: string; saved: number; skipped: number }> {
    const session = await this.loadSession(sessionId);
    await assertGroupInScope(this.db, actor, "attendance.manage", session.groupId);
    if (session.deletedAt) throw new HttpError(409, "SESSION_ANNULLED");
    this.assertWritable(session.group);

    const result = await this.db.$transaction(async (tx) => {
      const enrollments = await tx.enrollment.findMany({
        where: { groupId: session.groupId, OR: [{ status: "INSCRITO" }, { attendance: { some: { sessionId } } }] },
        select: { id: true, status: true, attendance: { where: { sessionId }, select: { id: true, status: true, justification: { select: { status: true } } } } },
      });
      const byId = new Map(enrollments.map((e) => [e.id, e]));
      for (const item of input.items) {
        if (!byId.has(item.enrollmentId)) throw new HttpError(400, "INVALID_REFERENCE", {}, { enrollmentId: item.enrollmentId });
      }
      const sent = new Set(input.items.map((i) => i.enrollmentId));
      const missing = enrollments.filter((e) => e.status === "INSCRITO" && !sent.has(e.id)).length;
      if (missing > 0) throw new HttpError(400, "ATTENDANCE_INCOMPLETE", { count: missing });

      const changes: Array<{ enrollmentId: string; from: string | null; to: string }> = [];
      let skipped = 0;
      for (const item of input.items) {
        const current = byId.get(item.enrollmentId)!.attendance[0];
        const locked = current?.justification && current.justification.status !== "RECHAZADA";
        if (locked) {
          skipped++;
          continue;
        }
        if (current?.status === item.status) continue;
        await tx.attendance.upsert({
          where: { sessionId_enrollmentId: { sessionId, enrollmentId: item.enrollmentId } },
          create: { sessionId, enrollmentId: item.enrollmentId, status: item.status, recordedBy: actor.id },
          update: { status: item.status, recordedBy: actor.id },
        });
        changes.push({ enrollmentId: item.enrollmentId, from: current?.status ?? null, to: item.status });
      }
      if (changes.length) {
        await this.audit?.(
          { action: "ATTENDANCE_RECORDED", entityType: "AttendanceSession", entityId: sessionId, userId: actor.id, userName: actor.username,
            previousState: { records: changes.map((c) => ({ enrollmentId: c.enrollmentId, status: c.from })) },
            newState: { records: changes.map((c) => ({ enrollmentId: c.enrollmentId, status: c.to })) },
            metadata: { groupId: session.groupId, fecha: fromDbDay(session.fecha) } },
          tx
        );
      }
      await this.refreshAlerts(enrollments.map((e) => e.id), tx);
      return { sessionId, saved: changes.length, skipped };
    });
    return result;
  }

  /** Anulación lógica (M18 §4.9): la sesión deja de contar, sus registros se conservan. */
  async annul(sessionId: string, motivo: string, actor: AuthenticatedUser): Promise<SessionView> {
    const session = await this.loadSession(sessionId);
    await assertGroupInScope(this.db, actor, "attendance.manage", session.groupId);
    if (session.deletedAt) throw new HttpError(409, "SESSION_ANNULLED");
    this.assertWritable(session.group);
    return this.db.$transaction(async (tx) => {
      const row = await tx.attendanceSession.update({
        where: { id: sessionId },
        data: { deletedAt: new Date(), deletedBy: actor.id, deleteReason: motivo },
        include: sessionInclude,
      });
      await this.audit?.(
        { action: "ATTENDANCE_SESSION_ANNULLED", entityType: "AttendanceSession", entityId: sessionId, userId: actor.id, userName: actor.username,
          previousState: { annulled: false }, newState: { annulled: true }, metadata: { motivo, groupId: session.groupId, fecha: fromDbDay(session.fecha) } },
        tx
      );
      const enrollments = await tx.enrollment.findMany({ where: { groupId: session.groupId }, select: { id: true } });
      await this.refreshAlerts(enrollments.map((e) => e.id), tx);
      return toSessionView(row);
    });
  }

  // --- porcentajes --------------------------------------------------------------

  /** Conteos por inscripción sobre sesiones vigentes. */
  private async countsFor(enrollmentIds: string[], client: Client = this.db): Promise<Map<string, AttendanceCounts>> {
    const map = new Map<string, AttendanceCounts>(enrollmentIds.map((id) => [id, emptyCounts()]));
    if (!enrollmentIds.length) return map;
    const groups = await client.attendance.groupBy({
      by: ["enrollmentId", "status"],
      where: { enrollmentId: { in: enrollmentIds }, session: { deletedAt: null } },
      _count: { _all: true },
    });
    for (const g of groups) map.get(g.enrollmentId)![g.status] = g._count._all;
    return map;
  }

  private summaryOf(
    e: { id: string; attendanceAlertAt: Date | null; student: { id: string; matricula: string; nombres: string; apellidoPaterno: string; apellidoMaterno: string | null } },
    counts: AttendanceCounts,
    threshold: number
  ): SummaryRow {
    const porcentaje = attendancePct(counts);
    return {
      enrollmentId: e.id,
      studentId: e.student.id,
      matricula: e.student.matricula,
      nombre: studentName(e.student),
      sesiones: totalOf(counts),
      presentes: counts.PRESENTE,
      retardos: counts.RETARDO,
      faltas: counts.FALTA,
      justificadas: counts.JUSTIFICADA,
      porcentaje,
      alerta: belowThreshold(porcentaje, threshold),
    };
  }

  /** Porcentaje por alumno del grupo; el alumno (OWN) solo ve su renglón. */
  async groupSummary(groupId: string, user: UserPermissions): Promise<GroupSummaryView> {
    await assertGroupInScope(this.db, user, "attendance.view", groupId);
    const own = scopeOf(user, "attendance.view") === "OWN";
    const enrollments = await this.db.enrollment.findMany({
      where: { groupId, status: { not: "BAJA" }, ...(own ? { student: { userId: (user as { id: string }).id } } : {}) },
      select: { id: true, attendanceAlertAt: true, student: { select: studentSelect } },
    });
    const [threshold, counts, sesiones] = await Promise.all([
      this.threshold(),
      this.countsFor(enrollments.map((e) => e.id)),
      this.db.attendanceSession.count({ where: { groupId, deletedAt: null } }),
    ]);
    const rows = enrollments.map((e) => this.summaryOf(e, counts.get(e.id)!, threshold)).sort(byName);
    const pcts = rows.map((r) => r.porcentaje).filter((p): p is number => p !== null);
    return {
      groupId,
      threshold,
      sesiones,
      promedio: pcts.length ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 100) / 100 : null,
      enAlerta: rows.filter((r) => r.alerta).length,
      rows,
    };
  }

  /** Asistencia de un alumno por grupo con su detalle (M18; alumno, profesor o control). */
  async studentSummary(studentId: string, user: UserPermissions): Promise<StudentAttendanceView> {
    const scoped = await enrollmentScope(user, "attendance.view");
    const enrollments = await this.db.enrollment.findMany({
      where: { AND: [{ studentId, status: { not: "BAJA" } }, ...(scoped ? [scoped] : [])] },
      select: {
        id: true,
        attendanceAlertAt: true,
        student: { select: studentSelect },
        group: { select: { id: true, nombre: true, course: { select: { nombre: true } }, term: { select: { name: true } } } },
        attendance: {
          where: { session: { deletedAt: null } },
          select: { id: true, status: true, session: { select: { id: true, fecha: true, hora: true } }, justification: { select: { id: true, status: true, nota: true } } },
          orderBy: [{ session: { fecha: "desc" } }],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!enrollments.length) {
      const exists = await this.db.student.count({ where: { id: studentId } });
      if (!exists) throw new HttpError(404, "STUDENT_NOT_FOUND");
    }
    const [threshold, counts] = await Promise.all([this.threshold(), this.countsFor(enrollments.map((e) => e.id))]);
    return {
      studentId,
      threshold,
      groups: enrollments.map((e) => {
        const { studentId: _s, matricula: _m, nombre: _n, ...row } = this.summaryOf(e, counts.get(e.id)!, threshold);
        return {
          ...row,
          groupId: e.group.id,
          grupo: e.group.nombre,
          curso: e.group.course.nombre,
          ciclo: e.group.term.name,
          records: e.attendance.map((a) => ({
            attendanceId: a.id,
            sessionId: a.session.id,
            fecha: fromDbDay(a.session.fecha),
            hora: a.session.hora,
            status: a.status,
            justification: a.justification ? { id: a.justification.id, status: a.justification.status, nota: a.justification.nota } : null,
          })),
        };
      }),
    };
  }

  // --- alerta por umbral --------------------------------------------------------

  /**
   * Recalcula la alerta de cada inscripción (M18 §4.5): al cruzar el umbral
   * hacia abajo la marca, audita y avisa (M19); al recuperarlo la limpia.
   */
  async refreshAlerts(enrollmentIds: string[], client: Client = this.db): Promise<number> {
    if (!enrollmentIds.length) return 0;
    const threshold = await this.threshold(client);
    const counts = await this.countsFor(enrollmentIds, client);
    const enrollments = await client.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: { id: true, studentId: true, status: true, attendanceAlertAt: true, group: { select: { nombre: true, course: { select: { nombre: true } } } } },
    });
    let triggered = 0;
    for (const e of enrollments) {
      const pct = attendancePct(counts.get(e.id) ?? emptyCounts());
      const transition = alertTransition(e.status === "BAJA" ? null : pct, threshold, !!e.attendanceAlertAt);
      if (transition === "NONE") continue;
      if (transition === "CLEAR") {
        await client.enrollment.update({ where: { id: e.id }, data: { attendanceAlertAt: null } });
        await this.audit?.(
          { action: "ATTENDANCE_ALERT_CLEARED", entityType: "Enrollment", entityId: e.id, ...SYSTEM,
            previousState: { alerta: true }, newState: { alerta: false, porcentaje: pct, umbral: threshold } },
          client as Prisma.TransactionClient
        );
        continue;
      }
      const at = new Date();
      await client.enrollment.update({ where: { id: e.id }, data: { attendanceAlertAt: at } });
      await this.audit?.(
        { action: "ATTENDANCE_ALERT_TRIGGERED", entityType: "Enrollment", entityId: e.id, ...SYSTEM,
          previousState: { alerta: false }, newState: { alerta: true, porcentaje: pct, umbral: threshold }, metadata: { studentId: e.studentId } },
        client as Prisma.TransactionClient
      );
      triggered++;
      if (this.notifier) {
        const contacts = await studentContacts(client, e.studentId, "all");
        if (contacts) {
          await this.notifier(
            {
              clave: "ALERTA_INASISTENCIA",
              recipients: contacts.recipients,
              payload: { nombre: contacts.nombre, curso: e.group.course.nombre, grupo: e.group.nombre, porcentaje: pct ?? 0, umbral: threshold },
              idempotencyKey: `ALERTA_INASISTENCIA:${e.id}:${at.getTime()}`,
            },
            client as Prisma.TransactionClient
          );
        }
      }
    }
    return triggered;
  }
}
