export type ReportType =
  | "students-active"
  | "students-inactive"
  | "enrollments-by-group"
  | "grades-by-group"
  | "attendance-by-group"
  | "payments-period"
  | "debts"
  // M21 — indicadores ejecutivos
  | "dropout"
  | "performance-by-course"
  | "performance-by-teacher"
  | "enrollment-trend"
  | "delinquency"
  | "income-vs-projection";

export interface ReportCatalogItem {
  type: ReportType;
  title: string;
  financial: boolean;
}

export interface ReportFilters {
  termId?: string;
  levelId?: string;
  courseId?: string;
  groupId?: string;
  from?: string;
  to?: string;
  status?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: "text" | "number" | "money" | "date" | "percent";
}

export interface ReportResult {
  report: ReportType;
  title: string;
  generatedAt: string;
  filters: ReportFilters & { termName?: string | null };
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
}

export interface Dashboard {
  termId: string | null;
  termName: string | null;
  activeStudents: number;
  inactiveStudents: number;
  groupOccupancy: {
    average: number;
    groups: Array<{ groupId: string; name: string; courseName: string; enrolledCount: number; capacity: number; ratio: number }>;
  };
  monthIncome: number | null;
  totalDebt: number | null;
  overdueDebt: number | null;
  incomeByMonth: Array<{ month: string; total: number }> | null;
  generatedAt: string;
}

/** Valor de un indicador frente al ciclo anterior (M21). */
export interface Indicator {
  value: number | null;
  previous: number | null;
  delta: number | null;
  deltaPercent: number | null;
}

export type ExecutiveFilters = Pick<ReportFilters, "termId" | "levelId" | "courseId" | "groupId">;

export interface ExecutiveDashboard {
  term: { id: string; name: string } | null;
  previousTerm: { id: string; name: string } | null;
  indicators: {
    enrolledCount: Indicator;
    dropoutRate: Indicator;
    passRate: Indicator;
    averageGrade: Indicator;
    occupancy: Indicator;
    /** Solo con alcance institucional; `null` para el profesor. */
    delinquencyRate: Indicator | null;
    pendingAmount: Indicator | null;
    collected: Indicator | null;
    projected: Indicator | null;
  };
  enrollmentTrend: Array<{ termId: string; termName: string; initialCount: number; withdrawnCount: number; dropoutRate: number }>;
  incomeVsProjection: Array<{ month: string; projected: number; collected: number }> | null;
  generatedAt: string;
}
