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

const studentSelect = { studentNumber: true, firstNames: true, paternalSurname: true, maternalSurname: true } as const;

export interface Dashboard {
  termId: string | null;
  termName: string | null;
  activeStudents: number;
  inactiveStudents: number;
  groupOccupancy: {
    average: number;
    groups: Array<{ groupId: string; name: string; courseName: string; enrolledCount: number; capacity: number; ratio: number }>;
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
  catalog(user: UserPermissions): Array<{ type: ReportType; title: string; financial: boolean }> {
    const all = scopeOf(user, "reports.view") === "ALL";
    return REPORT_TYPES.filter((type) => all || !FINANCIAL_REPORTS.includes(type)).map((type) => ({
      type,
      title: t(`reports.titles.${type}` as MessageKey),
      financial: FINANCIAL_REPORTS.includes(type),
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

  async run(type: string, filters: ReportFilters, user: UserPermissions): Promise<ReportResult> {
    if (!isReportType(type)) throw new HttpError(404, "REPORT_NOT_FOUND", { type });
    if (FINANCIAL_REPORTS.includes(type) && scopeOf(user, "reports.view") !== "ALL") {
      throw new HttpError(403, "REPORT_REQUIRES_FULL_SCOPE");
    }
    const base = { report: type, title: t(`reports.titles.${type}` as MessageKey), generatedAt: new Date().toISOString() };
    switch (type) {
      case "students-active":
        return { ...base, ...(await this.students(user, "ACTIVE", filters)) };
      case "students-inactive":
        return { ...base, ...(await this.students(user, "WITHDRAWN", filters)) };
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

  private async students(user: UserPermissions, status: "ACTIVE" | "WITHDRAWN", filters: ReportFilters) {
    const scoped = await this.studentScope(user);
    const rows = await this.db.student.findMany({
      where: { AND: [{ status }, ...(scoped ? [scoped] : [])] },
      include: status === "WITHDRAWN" ? { movements: { where: { type: "WITHDRAWAL" }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 } } : undefined,
      orderBy: [{ paternalSurname: "asc" }, { maternalSurname: "asc" }, { firstNames: "asc" }],
    });
    if (status === "ACTIVE") {
      return {
        filters: {},
        columns: [col("studentNumber"), col("name"), col("curp"), col("enrollmentDate", "date"), col("email"), col("phone")],
        rows: rows.map((s) => ({
          studentNumber: s.studentNumber, name: fullName(s), curp: s.curp, enrollmentDate: fromDbDay(s.enrollmentDate),
          email: s.email, phone: s.phone,
        })),
        totals: { rows: rows.length },
      };
    }
    const inRange = (day: string | null) =>
      !!day && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
    const mapped = rows
      .map((s) => {
        const last = (s as typeof s & { movements?: Array<{ date: Date; reason: string }> }).movements?.[0];
        return { studentNumber: s.studentNumber, name: fullName(s), withdrawalDate: last ? fromDbDay(last.date) : null, reason: last?.reason ?? null };
      })
      .filter((r) => (!filters.from && !filters.to) || inRange(r.withdrawalDate));
    return {
      filters: { from: filters.from, to: filters.to },
      columns: [col("studentNumber"), col("name"), col("withdrawalDate", "date"), col("reason")],
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
        course: { select: { name: true } },
        teacher: { select: { firstNames: true, surnames: true } },
        _count: { select: { enrollments: { where: { status: { not: "WITHDRAWN" } } } } },
      },
      orderBy: [{ course: { name: "asc" } }, { name: "asc" }],
    });
    return { term, groups };
  }

  private async enrollmentsByGroup(user: UserPermissions, filters: ReportFilters) {
    const { term, groups } = await this.scopedGroups(user, filters);
    const rows: ReportRow[] = groups.map((g) => ({
      courseName: g.course.name,
      groupName: g.name,
      teacherName: g.teacher ? `${g.teacher.firstNames} ${g.teacher.surnames}` : null,
      capacity: g.capacity,
      enrolledCount: g._count.enrollments,
      available: Math.max(0, g.capacity - g._count.enrollments),
      occupancy: g.capacity ? Math.round((g._count.enrollments / g.capacity) * 1000) / 10 : 0,
    }));
    const capacity = groups.reduce((s, g) => s + g.capacity, 0);
    const enrolledCount = groups.reduce((s, g) => s + g._count.enrollments, 0);
    return {
      filters: { termId: term?.id, termName: term?.name ?? null, groupId: filters.groupId },
      columns: [col("courseName"), col("groupName"), col("teacherName"), col("capacity", "number"), col("enrolledCount", "number"),
        col("available", "number"), col("occupancy", "percent")],
      rows,
      totals: { rows: rows.length, capacity, enrolledCount, occupancy: capacity ? Math.round((enrolledCount / capacity) * 1000) / 10 : 0 },
    };
  }

  private async gradesByGroup(user: UserPermissions, filters: ReportFilters) {
    const term = await this.term(filters.termId);
    const scoped = await enrollmentScope(user, "reports.view");
    const rows = await this.db.enrollment.findMany({
      where: {
        AND: [
          { status: { not: "WITHDRAWN" } },
          { group: { active: true, ...(term ? { termId: term.id } : {}) } },
          ...(filters.groupId ? [{ groupId: filters.groupId }] : []),
          ...(filters.status ? [{ status: filters.status as "ENROLLED" | "PASSED" | "FAILED" }] : []),
          ...(scoped ? [scoped] : []),
        ],
      },
      include: { student: { select: studentSelect }, group: { select: { name: true, course: { select: { name: true } } } } },
      orderBy: [{ group: { course: { name: "asc" } } }, { group: { name: "asc" } }, { student: { paternalSurname: "asc" } }],
    });
    const finals = rows.filter((r) => r.finalGrade !== null).map((r) => Number(r.finalGrade));
    return {
      filters: { termId: term?.id, termName: term?.name ?? null, groupId: filters.groupId, status: filters.status },
      columns: [col("courseName"), col("groupName"), col("studentNumber"), col("name"), col("final", "number"), col("status")],
      rows: rows.map((r) => ({
        courseName: r.group.course.name, groupName: r.group.name, studentNumber: r.student.studentNumber, name: fullName(r.student),
        final: r.finalGrade === null ? null : Number(r.finalGrade), status: r.status,
      })),
      totals: {
        rows: rows.length,
        passedCount: rows.filter((r) => r.status === "PASSED").length,
        failedCount: rows.filter((r) => r.status === "FAILED").length,
        average: finals.length ? money(finals.reduce((a, b) => a + b, 0) / finals.length) : 0,
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
          { status: { not: "WITHDRAWN" } },
          { group: { active: true, ...(term ? { termId: term.id } : {}) } },
          ...(filters.groupId ? [{ groupId: filters.groupId }] : []),
          ...(scoped ? [scoped] : []),
        ],
      },
      include: { student: { select: studentSelect }, group: { select: { name: true, course: { select: { name: true } } } } },
      orderBy: [{ group: { course: { name: "asc" } } }, { group: { name: "asc" } }, { student: { paternalSurname: "asc" } }],
    });
    const date = {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T00:00:00.000Z`) } : {}),
    };
    const counts = enrollments.length
      ? await this.db.attendance.groupBy({
          by: ["enrollmentId", "status"],
          where: { enrollmentId: { in: enrollments.map((e) => e.id) }, session: { deletedAt: null, ...(filters.from || filters.to ? { date } : {}) } },
          _count: { _all: true },
        })
      : [];
    const thresholdRow = await this.db.setting.findUnique({ where: { key: "ATTENDANCE_THRESHOLD" } });
    const threshold = Number(thresholdRow?.value ?? 80);
    const rows: ReportRow[] = enrollments.map((e) => {
      const of = (status: string) => counts.find((c) => c.enrollmentId === e.id && c.status === status)?._count._all ?? 0;
      const absences = of("ABSENT");
      const sessions = absences + of("PRESENT") + of("LATE") + of("JUSTIFIED");
      const percentage = sessions ? Math.round(((sessions - absences) / sessions) * 1000) / 10 : null;
      return {
        courseName: e.group.course.name, groupName: e.group.name, studentNumber: e.student.studentNumber, name: fullName(e.student),
        sessions, absences, lates: of("LATE"), justified: of("JUSTIFIED"), percentage,
        alert: percentage !== null && percentage < threshold ? t("exports.yes") : null,
      };
    });
    return {
      filters: { termId: term?.id, termName: term?.name ?? null, groupId: filters.groupId, from: filters.from, to: filters.to },
      columns: [col("courseName"), col("groupName"), col("studentNumber"), col("name"), col("sessions", "number"), col("absences", "number"),
        col("lates", "number"), col("justified", "number"), col("percentage", "percent"), col("alert")],
      rows,
      totals: { rows: rows.length, inAlert: rows.filter((r) => r.alert).length, threshold: threshold },
    };
  }

  private async paymentsPeriod(filters: ReportFilters) {
    const { from, to } = filters.from || filters.to
      ? { from: filters.from ?? "1900-01-01", to: filters.to ?? "2999-12-31" }
      : monthRange(todayInBusinessZone());
    const rows = await this.db.payment.findMany({
      where: {
        cancelledAt: null,
        date: { gte: toDbDay(from), lte: toDbDay(to) },
        ...(filters.termId ? { charge: { termId: filters.termId } } : {}),
      },
      include: { charge: { select: { description: true, student: { select: studentSelect }, concept: { select: { name: true } } } } },
      orderBy: [{ date: "asc" }, { receiptNumber: "asc" }],
    });
    const byMethod: Record<string, number> = {};
    for (const p of rows) byMethod[p.method] = sumOf([byMethod[p.method] ?? 0, p.amount]);
    return {
      filters: { from, to, termId: filters.termId },
      columns: [col("receiptNumber"), col("date", "date"), col("studentNumber"), col("name"), col("concept"), col("method"), col("amount", "money")],
      rows: rows.map((p) => ({
        receiptNumber: p.receiptNumber, date: fromDbDay(p.date), studentNumber: p.charge.student.studentNumber, name: fullName(p.charge.student),
        concept: p.charge.description ?? p.charge.concept.name, method: p.method, amount: Number(p.amount),
      })),
      totals: { rows: rows.length, amount: sumOf(rows.map((p) => p.amount)), ...byMethod },
    };
  }

  private async debts(filters: ReportFilters) {
    const today = todayInBusinessZone();
    const charges = await this.db.charge.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        ...(filters.termId ? { termId: filters.termId } : {}),
        ...(filters.to ? { dueDate: { lte: toDbDay(filters.to) } } : {}),
      },
      include: {
        student: { select: studentSelect },
        concept: { select: { name: true } },
        payments: { where: { cancelledAt: null }, select: { amount: true } },
      },
      orderBy: [{ dueDate: "asc" }],
    });
    const rows = charges
      .map((c) => {
        const total = chargeTotal(c.amount, c.discount);
        const paid = sumOf(c.payments.map((p) => p.amount));
        const dueDate = fromDbDay(c.dueDate);
        return {
          studentNumber: c.student.studentNumber, name: fullName(c.student), concept: c.description ?? c.concept.name,
          dueDate, total, paid, balance: balanceOf(total, paid), daysOverdue: Math.max(0, daysBetween(dueDate, today)),
        };
      })
      .filter((r) => r.balance > 0);
    return {
      filters: { termId: filters.termId, to: filters.to },
      columns: [col("studentNumber"), col("name"), col("concept"), col("dueDate", "date"), col("total", "money"),
        col("paid", "money"), col("balance", "money"), col("daysOverdue", "number")],
      rows,
      totals: {
        rows: rows.length,
        balance: sumOf(rows.map((r) => r.balance)),
        overdue: sumOf(rows.filter((r) => r.daysOverdue > 0).map((r) => r.balance)),
      },
    };
  }

  /** KPIs del tablero (M10 §5), calculados en vivo con el alcance de la persona. */
  async dashboard(user: UserPermissions): Promise<Dashboard> {
    const all = scopeOf(user, "reports.view") === "ALL";
    const scopedStudents = await this.studentScope(user);
    const studentWhere = (status: "ACTIVE" | "WITHDRAWN") => ({ AND: [{ status }, ...(scopedStudents ? [scopedStudents] : [])] });
    const [activeStudents, inactiveStudents, { term, groups }] = await Promise.all([
      this.db.student.count({ where: studentWhere("ACTIVE") }),
      this.db.student.count({ where: studentWhere("WITHDRAWN") }),
      this.scopedGroups(user, {}),
    ]);
    const occupancy = groups.map((g) => ({
      groupId: g.id, name: g.name, courseName: g.course.name, enrolledCount: g._count.enrollments, capacity: g.capacity,
      ratio: g.capacity ? Math.round((g._count.enrollments / g.capacity) * 1000) / 1000 : 0,
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
        this.db.payment.findMany({ where: { cancelledAt: null, date: { gte: since } }, select: { date: true, amount: true } }),
        this.debts({}),
      ]);
      const byMonth = new Map(months.map((m) => [m, [] as Prisma.Decimal[]]));
      for (const p of payments) byMonth.get(fromDbDay(p.date).slice(0, 7))?.push(p.amount);
      const incomeByMonth = months.map((month) => ({ month, total: sumOf(byMonth.get(month) ?? []) }));
      finance = {
        monthIncome: incomeByMonth[incomeByMonth.length - 1].total,
        totalDebt: debts.totals.balance,
        overdueDebt: debts.totals.overdue,
        incomeByMonth,
      };
    }
    return {
      termId: term?.id ?? null,
      termName: term?.name ?? null,
      activeStudents,
      inactiveStudents,
      groupOccupancy: { average, groups: occupancy },
      ...finance,
      generatedAt: new Date().toISOString(),
    };
  }
}
