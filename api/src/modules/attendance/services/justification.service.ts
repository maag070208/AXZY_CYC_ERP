import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import { scopeOf, type UserPermissions } from "@core/permissions";
import { deleteObject, readObject, uploadObject } from "@core/services/storage";
import { fromDbDay } from "@core/utils/day";
import { formatDay } from "@core/utils/format";
import type { AuthenticatedUser } from "@core/utils/security";
import { filterEnum, filterId, orderByOf, type ITDataTableFetchParams, type ITDataTableResponse } from "@core/utils/table";
import type { Notifier } from "@core/ports/notification.port";
import type { AuditLogger } from "@modules/audit";
import { assertGroupInScope, enrollmentScope } from "@modules/courses";
import { detectFileType } from "@modules/documents";
import { studentContacts } from "@modules/students";
import {
  JUSTIFICATION_STATUSES,
  MAX_JUSTIFICATION_BYTES,
  canJustify,
  statusAfterResolution,
} from "../models/entity/attendance-rules";
import type { JustificationFields, JustificationView, ResolveInput } from "../models/dto/attendance.dto";
import type { AttendanceService } from "./attendance.service";
import { t } from "@core/i18n";

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

const include = {
  attendance: {
    select: {
      id: true,
      status: true,
      enrollmentId: true,
      session: { select: { date: true, time: true, groupId: true, group: { select: { name: true, course: { select: { name: true } } } } } },
      enrollment: { select: { student: { select: { id: true, userId: true, studentNumber: true, firstNames: true, paternalSurname: true, maternalSurname: true } } } },
    },
  },
} as const;
type JustificationRow = Prisma.JustificationGetPayload<{ include: typeof include }>;

const toView = (row: JustificationRow): JustificationView => {
  const { session, enrollment } = row.attendance;
  const s = enrollment.student;
  return {
    id: row.id,
    attendanceId: row.attendanceId,
    status: row.status,
    reason: row.reason,
    note: row.note,
    hasFile: !!row.fileKey,
    fileName: row.fileName,
    date: fromDbDay(session.date),
    time: session.time,
    groupId: session.groupId,
    groupName: session.group.name,
    courseName: session.group.course.name,
    studentId: s.id,
    studentNumber: s.studentNumber,
    name: [s.firstNames, s.paternalSurname, s.maternalSurname].filter(Boolean).join(" "),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
};

/**
 * Justificantes (M18 §4.6–4.7): el alumno (o el personal por él) solicita con
 * archivo opcional; el profesor de su grupo o control escolar resuelve. Al
 * aprobarse, la falta pasa a JUSTIFICADA y se recalcula la alerta.
 */
export class JustificationService {
  private notifier?: Notifier;

  constructor(
    private readonly attendance: AttendanceService,
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  setNotifier(notifier: Notifier): void {
    this.notifier = notifier;
  }

  /** OWN = solo lo propio; AREA/ALL = dentro del alcance del grupo. Fuera de alcance → 404. */
  private async assertAccess(
    user: AuthenticatedUser | UserPermissions,
    permission: string,
    target: { groupId: string; studentUserId: string | null }
  ): Promise<void> {
    const scope = scopeOf(user, permission);
    if (scope === "OWN") {
      if (target.studentUserId !== (user as { id: string }).id) throw new HttpError(404, "JUSTIFICATION_NOT_FOUND");
      return;
    }
    try {
      await assertGroupInScope(this.db, user, permission, target.groupId);
    } catch {
      throw new HttpError(404, "JUSTIFICATION_NOT_FOUND");
    }
  }

  private async load(id: string): Promise<JustificationRow> {
    const row = await this.db.justification.findUnique({ where: { id }, include });
    if (!row) throw new HttpError(404, "JUSTIFICATION_NOT_FOUND");
    return row;
  }

  async create(fields: JustificationFields, file: UploadedFile | undefined, actor: AuthenticatedUser): Promise<JustificationView> {
    const record = await this.db.attendance.findUnique({
      where: { id: fields.attendanceId },
      select: {
        id: true,
        status: true,
        session: { select: { groupId: true, deletedAt: true } },
        enrollment: { select: { student: { select: { userId: true } } } },
        justification: { select: { id: true, status: true, fileKey: true } },
      },
    });
    if (!record) throw new HttpError(404, "ATTENDANCE_NOT_FOUND");
    const scope = scopeOf(actor, "attendance.justify");
    if (scope === "OWN" ? record.enrollment.student.userId !== actor.id : false) throw new HttpError(404, "ATTENDANCE_NOT_FOUND");
    if (scope !== "OWN") await assertGroupInScope(this.db, actor, "attendance.justify", record.session.groupId);
    if (record.session.deletedAt) throw new HttpError(409, "SESSION_ANNULLED");
    if (!canJustify(record.status)) throw new HttpError(409, "JUSTIFICATION_ONLY_ABSENCE");
    if (record.justification && record.justification.status !== "REJECTED") throw new HttpError(409, "JUSTIFICATION_EXISTS");

    let upload: { key: string; mime: string; name: string; size: number } | null = null;
    if (file && file.size > 0) {
      if (file.size > MAX_JUSTIFICATION_BYTES) throw new HttpError(400, "FILE_TOO_LARGE", { maxMb: 5 });
      const type = detectFileType(file.buffer);
      if (!type) throw new HttpError(400, "FILE_TYPE_NOT_ALLOWED");
      upload = { key: `justifications/${record.id}/${randomUUID()}.${type.ext}`, mime: type.mime, name: file.originalname.slice(0, 255), size: file.size };
      await uploadObject(upload.key, file.buffer, upload.mime);
    }
    const data = {
      reason: fields.reason,
      fileKey: upload?.key ?? null,
      fileName: upload?.name ?? null,
      fileMime: upload?.mime ?? null,
      fileSize: upload?.size ?? null,
      status: "PENDING" as const,
      requestedBy: actor.id,
      resolvedBy: null,
      resolvedAt: null,
      note: null,
    };
    try {
      return await this.db.$transaction(async (tx) => {
        // Uno por falta: si el anterior se rechazó, la nueva solicitud lo reemplaza.
        const row = record.justification
          ? await tx.justification.update({ where: { id: record.justification.id }, data, include })
          : await tx.justification.create({ data: { attendanceId: record.id, ...data }, include });
        await this.audit?.(
          { action: "JUSTIFICATION_CREATED", entityType: "Justification", entityId: row.id, userId: actor.id, userName: actor.username,
            previousState: record.justification ? { status: record.justification.status } : null,
            newState: { attendanceId: record.id, status: "PENDING", file: upload ? { name: upload.name, mime: upload.mime, size: upload.size } : null } },
          tx
        );
        return toView(row);
      });
    } catch (error) {
      if (upload) await deleteObject(upload.key).catch(() => undefined);
      throw error;
    }
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<JustificationView>> {
    const { filters } = params;
    const and: Prisma.JustificationWhereInput[] = [];
    const status = filterEnum(filters, "status", JUSTIFICATION_STATUSES);
    if (status) and.push({ status });
    const groupId = filterId(filters, "groupId");
    if (groupId) and.push({ attendance: { session: { groupId } } });
    const studentId = filterId(filters, "studentId");
    if (studentId) and.push({ attendance: { enrollment: { studentId } } });
    const scoped = await enrollmentScope(user, "attendance.justify");
    if (scoped) and.push({ attendance: { enrollment: scoped } });
    const result = await paginatedQuery<JustificationRow>({
      model: this.db.justification,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy: orderByOf(params.sort, { createdAt: "createdAt", status: "status", resolvedAt: "resolvedAt" }, [{ createdAt: "desc" }]),
      include,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toView), total: result.total };
  }

  async resolve(id: string, input: ResolveInput, actor: AuthenticatedUser): Promise<JustificationView> {
    const scope = scopeOf(actor, "attendance.justify");
    if (scope !== "AREA" && scope !== "ALL") throw new HttpError(403, "INSUFFICIENT_PERMISSIONS");
    const row = await this.load(id);
    await this.assertAccess(actor, "attendance.justify", {
      groupId: row.attendance.session.groupId,
      studentUserId: row.attendance.enrollment.student.userId,
    });
    if (row.status !== "PENDING") throw new HttpError(409, "JUSTIFICATION_ALREADY_RESOLVED");
    const nextStatus = statusAfterResolution(input.status);

    return this.db.$transaction(async (tx) => {
      const updated = await tx.justification.update({
        where: { id },
        data: { status: input.status, note: input.note ?? null, resolvedBy: actor.id, resolvedAt: new Date() },
        include,
      });
      if (row.attendance.status !== nextStatus) {
        await tx.attendance.update({ where: { id: row.attendanceId }, data: { status: nextStatus, recordedBy: actor.id } });
      }
      await this.audit?.(
        { action: input.status === "APPROVED" ? "JUSTIFICATION_APPROVED" : "JUSTIFICATION_REJECTED", entityType: "Justification", entityId: id,
          userId: actor.id, userName: actor.username,
          previousState: { status: "PENDING", attendance: row.attendance.status },
          newState: { status: input.status, attendance: nextStatus, note: input.note ?? null } },
        tx
      );
      await this.attendance.refreshAlerts([row.attendance.enrollmentId], tx);
      if (this.notifier) {
        const contacts = await studentContacts(tx, row.attendance.enrollment.student.id);
        if (contacts) {
          await this.notifier(
            {
              code: "JUSTIFICATION_RESOLVED",
              recipients: contacts.recipients,
              payload: {
                name: contacts.name,
                date: formatDay(fromDbDay(row.attendance.session.date)),
                courseName: row.attendance.session.group.course.name,
                result: t(input.status === "APPROVED" ? "justifications.approved" : "justifications.rejected"),
                note: input.note ?? "",
              },
              idempotencyKey: `JUSTIFICATION_RESOLVED:${id}:${updated.resolvedAt?.getTime()}`,
            },
            tx
          );
        }
      }
      return toView(updated);
    });
  }

  /** Descarga autorizada del archivo (nunca hay URL pública). */
  async file(id: string, user: UserPermissions): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const row = await this.load(id);
    await this.assertAccess(user, "attendance.view", {
      groupId: row.attendance.session.groupId,
      studentUserId: row.attendance.enrollment.student.userId,
    });
    if (!row.fileKey) throw new HttpError(404, "JUSTIFICATION_NO_FILE");
    return { buffer: await readObject(row.fileKey), mimeType: row.fileMime ?? "application/octet-stream", filename: row.fileName ?? "justificante" };
  }
}
