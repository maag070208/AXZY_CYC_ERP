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

export interface ExecutiveDashboard {
  term: { id: string; name: string } | null;
  previousTerm: { id: string; name: string } | null;
  indicators: {
    enrolledCount: Indicator;
    dropoutRate: Indicator;
    passRate: Indicator;
    averageGrade: Indicator;
    occupancy: Indicator;
    /** Solo con alcance institucional (ALL); `null` para el profesor. */
    delinquencyRate: Indicator | null;
    pendingAmount: Indicator | null;
    collected: Indicator | null;
    projected: Indicator | null;
  };
  enrollmentTrend: Array<{ termId: string; termName: string; initialCount: number; withdrawnCount: number; dropoutRate: number }>;
  incomeVsProjection: Array<{ month: string; projected: number; collected: number }> | null;
  generatedAt: string;
}

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

/**
 * Indicadores ejecutivos (M21): deserción, rendimiento, ocupación, tendencia de
 * inscripciones, morosidad e ingresos contra proyección. Solo lectura y siempre
 * con el alcance de `reports.view`: el profesor ve sus grupos y nunca montos.
 * Se calcula en vivo; no hay vistas materializadas mientras el volumen no lo pida.
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
        course: { select: { name: true } },
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

  /** Indicadores del ciclo comparados con el ciclo anterior (M21 §4.3). */
  async dashboard(user: UserPermissions, filters: ReportFilters): Promise<ExecutiveDashboard> {
    const all = scopeOf(user, "reports.view") === "ALL";
    const term = await this.term(filters.termId);
    const previousTerm = term ? await this.previousTerm(term) : null;
    const [current, previous] = await Promise.all([
      this.groupStats(user, term?.id ?? null, filters).then(summarize),
      // El grupo es de un solo ciclo: en el anterior solo aplican nivel y curso.
      previousTerm ? this.groupStats(user, previousTerm.id, { levelId: filters.levelId, courseId: filters.courseId }).then(summarize) : null,
    ]);
    const [money, previousMoney, incomeVsProjection, enrollmentTrend] = await Promise.all([
      all ? this.finance(term?.id ?? null) : null,
      all && previousTerm ? this.finance(previousTerm.id) : null,
      all ? this.incomeByMonth(term?.id ?? null) : null,
      this.trend(user, filters, term, 6),
    ]);
    return {
      term: term && { id: term.id, name: term.name },
      previousTerm: previousTerm && { id: previousTerm.id, name: previousTerm.name },
      indicators: {
        enrolledCount: indicator(current.initialCount, previous?.initialCount ?? null),
        dropoutRate: indicator(current.dropoutRate, previous?.dropoutRate ?? null),
        passRate: indicator(current.passRate, previous?.passRate ?? null),
        averageGrade: indicator(current.averageGrade, previous?.averageGrade ?? null),
        occupancy: indicator(current.occupancy, previous?.occupancy ?? null),
        delinquencyRate: money && indicator(money.delinquencyRate, previousMoney?.delinquencyRate ?? null),
        pendingAmount: money && indicator(money.pendingAmount, previousMoney?.pendingAmount ?? null),
        collected: money && indicator(money.collected, previousMoney?.collected ?? null),
        projected: money && indicator(money.projected, previousMoney?.projected ?? null),
      },
      enrollmentTrend,
      incomeVsProjection,
      generatedAt: new Date().toISOString(),
    };
  }
}
