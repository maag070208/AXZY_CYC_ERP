import { Prisma, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { scopeOf, scopeWhere, type UserPermissions } from "@core/permissions";
import { t, type MessageKey } from "@core/i18n";
import { fromDbDay, isRealDay, toDbDay, todayInBusinessZone } from "@core/utils/day";
import { enrollmentScope, groupScope } from "@modules/courses";
import { fullName } from "@modules/students/services/student.service";
import { balanceOf, chargeTotal, daysBetween, money, sumOf } from "@modules/finance/models/entity/money";
import {
  FINANCIAL_REPORTS,
  REPORT_TYPES,
  isReportType,
  lastMonths,
  monthRange,
  type ColumnType,
  type ReportColumn,
  type ReportFilters,
  type ReportResult,
  type ReportRow,
  type ReportType,
} from "../models/entity/report";

const col = (key: string, type: ColumnType = "text"): ReportColumn => ({
  key,
  label: t(`reports.columns.${key}` as MessageKey),
  type,
});

const studentSelect = { matricula: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true } as const;

export interface Dashboard {
  termId: string | null;
  termNombre: string | null;
  activeStudents: number;
  inactiveStudents: number;
  groupOccupancy: {
    average: number;
    groups: Array<{ groupId: string; nombre: string; curso: string; inscritos: number; cupo: number; ratio: number }>;
  };
  /** Solo con alcance institucional (ALL); `null` para el profesor. */
  monthIncome: number | null;
  totalDebt: number | null;
  overdueDebt: number | null;
  incomeByMonth: Array<{ month: string; total: number }> | null;
  generatedAt: string;
}

/**
 * Reportes y tablero (M10): solo lectura sobre M03/M05/M07/M08/M09. Cada
 * consulta lleva el alcance de `reports.view` en el `where` (el profesor queda
 * en sus grupos y sus alumnos) y los reportes con montos exigen `ALL`.
 */
export class ReportService {
  constructor(private readonly db: PrismaClient = prismaClient) {}

  /** Catálogo de reportes que la persona puede ejecutar. */
  catalog(user: UserPermissions): Array<{ tipo: ReportType; title: string; financial: boolean }> {
    const all = scopeOf(user, "reports.view") === "ALL";
    return REPORT_TYPES.filter((tipo) => all || !FINANCIAL_REPORTS.includes(tipo)).map((tipo) => ({
      tipo,
      title: t(`reports.titles.${tipo}` as MessageKey),
      financial: FINANCIAL_REPORTS.includes(tipo),
    }));
  }

  /** Lee y valida los filtros (`?termId&groupId&from&to&status`). */
  parseFilters(query: Record<string, unknown>): ReportFilters {
    const text = (key: string): string | undefined => {
      const value = query[key];
      if (value === undefined || value === "") return undefined;
      if (typeof value !== "string") throw new HttpError(400, "INVALID_FILTER", { field: key });
      return value;
    };
    const filters: ReportFilters = { termId: text("termId"), groupId: text("groupId"), from: text("from"), to: text("to"), status: text("status") };
    for (const key of ["from", "to"] as const) {
      if (filters[key] && !isRealDay(filters[key] as string)) throw new HttpError(400, "INVALID_FILTER", { field: key });
    }
    if (filters.from && filters.to && filters.from > filters.to) throw new HttpError(400, "INVALID_RANGE");
    const uuid = /^[0-9a-f-]{36}$/i;
    for (const key of ["termId", "groupId"] as const) {
      if (filters[key] && !uuid.test(filters[key] as string)) throw new HttpError(400, "INVALID_FILTER", { field: key });
    }
    return filters;
  }

  /** Ciclo del filtro o, por defecto, el activo (M10 §4.4). */
  private async term(termId: string | undefined): Promise<{ id: string; name: string } | null> {
    if (termId) {
      const term = await this.db.term.findUnique({ where: { id: termId }, select: { id: true, name: true } });
      if (!term) throw new HttpError(400, "TERM_NOT_FOUND");
      return term;
    }
    return this.db.term.findFirst({ where: { active: true }, select: { id: true, name: true } });
  }

  private studentScope(user: UserPermissions) {
    return scopeWhere<Prisma.StudentWhereInput>(user, {
      resource: "students",
      permission: "reports.view",
      own: (u) => ({ userId: u.id }),
      byIds: (ids) => ({ id: { in: ids } }),
      or: (filters) => ({ OR: filters }),
      none: { id: { in: [] } },
    });
  }

  async run(tipo: string, filters: ReportFilters, user: UserPermissions): Promise<ReportResult> {
    if (!isReportType(tipo)) throw new HttpError(404, "REPORT_NOT_FOUND", { tipo });
    if (FINANCIAL_REPORTS.includes(tipo) && scopeOf(user, "reports.view") !== "ALL") {
      throw new HttpError(403, "REPORT_REQUIRES_FULL_SCOPE");
    }
    const base = { report: tipo, title: t(`reports.titles.${tipo}` as MessageKey), generatedAt: new Date().toISOString() };
    switch (tipo) {
      case "students-active":
        return { ...base, ...(await this.students(user, "ACTIVO", filters)) };
      case "students-inactive":
        return { ...base, ...(await this.students(user, "BAJA", filters)) };
      case "enrollments-by-group":
        return { ...base, ...(await this.enrollmentsByGroup(user, filters)) };
      case "grades-by-group":
        return { ...base, ...(await this.gradesByGroup(user, filters)) };
      case "attendance-by-group":
        return { ...base, ...(await this.attendanceByGroup(user, filters)) };
      case "payments-period":
        return { ...base, ...(await this.paymentsPeriod(filters)) };
      case "debts":
        return { ...base, ...(await this.debts(filters)) };
    }
  }

  private async students(user: UserPermissions, status: "ACTIVO" | "BAJA", filters: ReportFilters) {
    const scoped = await this.studentScope(user);
    const rows = await this.db.student.findMany({
      where: { AND: [{ status }, ...(scoped ? [scoped] : [])] },
      include: status === "BAJA" ? { movements: { where: { tipo: "BAJA" }, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }], take: 1 } } : undefined,
      orderBy: [{ apellidoPaterno: "asc" }, { apellidoMaterno: "asc" }, { nombres: "asc" }],
    });
    if (status === "ACTIVO") {
      return {
        filters: {},
        columns: [col("matricula"), col("nombre"), col("curp"), col("fechaIngreso", "date"), col("email"), col("telefono")],
        rows: rows.map((s) => ({
          matricula: s.matricula, nombre: fullName(s), curp: s.curp, fechaIngreso: fromDbDay(s.fechaIngreso),
          email: s.email, telefono: s.telefono,
        })),
        totals: { rows: rows.length },
      };
    }
    const inRange = (day: string | null) =>
      !!day && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
    const mapped = rows
      .map((s) => {
        const last = (s as typeof s & { movements?: Array<{ fecha: Date; motivo: string }> }).movements?.[0];
        return { matricula: s.matricula, nombre: fullName(s), fechaBaja: last ? fromDbDay(last.fecha) : null, motivo: last?.motivo ?? null };
      })
      .filter((r) => (!filters.from && !filters.to) || inRange(r.fechaBaja));
    return {
      filters: { from: filters.from, to: filters.to },
      columns: [col("matricula"), col("nombre"), col("fechaBaja", "date"), col("motivo")],
      rows: mapped,
      totals: { rows: mapped.length },
    };
  }

  private async scopedGroups(user: UserPermissions, filters: ReportFilters) {
    const term = await this.term(filters.termId);
    const scoped = await groupScope(user, "reports.view");
    const groups = await this.db.group.findMany({
      where: {
        AND: [
          { active: true },
          ...(term ? [{ termId: term.id }] : []),
          ...(filters.groupId ? [{ id: filters.groupId }] : []),
          ...(scoped ? [scoped] : []),
        ],
      },
      include: {
        course: { select: { nombre: true } },
        teacher: { select: { nombres: true, apellidos: true } },
        _count: { select: { enrollments: { where: { status: { not: "BAJA" } } } } },
      },
      orderBy: [{ course: { nombre: "asc" } }, { nombre: "asc" }],
    });
    return { term, groups };
  }

  private async enrollmentsByGroup(user: UserPermissions, filters: ReportFilters) {
    const { term, groups } = await this.scopedGroups(user, filters);
    const rows: ReportRow[] = groups.map((g) => ({
      curso: g.course.nombre,
      grupo: g.nombre,
      profesor: g.teacher ? `${g.teacher.nombres} ${g.teacher.apellidos}` : null,
      cupo: g.cupo,
      inscritos: g._count.enrollments,
      disponibles: Math.max(0, g.cupo - g._count.enrollments),
      ocupacion: g.cupo ? Math.round((g._count.enrollments / g.cupo) * 1000) / 10 : 0,
    }));
    const cupo = groups.reduce((s, g) => s + g.cupo, 0);
    const inscritos = groups.reduce((s, g) => s + g._count.enrollments, 0);
    return {
      filters: { termId: term?.id, termNombre: term?.name ?? null, groupId: filters.groupId },
      columns: [col("curso"), col("grupo"), col("profesor"), col("cupo", "number"), col("inscritos", "number"),
        col("disponibles", "number"), col("ocupacion", "percent")],
      rows,
      totals: { rows: rows.length, cupo, inscritos, ocupacion: cupo ? Math.round((inscritos / cupo) * 1000) / 10 : 0 },
    };
  }

  private async gradesByGroup(user: UserPermissions, filters: ReportFilters) {
    const term = await this.term(filters.termId);
    const scoped = await enrollmentScope(user, "reports.view");
    const rows = await this.db.enrollment.findMany({
      where: {
        AND: [
          { status: { not: "BAJA" } },
          { group: { active: true, ...(term ? { termId: term.id } : {}) } },
          ...(filters.groupId ? [{ groupId: filters.groupId }] : []),
          ...(filters.status ? [{ status: filters.status as "INSCRITO" | "ACREDITADO" | "REPROBADO" }] : []),
          ...(scoped ? [scoped] : []),
        ],
      },
      include: { student: { select: studentSelect }, group: { select: { nombre: true, course: { select: { nombre: true } } } } },
      orderBy: [{ group: { course: { nombre: "asc" } } }, { group: { nombre: "asc" } }, { student: { apellidoPaterno: "asc" } }],
    });
    const finals = rows.filter((r) => r.finalGrade !== null).map((r) => Number(r.finalGrade));
    return {
      filters: { termId: term?.id, termNombre: term?.name ?? null, groupId: filters.groupId, status: filters.status },
      columns: [col("curso"), col("grupo"), col("matricula"), col("nombre"), col("final", "number"), col("estatus")],
      rows: rows.map((r) => ({
        curso: r.group.course.nombre, grupo: r.group.nombre, matricula: r.student.matricula, nombre: fullName(r.student),
        final: r.finalGrade === null ? null : Number(r.finalGrade), estatus: r.status,
      })),
      totals: {
        rows: rows.length,
        acreditados: rows.filter((r) => r.status === "ACREDITADO").length,
        reprobados: rows.filter((r) => r.status === "REPROBADO").length,
        promedio: finals.length ? money(finals.reduce((a, b) => a + b, 0) / finals.length) : 0,
      },
    };
  }

  /**
   * Asistencia por alumno y grupo (M18 §4.4): sobre sesiones vigentes, en el
   * rango `from`/`to` si se da; marca a quien está bajo el umbral.
   */
  private async attendanceByGroup(user: UserPermissions, filters: ReportFilters) {
    const term = await this.term(filters.termId);
    const scoped = await enrollmentScope(user, "reports.view");
    const enrollments = await this.db.enrollment.findMany({
      where: {
        AND: [
          { status: { not: "BAJA" } },
          { group: { active: true, ...(term ? { termId: term.id } : {}) } },
          ...(filters.groupId ? [{ groupId: filters.groupId }] : []),
          ...(scoped ? [scoped] : []),
        ],
      },
      include: { student: { select: studentSelect }, group: { select: { nombre: true, course: { select: { nombre: true } } } } },
      orderBy: [{ group: { course: { nombre: "asc" } } }, { group: { nombre: "asc" } }, { student: { apellidoPaterno: "asc" } }],
    });
    const fecha = {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T00:00:00.000Z`) } : {}),
    };
    const counts = enrollments.length
      ? await this.db.attendance.groupBy({
          by: ["enrollmentId", "status"],
          where: { enrollmentId: { in: enrollments.map((e) => e.id) }, session: { deletedAt: null, ...(filters.from || filters.to ? { fecha } : {}) } },
          _count: { _all: true },
        })
      : [];
    const thresholdRow = await this.db.setting.findUnique({ where: { key: "ATTENDANCE_THRESHOLD" } });
    const threshold = Number(thresholdRow?.value ?? 80);
    const rows: ReportRow[] = enrollments.map((e) => {
      const of = (status: string) => counts.find((c) => c.enrollmentId === e.id && c.status === status)?._count._all ?? 0;
      const faltas = of("FALTA");
      const sesiones = faltas + of("PRESENTE") + of("RETARDO") + of("JUSTIFICADA");
      const porcentaje = sesiones ? Math.round(((sesiones - faltas) / sesiones) * 1000) / 10 : null;
      return {
        curso: e.group.course.nombre, grupo: e.group.nombre, matricula: e.student.matricula, nombre: fullName(e.student),
        sesiones, faltas, retardos: of("RETARDO"), justificadas: of("JUSTIFICADA"), porcentaje,
        alerta: porcentaje !== null && porcentaje < threshold ? "Sí" : null,
      };
    });
    return {
      filters: { termId: term?.id, termNombre: term?.name ?? null, groupId: filters.groupId, from: filters.from, to: filters.to },
      columns: [col("curso"), col("grupo"), col("matricula"), col("nombre"), col("sesiones", "number"), col("faltas", "number"),
        col("retardos", "number"), col("justificadas", "number"), col("porcentaje", "percent"), col("alerta")],
      rows,
      totals: { rows: rows.length, enAlerta: rows.filter((r) => r.alerta).length, umbral: threshold },
    };
  }

  private async paymentsPeriod(filters: ReportFilters) {
    const { from, to } = filters.from || filters.to
      ? { from: filters.from ?? "1900-01-01", to: filters.to ?? "2999-12-31" }
      : monthRange(todayInBusinessZone());
    const rows = await this.db.payment.findMany({
      where: {
        cancelledAt: null,
        fecha: { gte: toDbDay(from), lte: toDbDay(to) },
        ...(filters.termId ? { charge: { termId: filters.termId } } : {}),
      },
      include: { charge: { select: { descripcion: true, student: { select: studentSelect }, concept: { select: { nombre: true } } } } },
      orderBy: [{ fecha: "asc" }, { reciboFolio: "asc" }],
    });
    const byMethod: Record<string, number> = {};
    for (const p of rows) byMethod[p.metodo] = sumOf([byMethod[p.metodo] ?? 0, p.monto]);
    return {
      filters: { from, to, termId: filters.termId },
      columns: [col("folio"), col("fecha", "date"), col("matricula"), col("nombre"), col("concepto"), col("metodo"), col("monto", "money")],
      rows: rows.map((p) => ({
        folio: p.reciboFolio, fecha: fromDbDay(p.fecha), matricula: p.charge.student.matricula, nombre: fullName(p.charge.student),
        concepto: p.charge.descripcion ?? p.charge.concept.nombre, metodo: p.metodo, monto: Number(p.monto),
      })),
      totals: { rows: rows.length, monto: sumOf(rows.map((p) => p.monto)), ...byMethod },
    };
  }

  private async debts(filters: ReportFilters) {
    const today = todayInBusinessZone();
    const charges = await this.db.charge.findMany({
      where: {
        status: { in: ["PENDIENTE", "PARCIAL"] },
        ...(filters.termId ? { termId: filters.termId } : {}),
        ...(filters.to ? { fechaVencimiento: { lte: toDbDay(filters.to) } } : {}),
      },
      include: {
        student: { select: studentSelect },
        concept: { select: { nombre: true } },
        payments: { where: { cancelledAt: null }, select: { monto: true } },
      },
      orderBy: [{ fechaVencimiento: "asc" }],
    });
    const rows = charges
      .map((c) => {
        const total = chargeTotal(c.monto, c.descuento);
        const pagado = sumOf(c.payments.map((p) => p.monto));
        const vencimiento = fromDbDay(c.fechaVencimiento);
        return {
          matricula: c.student.matricula, nombre: fullName(c.student), concepto: c.descripcion ?? c.concept.nombre,
          vencimiento, total, pagado, saldo: balanceOf(total, pagado), diasVencido: Math.max(0, daysBetween(vencimiento, today)),
        };
      })
      .filter((r) => r.saldo > 0);
    return {
      filters: { termId: filters.termId, to: filters.to },
      columns: [col("matricula"), col("nombre"), col("concepto"), col("vencimiento", "date"), col("total", "money"),
        col("pagado", "money"), col("saldo", "money"), col("diasVencido", "number")],
      rows,
      totals: {
        rows: rows.length,
        saldo: sumOf(rows.map((r) => r.saldo)),
        vencido: sumOf(rows.filter((r) => r.diasVencido > 0).map((r) => r.saldo)),
      },
    };
  }

  /** KPIs del tablero (M10 §5), calculados en vivo con el alcance de la persona. */
  async dashboard(user: UserPermissions): Promise<Dashboard> {
    const all = scopeOf(user, "reports.view") === "ALL";
    const scopedStudents = await this.studentScope(user);
    const studentWhere = (status: "ACTIVO" | "BAJA") => ({ AND: [{ status }, ...(scopedStudents ? [scopedStudents] : [])] });
    const [activeStudents, inactiveStudents, { term, groups }] = await Promise.all([
      this.db.student.count({ where: studentWhere("ACTIVO") }),
      this.db.student.count({ where: studentWhere("BAJA") }),
      this.scopedGroups(user, {}),
    ]);
    const occupancy = groups.map((g) => ({
      groupId: g.id, nombre: g.nombre, curso: g.course.nombre, inscritos: g._count.enrollments, cupo: g.cupo,
      ratio: g.cupo ? Math.round((g._count.enrollments / g.cupo) * 1000) / 1000 : 0,
    }));
    const average = occupancy.length ? Math.round((occupancy.reduce((s, g) => s + g.ratio, 0) / occupancy.length) * 1000) / 1000 : 0;

    let finance: Pick<Dashboard, "monthIncome" | "totalDebt" | "overdueDebt" | "incomeByMonth"> = {
      monthIncome: null, totalDebt: null, overdueDebt: null, incomeByMonth: null,
    };
    if (all) {
      const today = todayInBusinessZone();
      const months = lastMonths(today, 6);
      const since = toDbDay(`${months[0]}-01`);
      const [payments, debts] = await Promise.all([
        this.db.payment.findMany({ where: { cancelledAt: null, fecha: { gte: since } }, select: { fecha: true, monto: true } }),
        this.debts({}),
      ]);
      const byMonth = new Map(months.map((m) => [m, [] as Prisma.Decimal[]]));
      for (const p of payments) byMonth.get(fromDbDay(p.fecha).slice(0, 7))?.push(p.monto);
      const incomeByMonth = months.map((month) => ({ month, total: sumOf(byMonth.get(month) ?? []) }));
      finance = {
        monthIncome: incomeByMonth[incomeByMonth.length - 1].total,
        totalDebt: debts.totals.saldo,
        overdueDebt: debts.totals.vencido,
        incomeByMonth,
      };
    }
    return {
      termId: term?.id ?? null,
      termNombre: term?.name ?? null,
      activeStudents,
      inactiveStudents,
      groupOccupancy: { average, groups: occupancy },
      ...finance,
      generatedAt: new Date().toISOString(),
    };
  }
}
