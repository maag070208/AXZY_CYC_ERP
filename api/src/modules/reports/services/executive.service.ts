import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { scopeOf, type UserPermissions } from "@core/permissions";
import { t, type MessageKey } from "@core/i18n";
import { fromDbDay, todayInBusinessZone } from "@core/utils/day";
import { groupScope } from "@modules/courses";
import { balanceOf, chargeTotal, sumOf } from "@modules/finance/models/entity/money";
import {
  average,
  indicator,
  rate,
  type ColumnType,
  type Indicator,
  type ReportColumn,
  type ReportFilters,
  type ReportResult,
  type ReportRow,
} from "../models/entity/report";

type ReportBody = Omit<ReportResult, "report" | "title" | "generatedAt">;
type TermRef = { id: string; name: string; startDate: Date; endDate: Date };

const col = (key: string, type: ColumnType = "text"): ReportColumn => ({
  key,
  label: t(`reports.columns.${key}` as MessageKey),
  type,
});

/** Inscripciones de un grupo reducidas a lo que usan los indicadores. */
interface GroupStats {
  groupId: string;
  groupName: string;
  courseId: string;
  courseName: string;
  levelId: string | null;
  levelName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  capacity: number;
  /** Matrícula inicial: toda inscripción que no salió por cambio de grupo. */
  initialCount: number;
  withdrawnCount: number;
  enrolledCount: number;
  passedCount: number;
  failedCount: number;
  finals: number[];
}

interface AcademicSummary {
  initialCount: number;
  withdrawnCount: number;
  enrolledCount: number;
  capacity: number;
  dropoutRate: number;
  passRate: number | null;
  averageGrade: number | null;
  occupancy: number;
}

interface FinanceSummary {
  projected: number;
  collected: number;
  dueCount: number;
  overdueCount: number;
  delinquencyRate: number;
  pendingAmount: number;
}

/** Un grupo del ciclo con su ocupación, para el panel de operación escolar. */
export interface GroupOccupancy {
  groupId: string;
  groupName: string;
  courseName: string;
  levelId: string | null;
  levelName: string | null;
  teacherName: string | null;
  enrolledCount: number;
  capacity: number;
  ratio: number;
  /** Promedio de las calificaciones finales escritas; `null` sin captura. */
  averageGrade: number | null;
}

/** Fila de una tabla reciente del tablero (pago o movimiento de alumno). */
export interface RecentRow {
  id: string;
  label: string;
  description: string | null;
  amount: number | null;
  date: string;
  tone: "neutral" | "positive" | "warning" | "danger";
}

/** Alertas operativas del ciclo. */
export interface DashboardAlerts {
  overdueDebt: { count: number; amount: number; students: Array<{ id: string; name: string; amount: number; days: number }> } | null;
  pendingDocuments: { students: number; documents: number } | null;
  /** Documentos sin validar del ciclo (sin datos personales). */
  pendingDocumentList: Array<{ id: string; studentName: string; typeName: string; days: number }> | null;
  fullGroups: { count: number; groups: Array<{ groupId: string; label: string; ratio: number }> } | null;
  total: number;
}

export interface ExecutiveDashboard {
  term: { id: string; name: string; startDate: string; endDate: string } | null;
  previousTerm: { id: string; name: string } | null;
  indicators: {
    enrolledCount: Indicator;
    dropoutRate: Indicator;
    passRate: Indicator;
    averageGrade: Indicator;
    occupancy: Indicator;
    attendanceRate: Indicator;
    pendingDocuments: Indicator | null;
    /** Solo con alcance institucional (ALL); `null` para el profesor. */
    delinquencyRate: Indicator | null;
    pendingAmount: Indicator | null;
    collected: Indicator | null;
    projected: Indicator | null;
    expenses: Indicator | null;
  };
  /** Bajas y reingresos del ciclo, útiles para leer la tendencia. */
  movements: { withdrawals: number; reentries: number };
  /** Alumnos inscritos por nivel educativo (gráfica de distribución). */
  enrollmentByLevel: Array<{ levelId: string; levelName: string; enrolledCount: number; share: number }>;
  enrollmentTrend: Array<{ termId: string; termName: string; initialCount: number; withdrawnCount: number; dropoutRate: number }>;
  /** Cobrado contra proyectado por mes de vencimiento (M21). */
  incomeVsProjection: Array<{ month: string; projected: number; collected: number }> | null;
  /** Ingresos (cobrado) contra gastos por mes; `null` sin alcance institucional. */
  incomeVsExpenses: Array<{ month: string; income: number; expenses: number }> | null;
  expenses: { total: number; paid: number; pending: number; count: number; byType: Array<{ type: string; label: string; total: number; count: number }> } | null;
  /** Cartera: cobrado, por cobrar y vencido del ciclo. */
  financialPosition: { collected: number; receivable: number; overdue: number } | null;
  /** Cobrado del ciclo por concepto de cobro (barras horizontales). */
  incomeByConcept: Array<{ concept: string; total: number; share: number }> | null;
  recentPayments: RecentRow[] | null;
  recentMovements: RecentRow[];
  /** Grupos con mayor ocupación del ciclo (máximo 5). */
  groupsByOccupancy: GroupOccupancy[];
  alerts: DashboardAlerts;
  generatedAt: string;
}

const OCCUPANCY_ALERT = 0.8;
const MAX_RECENT = 5;
const MAX_ALERTS = 5;

const summarize = (groups: readonly GroupStats[]): AcademicSummary => {
  const total = (pick: (g: GroupStats) => number) => groups.reduce((sum, g) => sum + pick(g), 0);
  const initialCount = total((g) => g.initialCount);
  const withdrawnCount = total((g) => g.withdrawnCount);
  const enrolledCount = total((g) => g.enrolledCount);
  const capacity = total((g) => g.capacity);
  const graded = total((g) => g.passedCount + g.failedCount);
  return {
    initialCount,
    withdrawnCount,
    enrolledCount,
    capacity,
    dropoutRate: rate(withdrawnCount, initialCount),
    passRate: graded ? rate(total((g) => g.passedCount), graded) : null,
    averageGrade: average(groups.flatMap((g) => g.finals)),
    occupancy: rate(enrolledCount, capacity),
  };
};

/** Días naturales transcurridos desde `day` hasta hoy (nunca negativos). */
const daysSince = (day: string, today: string): number =>
  Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000));

/**
 * Indicadores ejecutivos (M21) y tablero de Inicio (M21 ampliado): académico,
 * financiero y operación escolar del ciclo, comparados con el anterior. Solo
 * lectura y siempre con el alcance de `reports.view`: el profesor ve sus grupos
 * y nunca montos. Se calcula en vivo; no hay vistas materializadas mientras el
 * volumen no lo pida.
 */
export class ExecutiveService {
  constructor(private readonly db: PrismaClient = prismaClient) {}

  private async term(termId: string | undefined): Promise<TermRef | null> {
    const select = { id: true, name: true, startDate: true, endDate: true } as const;
    if (termId) {
      const term = await this.db.term.findUnique({ where: { id: termId }, select });
      if (!term) throw new HttpError(400, "TERM_NOT_FOUND");
      return term;
    }
    return this.db.term.findFirst({ where: { active: true }, select });
  }

  private previousTerm(term: TermRef): Promise<TermRef | null> {
    return this.db.term.findFirst({
      where: { startDate: { lt: term.startDate } },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
  }

  /** Grupos del ciclo dentro del alcance y de los filtros, con sus inscripciones resumidas. */
  private async groupStats(user: UserPermissions, termId: string | null, filters: ReportFilters): Promise<GroupStats[]> {
    const scoped = await groupScope(user, "reports.view");
    const course: Prisma.CourseWhereInput = { ...(filters.levelId ? { levelId: filters.levelId } : {}) };
    const groups = await this.db.group.findMany({
      where: {
        AND: [
          ...(termId ? [{ termId }] : []),
          ...(filters.courseId ? [{ courseId: filters.courseId }] : []),
          ...(filters.groupId ? [{ id: filters.groupId }] : []),
          ...(filters.levelId ? [{ course }] : []),
          ...(scoped ? [scoped] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        capacity: true,
        courseId: true,
        teacherId: true,
        course: { select: { name: true, level: { select: { id: true, name: true } } } },
        teacher: { select: { firstNames: true, surnames: true } },
        enrollments: { select: { status: true, finalGrade: true, transferredToId: true } },
      },
      orderBy: [{ course: { name: "asc" } }, { name: "asc" }],
    });
    return groups.map((g) => {
      // Un cambio de grupo deja la inscripción de origen en baja apuntando al destino: no es deserción.
      const own = g.enrollments.filter((e) => e.transferredToId === null);
      return {
        groupId: g.id,
        groupName: g.name,
        courseId: g.courseId,
        courseName: g.course.name,
        levelId: g.course.level?.id ?? null,
        levelName: g.course.level?.name ?? null,
        teacherId: g.teacherId,
        teacherName: g.teacher ? `${g.teacher.firstNames} ${g.teacher.surnames}` : null,
        capacity: g.capacity,
        initialCount: own.length,
        withdrawnCount: own.filter((e) => e.status === "WITHDRAWN").length,
        enrolledCount: own.filter((e) => e.status !== "WITHDRAWN").length,
        passedCount: own.filter((e) => e.status === "PASSED").length,
        failedCount: own.filter((e) => e.status === "FAILED").length,
        finals: own.filter((e) => e.finalGrade !== null && e.status !== "WITHDRAWN").map((e) => Number(e.finalGrade)),
      };
    });
  }

  /** Cargos vigentes del ciclo (o de todos) con lo cobrado: base de morosidad y proyección. */
  private async charges(termId: string | null) {
    const rows = await this.db.charge.findMany({
      where: { status: { not: "CANCELLED" }, ...(termId ? { termId } : {}) },
      select: {
        amount: true,
        discount: true,
        dueDate: true,
        concept: { select: { name: true } },
        payments: { where: { cancelledAt: null }, select: { amount: true } },
      },
    });
    const today = todayInBusinessZone();
    return rows.map((c) => {
      const total = chargeTotal(c.amount, c.discount);
      const paid = sumOf(c.payments.map((p) => p.amount));
      const dueDate = fromDbDay(c.dueDate);
      return { concept: c.concept.name, total, paid, balance: balanceOf(total, paid), dueDate, due: dueDate <= today };
    });
  }

  private async finance(termId: string | null): Promise<FinanceSummary> {
    const charges = await this.charges(termId);
    const due = charges.filter((c) => c.due);
    const overdue = due.filter((c) => c.balance > 0);
    return {
      projected: sumOf(charges.map((c) => c.total)),
      collected: sumOf(charges.map((c) => c.paid)),
      dueCount: due.length,
      overdueCount: overdue.length,
      delinquencyRate: rate(overdue.length, due.length),
      pendingAmount: sumOf(overdue.map((c) => c.balance)),
    };
  }

  /** Por mes de vencimiento: lo proyectado (cargos que vencen) contra lo ya cobrado de esos cargos. */
  private async incomeByMonth(termId: string | null): Promise<Array<{ month: string; projected: number; collected: number }>> {
    const byMonth = new Map<string, { projected: number[]; collected: number[] }>();
    for (const charge of await this.charges(termId)) {
      const month = charge.dueDate.slice(0, 7);
      const bucket = byMonth.get(month) ?? { projected: [], collected: [] };
      bucket.projected.push(charge.total);
      bucket.collected.push(charge.paid);
      byMonth.set(month, bucket);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bucket]) => ({ month, projected: sumOf(bucket.projected), collected: sumOf(bucket.collected) }));
  }

  /**
   * Ingresos (cobrado) contra **gastos** por mes del ciclo. Los cargos se
   * agrupan por su mes de vencimiento y los gastos por su fecha: son las dos
   * series que el tablero dibuja juntas. Vive aquí, y no en el módulo de
   * gastos, para no invertir la dependencia (reportes → gastos → finanzas).
   */
  private async expenseSeries(termId: string | null): Promise<Array<{ month: string; total: number }>> {
    const rows = await this.db.expense.findMany({
      where: { status: { not: "CANCELLED" }, ...(termId ? { OR: [{ termId }, { termId: null }] } : {}) },
      select: { date: true, amount: true },
      orderBy: { date: "asc" },
    });
    const byMonth = new Map<string, number[]>();
    for (const row of rows) {
      const month = fromDbDay(row.date).slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), Number(row.amount)]);
    }
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amounts]) => ({ month, total: sumOf(amounts) }));
  }

  private async expenseSummary(termId: string | null) {
    const rows = await this.db.expense.findMany({
      where: { status: { not: "CANCELLED" }, ...(termId ? { OR: [{ termId }, { termId: null }] } : {}) },
      select: { type: true, amount: true, status: true },
    });
    const byType = new Map<string, number[]>();
    for (const row of rows) byType.set(row.type, [...(byType.get(row.type) ?? []), Number(row.amount)]);
    return {
      total: sumOf(rows.map((row) => row.amount)),
      paid: sumOf(rows.filter((row) => row.status === "PAID").map((row) => row.amount)),
      pending: sumOf(rows.filter((row) => row.status === "PENDING").map((row) => row.amount)),
      count: rows.length,
      byType: [...byType.entries()]
        .map(([type, amounts]) => ({ type, label: t(`expenses.types.${type}` as MessageKey), total: sumOf(amounts), count: amounts.length }))
        .sort((a, b) => b.total - a.total),
    };
  }

  /** Cobrado del ciclo por concepto de cobro, con su participación. */
  private async incomeByConcept(termId: string | null): Promise<Array<{ concept: string; total: number; share: number }>> {
    const charges = await this.charges(termId);
    const byConcept = new Map<string, number[]>();
    for (const charge of charges) byConcept.set(charge.concept, [...(byConcept.get(charge.concept) ?? []), charge.paid]);
    const totals = [...byConcept.entries()]
      .map(([concept, paid]) => ({ concept, total: sumOf(paid) }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
    const all = sumOf(totals.map((row) => row.total));
    return totals.map((row) => ({ ...row, share: rate(row.total, all) }));
  }

  /** Tasa de asistencia del ciclo/filtros: presente o retardo sobre lo registrado. */
  private attendanceScope(user: UserPermissions, termId: string | null, filters: ReportFilters): Prisma.AttendanceWhereInput {
    const group: Prisma.GroupWhereInput = {
      ...(termId ? { termId } : {}),
      ...(filters.courseId ? { courseId: filters.courseId } : {}),
      ...(filters.groupId ? { id: filters.groupId } : {}),
      ...(filters.levelId ? { course: { levelId: filters.levelId } } : {}),
    };
    return { session: { deletedAt: null, group } };
  }

  private async attendance(
    user: UserPermissions,
    termId: string | null,
    filters: ReportFilters
  ): Promise<number | null> {
    const scoped = await groupScope(user, "reports.view");
    const where = this.attendanceScope(user, termId, filters);
    const group = where.session && typeof where.session === "object" ? (where.session as { group: Prisma.GroupWhereInput }).group : {};
    const records = await this.db.attendance.findMany({
      where: { ...where, ...(scoped ? { enrollment: { group: { AND: [group, scoped] } } } : {}) },
      select: { status: true },
    });
    if (records.length === 0) return null;
    const attended = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
    return rate(attended, records.length);
  }

  /**
   * Expedientes incompletos: por cada alumno activo con inscripción vigente en
   * el ciclo se esperan los tipos de documento marcados como obligatorios. Es
   * una carencia administrativa, no una alerta por alumno.
   */
  private async pendingDocuments(
    user: UserPermissions,
    termId: string | null,
    filters: ReportFilters
  ): Promise<{ students: number; documents: number; list: Array<{ id: string; studentName: string; typeName: string; days: number }> }> {
    const [required, scoped] = await Promise.all([
      this.db.documentType.findMany({ where: { required: true, active: true }, select: { id: true } }),
      groupScope(user, "reports.view"),
    ]);
    const empty = { students: 0, documents: 0, list: [] };
    if (required.length === 0) return empty;
    const enrollment: Prisma.EnrollmentWhereInput = {
      status: { not: "WITHDRAWN" },
      group: {
        ...(termId ? { termId } : {}),
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.groupId ? { id: filters.groupId } : {}),
        ...(filters.levelId ? { course: { levelId: filters.levelId } } : {}),
        ...(scoped ? scoped : {}),
      },
    };
    const documents = await this.db.document.findMany({
      where: {
        deletedAt: null,
        documentTypeId: { in: required.map((type) => type.id) },
        student: { enrollments: { some: enrollment } },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        student: { select: { id: true, firstNames: true, paternalSurname: true } },
        documentType: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const pending = documents.filter((doc) => doc.status !== "VALIDATED");
    const today = todayInBusinessZone();
    return {
      students: new Set(pending.map((doc) => doc.student.id)).size,
      documents: pending.length,
      list: pending.slice(0, MAX_ALERTS).map((doc) => ({
        id: doc.id,
        studentName: `${doc.student.firstNames} ${doc.student.paternalSurname}`,
        typeName: doc.documentType.name,
        days: daysSince(fromDbDay(doc.createdAt), today),
      })),
    };
  }

  /**
   * Alumnos con adeudo vencido: cargos con saldo y vencimiento anterior a hoy,
   * agrupados por alumno y ordenados por monto (los de mayor riesgo primero).
   */
  private async overdueAlerts(
    termId: string | null
  ): Promise<{ count: number; amount: number; students: Array<{ id: string; name: string; amount: number; days: number }> }> {
    const today = todayInBusinessZone();
    const rows = await this.db.charge.findMany({
      where: { status: { not: "CANCELLED" }, dueDate: { lt: new Date(`${today}T00:00:00.000Z`) }, ...(termId ? { termId } : {}) },
      select: {
        amount: true,
        discount: true,
        dueDate: true,
        student: { select: { id: true, firstNames: true, paternalSurname: true } },
        payments: { where: { cancelledAt: null }, select: { amount: true } },
      },
    });
    const byStudent = new Map<string, { name: string; amounts: number[]; oldest: string }>();
    for (const row of rows) {
      const balance = balanceOf(chargeTotal(row.amount, row.discount), sumOf(row.payments.map((p) => p.amount)));
      if (balance <= 0) continue;
      const due = fromDbDay(row.dueDate);
      const bucket = byStudent.get(row.student.id) ?? {
        name: `${row.student.firstNames} ${row.student.paternalSurname}`,
        amounts: [],
        oldest: due,
      };
      bucket.amounts.push(balance);
      if (due < bucket.oldest) bucket.oldest = due;
      byStudent.set(row.student.id, bucket);
    }
    const students = [...byStudent.entries()]
      .map(([id, bucket]) => ({ id, name: bucket.name, amount: sumOf(bucket.amounts), days: daysSince(bucket.oldest, today) }))
      .sort((a, b) => b.amount - a.amount);
    return { count: students.length, amount: sumOf(students.map((row) => row.amount)), students: students.slice(0, MAX_ALERTS) };
  }

  private async recentPayments(termId: string | null): Promise<RecentRow[]> {
    const rows = await this.db.payment.findMany({
      where: { cancelledAt: null, ...(termId ? { charge: { termId } } : {}) },
      select: {
        id: true,
        amount: true,
        date: true,
        receiptNumber: true,
        charge: {
          select: {
            concept: { select: { name: true } },
            student: { select: { firstNames: true, paternalSurname: true } },
          },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: MAX_RECENT,
    });
    return rows.map((row) => ({
      id: row.id,
      label: `${row.charge.student.firstNames} ${row.charge.student.paternalSurname}`,
      description: `${row.charge.concept.name} · ${row.receiptNumber}`,
      amount: Number(row.amount),
      date: fromDbDay(row.date),
      tone: "positive" as const,
    }));
  }

  private async recentMovements(term: TermRef | null): Promise<RecentRow[]> {
    const rows = await this.db.studentMovement.findMany({
      where: term ? { date: { gte: term.startDate, lte: term.endDate } } : {},
      select: {
        id: true,
        type: true,
        date: true,
        reason: true,
        student: { select: { firstNames: true, paternalSurname: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: MAX_RECENT,
    });
    return rows.map((row) => ({
      id: row.id,
      label: `${row.student.firstNames} ${row.student.paternalSurname}`,
      description: row.reason,
      amount: null,
      date: fromDbDay(row.date),
      tone: row.type === "WITHDRAWAL" ? ("warning" as const) : ("neutral" as const),
    }));
  }

  private async movementCounts(term: TermRef | null): Promise<{ withdrawals: number; reentries: number }> {
    const range = term ? { date: { gte: term.startDate, lte: term.endDate } } : {};
    const [withdrawals, reentries] = await Promise.all([
      this.db.studentMovement.count({ where: { ...range, type: "WITHDRAWAL" } }),
      this.db.studentMovement.count({ where: { ...range, type: "REENTRY" } }),
    ]);
    return { withdrawals, reentries };
  }

  /** El ciclo indicado y los `limit - 1` anteriores, del más antiguo al más reciente. */
  private async trend(user: UserPermissions, filters: ReportFilters, upTo: TermRef | null, limit: number) {
    const terms = await this.db.term.findMany({
      where: upTo ? { startDate: { lte: upTo.startDate } } : {},
      orderBy: { startDate: "desc" },
      take: limit,
      select: { id: true, name: true },
    });
    const rows = await Promise.all(
      terms.reverse().map(async (term) => {
        const summary = summarize(await this.groupStats(user, term.id, { levelId: filters.levelId, courseId: filters.courseId }));
        return { termId: term.id, termName: term.name, initialCount: summary.initialCount, withdrawnCount: summary.withdrawnCount, dropoutRate: summary.dropoutRate };
      })
    );
    return rows;
  }

  // --- reportes -----------------------------------------------------------------

  async dropout(user: UserPermissions, filters: ReportFilters): Promise<ReportBody> {
    const term = await this.term(filters.termId);
    const groups = await this.groupStats(user, term?.id ?? null, filters);
    const summary = summarize(groups);
    return {
      filters: { ...filters, termId: term?.id, termName: term?.name ?? null },
      columns: [col("courseName"), col("groupName"), col("teacherName"), col("initialCount", "number"), col("withdrawnCount", "number"), col("dropoutRate", "percent")],
      rows: groups.map((g) => ({
        courseName: g.courseName, groupName: g.groupName, teacherName: g.teacherName,
        initialCount: g.initialCount, withdrawnCount: g.withdrawnCount, dropoutRate: rate(g.withdrawnCount, g.initialCount),
      })),
      totals: { rows: groups.length, initialCount: summary.initialCount, withdrawnCount: summary.withdrawnCount, dropoutRate: summary.dropoutRate },
    };
  }

  private async performance(user: UserPermissions, filters: ReportFilters, by: "course" | "teacher"): Promise<ReportBody> {
    const term = await this.term(filters.termId);
    const groups = await this.groupStats(user, term?.id ?? null, filters);
    const buckets = new Map<string, { label: string | null; groups: GroupStats[] }>();
    for (const g of groups) {
      const key = by === "course" ? g.courseId : (g.teacherId ?? "");
      const bucket = buckets.get(key) ?? { label: by === "course" ? g.courseName : g.teacherName, groups: [] };
      bucket.groups.push(g);
      buckets.set(key, bucket);
    }
    const labelKey = by === "course" ? "courseName" : "teacherName";
    const rows: ReportRow[] = [...buckets.values()]
      .map((bucket) => {
        const s = summarize(bucket.groups);
        const passedCount = bucket.groups.reduce((sum, g) => sum + g.passedCount, 0);
        const failedCount = bucket.groups.reduce((sum, g) => sum + g.failedCount, 0);
        return {
          [labelKey]: bucket.label ?? t("labels.unassigned"), groupCount: bucket.groups.length, enrolledCount: s.enrolledCount,
          average: s.averageGrade, passedCount, failedCount, passRate: s.passRate,
        };
      })
      .sort((a, b) => String(a[labelKey]).localeCompare(String(b[labelKey])));
    const summary = summarize(groups);
    return {
      filters: { ...filters, termId: term?.id, termName: term?.name ?? null },
      columns: [col(labelKey), col("groupCount", "number"), col("enrolledCount", "number"), col("average", "number"),
        col("passedCount", "number"), col("failedCount", "number"), col("passRate", "percent")],
      rows,
      totals: { rows: rows.length, enrolledCount: summary.enrolledCount, average: summary.averageGrade ?? 0, passRate: summary.passRate ?? 0 },
    };
  }

  performanceByCourse = (user: UserPermissions, filters: ReportFilters) => this.performance(user, filters, "course");
  performanceByTeacher = (user: UserPermissions, filters: ReportFilters) => this.performance(user, filters, "teacher");

  async enrollmentTrend(user: UserPermissions, filters: ReportFilters): Promise<ReportBody> {
    const trend = await this.trend(user, filters, await this.term(filters.termId), 8);
    const rows: ReportRow[] = trend.map((row, index) => ({
      termName: row.termName, initialCount: row.initialCount, withdrawnCount: row.withdrawnCount, dropoutRate: row.dropoutRate,
      variation: index === 0 ? null : indicator(row.initialCount, trend[index - 1].initialCount).deltaPercent,
    }));
    return {
      filters: { termId: filters.termId, levelId: filters.levelId, courseId: filters.courseId },
      columns: [col("termName"), col("initialCount", "number"), col("withdrawnCount", "number"), col("dropoutRate", "percent"), col("variation", "percent")],
      rows,
      totals: { rows: rows.length },
    };
  }

  async delinquency(filters: ReportFilters): Promise<ReportBody> {
    const term = filters.termId ? await this.term(filters.termId) : null;
    const charges = (await this.charges(term?.id ?? null)).filter((c) => c.due);
    const byConcept = new Map<string, typeof charges>();
    for (const charge of charges) byConcept.set(charge.concept, [...(byConcept.get(charge.concept) ?? []), charge]);
    const rows: ReportRow[] = [...byConcept.entries()]
      .map(([concept, list]) => {
        const overdue = list.filter((c) => c.balance > 0);
        return { concept, dueCount: list.length, overdueCount: overdue.length, delinquencyRate: rate(overdue.length, list.length), balance: sumOf(overdue.map((c) => c.balance)) };
      })
      .sort((a, b) => String(a.concept).localeCompare(String(b.concept)));
    const overdue = charges.filter((c) => c.balance > 0);
    return {
      filters: { termId: term?.id, termName: term?.name ?? null },
      columns: [col("concept"), col("dueCount", "number"), col("overdueCount", "number"), col("delinquencyRate", "percent"), col("balance", "money")],
      rows,
      totals: { rows: rows.length, dueCount: charges.length, overdueCount: overdue.length, delinquencyRate: rate(overdue.length, charges.length), balance: sumOf(overdue.map((c) => c.balance)) },
    };
  }

  async incomeVsProjection(filters: ReportFilters): Promise<ReportBody> {
    const term = filters.termId ? await this.term(filters.termId) : null;
    const months = await this.incomeByMonth(term?.id ?? null);
    const projected = sumOf(months.map((m) => m.projected));
    const collected = sumOf(months.map((m) => m.collected));
    return {
      filters: { termId: term?.id, termName: term?.name ?? null },
      columns: [col("month"), col("projected", "money"), col("collected", "money"), col("difference", "money"), col("percentage", "percent")],
      rows: months.map((m) => ({
        month: m.month, projected: m.projected, collected: m.collected,
        difference: sumOf([m.collected, -m.projected]), percentage: rate(m.collected, m.projected),
      })),
      totals: { rows: months.length, projected, collected, difference: sumOf([collected, -projected]), percentage: rate(collected, projected) },
    };
  }

  // --- tablero --------------------------------------------------------------------

  /**
   * Indicadores del ciclo comparados con el ciclo anterior (M21 §4.3) más el
   * detalle operativo del tablero de Inicio: gastos, cartera, alertas, pagos
   * recientes, movimientos y grupos con mayor ocupación. El bloque financiero
   * completo solo existe con alcance institucional (`reports.view = ALL`).
   */
  async dashboard(user: UserPermissions, filters: ReportFilters): Promise<ExecutiveDashboard> {
    const all = scopeOf(user, "reports.view") === "ALL";
    const term = await this.term(filters.termId);
    const previousTerm = term ? await this.previousTerm(term) : null;
    const [current, previous, previousExpenses] = await Promise.all([
      this.groupStats(user, term?.id ?? null, filters).then(summarize),
      // El grupo es de un solo ciclo: en el anterior solo aplican nivel y curso.
      previousTerm ? this.groupStats(user, previousTerm.id, { levelId: filters.levelId, courseId: filters.courseId }).then(summarize) : null,
      all && previousTerm ? this.expenseSummary(previousTerm.id) : null,
    ]);
    const [attendance, documents, movements] = await Promise.all([
      this.attendance(user, term?.id ?? null, filters),
      this.pendingDocuments(user, term?.id ?? null, filters),
      this.movementCounts(term),
    ]);
    const occupancyRows: GroupOccupancy[] = (await this.groupStats(user, term?.id ?? null, filters))
      .filter((group) => group.capacity > 0)
      .map((group) => ({
        groupId: group.groupId,
        groupName: group.groupName,
        courseName: group.courseName,
        levelId: group.levelId,
        levelName: group.levelName,
        teacherName: group.teacherName,
        enrolledCount: group.enrolledCount,
        capacity: group.capacity,
        ratio: group.capacity > 0 ? Math.round((group.enrolledCount / group.capacity) * 1000) / 1000 : 0,
        averageGrade: average(group.finals),
      }))
      .sort((a, b) => b.ratio - a.ratio);
    const fullGroups = occupancyRows.filter((group) => group.ratio >= OCCUPANCY_ALERT);
    const byLevel = new Map<string, { name: string; enrolledCount: number }>();
    for (const group of occupancyRows) {
      const key = group.levelId ?? "";
      const bucket = byLevel.get(key) ?? { name: group.levelName ?? t("labels.unknown"), enrolledCount: 0 };
      bucket.enrolledCount += group.enrolledCount;
      byLevel.set(key, bucket);
    }
    const enrollmentByLevel = [...byLevel.entries()]
      .map(([levelId, bucket]) => ({ levelId, levelName: bucket.name, enrolledCount: bucket.enrolledCount, share: rate(bucket.enrolledCount, current.enrolledCount) }))
      .sort((a, b) => b.enrolledCount - a.enrolledCount);

    // Bloque financiero: solo con alcance institucional. `null` para el profesor.
    const [money, previousMoney, incomeVsProjection, expenses, expenseMonths, incomeByConcept, overdue, payments, enrollmentTrend, recentMovements] = await Promise.all([
      all ? this.finance(term?.id ?? null) : null,
      all && previousTerm ? this.finance(previousTerm.id) : null,
      all ? this.incomeByMonth(term?.id ?? null) : null,
      all ? this.expenseSummary(term?.id ?? null) : null,
      all ? this.expenseSeries(term?.id ?? null) : null,
      all ? this.incomeByConcept(term?.id ?? null) : null,
      all ? this.overdueAlerts(term?.id ?? null) : null,
      all ? this.recentPayments(term?.id ?? null) : null,
      this.trend(user, filters, term, 6),
      this.recentMovements(term),
    ]);
    const months = new Set<string>([
      ...(incomeVsProjection ?? []).map((row) => row.month),
      ...(expenseMonths ?? []).map((row) => row.month),
    ]);
    const incomeVsExpenses = all
      ? [...months]
          .sort((a, b) => a.localeCompare(b))
          .map((month) => ({
            month,
            income: (incomeVsProjection ?? []).find((row) => row.month === month)?.collected ?? 0,
            expenses: (expenseMonths ?? []).find((row) => row.month === month)?.total ?? 0,
          }))
      : null;
    const alerts: DashboardAlerts = {
      overdueDebt: overdue && overdue.count > 0 ? overdue : null,
      pendingDocuments: documents.documents > 0 ? { students: documents.students, documents: documents.documents } : null,
      pendingDocumentList: documents.list.length > 0 ? documents.list : null,
      fullGroups: fullGroups.length > 0 ? { count: fullGroups.length, groups: fullGroups.slice(0, MAX_ALERTS).map((group) => ({ groupId: group.groupId, label: `${group.courseName} · ${group.groupName}`, ratio: group.ratio })) } : null,
      total: 0,
    };
    alerts.total =
      (alerts.overdueDebt ? 1 : 0) + (alerts.pendingDocuments ? 1 : 0) + (alerts.fullGroups ? 1 : 0);

    return {
      term: term && { id: term.id, name: term.name, startDate: fromDbDay(term.startDate), endDate: fromDbDay(term.endDate) },
      previousTerm: previousTerm && { id: previousTerm.id, name: previousTerm.name },
      indicators: {
        enrolledCount: indicator(current.initialCount, previous?.initialCount ?? null),
        dropoutRate: indicator(current.dropoutRate, previous?.dropoutRate ?? null),
        passRate: indicator(current.passRate, previous?.passRate ?? null),
        averageGrade: indicator(current.averageGrade, previous?.averageGrade ?? null),
        occupancy: indicator(current.occupancy, previous?.occupancy ?? null),
        attendanceRate: indicator(attendance, null),
        pendingDocuments: documents.documents > 0 ? indicator(documents.documents, null) : null,
        delinquencyRate: money && indicator(money.delinquencyRate, previousMoney?.delinquencyRate ?? null),
        pendingAmount: money && indicator(money.pendingAmount, previousMoney?.pendingAmount ?? null),
        collected: money && indicator(money.collected, previousMoney?.collected ?? null),
        projected: money && indicator(money.projected, previousMoney?.projected ?? null),
        expenses: expenses && indicator(expenses.total, previousExpenses?.total ?? null),
      },
      movements,
      enrollmentByLevel,
      enrollmentTrend,
      incomeVsProjection,
      incomeVsExpenses,
      expenses: expenses && { total: expenses.total, paid: expenses.paid, pending: expenses.pending, count: expenses.count, byType: expenses.byType },
      financialPosition: money && {
        collected: money.collected,
        receivable: money.projected - money.collected,
        overdue: money.pendingAmount,
      },
      incomeByConcept,
      recentPayments: payments,
      recentMovements,
      groupsByOccupancy: occupancyRows.slice(0, 5),
      alerts,
      generatedAt: new Date().toISOString(),
    };
  }
}
