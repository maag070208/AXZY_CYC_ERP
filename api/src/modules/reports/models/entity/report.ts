/**
 * Contrato de un reporte (M10): columnas tipadas, filas planas y totales.
 * Lo mismo alimenta JSON, XLSX y PDF (M10 §4.7: mismos filtros, mismo dato).
 */
export type ColumnType = "text" | "number" | "money" | "date" | "percent";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export type ReportRow = Record<string, string | number | null>;

export interface ReportFilters {
  termId?: string;
  /** M21: nivel y curso acotan los indicadores académicos. */
  levelId?: string;
  courseId?: string;
  groupId?: string;
  from?: string;
  to?: string;
  status?: string;
}

export interface ReportResult {
  report: string;
  title: string;
  generatedAt: string;
  filters: ReportFilters & { termName?: string | null };
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, number>;
}

export const REPORT_TYPES = [
  "students-active",
  "students-inactive",
  "enrollments-by-group",
  "grades-by-group",
  "attendance-by-group",
  "payments-period",
  "debts",
  // M21 — indicadores ejecutivos
  "dropout",
  "performance-by-course",
  "performance-by-teacher",
  "enrollment-trend",
  "delinquency",
  "income-vs-projection",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Reportes con montos: solo con alcance institucional (el profesor no ve dinero). */
export const FINANCIAL_REPORTS: readonly ReportType[] = ["payments-period", "debts", "delinquency", "income-vs-projection"];

/** Indicadores ejecutivos (M21): el tablero ejecutivo enlaza a estos reportes. */
export const EXECUTIVE_REPORTS: readonly ReportType[] = [
  "dropout",
  "performance-by-course",
  "performance-by-teacher",
  "enrollment-trend",
  "delinquency",
  "income-vs-projection",
];

export const isReportType = (value: string): value is ReportType => (REPORT_TYPES as readonly string[]).includes(value);

/** Primer y último día del mes de `day` (`AAAA-MM-DD`). */
export const monthRange = (day: string): { from: string; to: string } => {
  const [y, m] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
};

/** Los últimos `n` meses terminando en el de `day`, como `AAAA-MM`. */
export const lastMonths = (day: string, n: number): string[] => {
  const [y, m] = day.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
};

/** Porcentaje con un decimal; 0 cuando no hay base (evita dividir entre cero). */
export const rate = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** Promedio con dos decimales; `null` sin datos. */
export const average = (values: readonly number[]): number | null =>
  values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;

/** Valor de un indicador frente al periodo anterior (M21 §4.3). */
export interface Indicator {
  value: number | null;
  previous: number | null;
  /** Variación absoluta (`value - previous`); `null` si falta alguno de los dos. */
  delta: number | null;
  /** Variación relativa en %; `null` si no hay periodo anterior o su valor es 0. */
  deltaPercent: number | null;
}

export const indicator = (value: number | null, previous: number | null): Indicator => {
  const comparable = value !== null && previous !== null;
  return {
    value,
    previous,
    delta: comparable ? Math.round((value - previous) * 100) / 100 : null,
    deltaPercent: comparable && previous !== 0 ? Math.round(((value - previous) / Math.abs(previous)) * 1000) / 10 : null,
  };
};
