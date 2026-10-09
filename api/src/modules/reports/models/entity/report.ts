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
  groupId?: string;
  from?: string;
  to?: string;
  status?: string;
}

export interface ReportResult {
  report: string;
  title: string;
  generatedAt: string;
  filters: ReportFilters & { termNombre?: string | null };
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
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Reportes con montos: solo con alcance institucional (el profesor no ve dinero). */
export const FINANCIAL_REPORTS: readonly ReportType[] = ["payments-period", "debts"];

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
