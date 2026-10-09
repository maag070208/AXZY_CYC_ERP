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

/** Valor de un indicador frente al ciclo anterior (M21). */
export interface Indicator {
  value: number | null;
  previous: number | null;
  delta: number | null;
  deltaPercent: number | null;
}

export type ExecutiveFilters = Pick<ReportFilters, "termId" | "levelId" | "courseId" | "groupId">;

/** Fila de una tabla reciente del tablero (pago o movimiento de alumno). */
export interface RecentRow {
  id: string;
  label: string;
  description: string | null;
  amount: number | null;
  date: string;
  tone: "neutral" | "positive" | "warning" | "danger";
}

/** Grupo del ciclo con su ocupación (tablero de operación escolar). */
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

/** Alertas operativas del ciclo. Todo bloque puede faltar según alcance y datos. */
export interface DashboardAlerts {
  overdueDebt: {
    count: number;
    amount: number;
    students: Array<{ id: string; name: string; amount: number; days: number }>;
  } | null;
  pendingDocuments: { students: number; documents: number } | null;
  pendingDocumentList: Array<{ id: string; studentName: string; typeName: string; days: number }> | null;
  fullGroups: { count: number; groups: Array<{ groupId: string; label: string; ratio: number }> } | null;
  total: number;
}

/**
 * Tablero de Inicio (M21 ampliado): académico, financiero y operación escolar
 * del ciclo. Los bloques con montos vienen en `null` sin alcance institucional.
 */
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
    delinquencyRate: Indicator | null;
    pendingAmount: Indicator | null;
    collected: Indicator | null;
    projected: Indicator | null;
    expenses: Indicator | null;
  };
  movements: { withdrawals: number; reentries: number };
  enrollmentByLevel: Array<{ levelId: string; levelName: string; enrolledCount: number; share: number }>;
  enrollmentTrend: Array<{ termId: string; termName: string; initialCount: number; withdrawnCount: number; dropoutRate: number }>;
  incomeVsProjection: Array<{ month: string; projected: number; collected: number }> | null;
  incomeVsExpenses: Array<{ month: string; income: number; expenses: number }> | null;
  expenses: {
    total: number;
    paid: number;
    pending: number;
    count: number;
    byType: Array<{ type: string; label: string; total: number; count: number }>;
  } | null;
  financialPosition: { collected: number; receivable: number; overdue: number } | null;
  incomeByConcept: Array<{ concept: string; total: number; share: number }> | null;
  recentPayments: RecentRow[] | null;
  recentMovements: RecentRow[];
  groupsByOccupancy: GroupOccupancy[];
  alerts: DashboardAlerts;
  generatedAt: string;
}
