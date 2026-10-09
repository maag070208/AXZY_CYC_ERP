export type ReportType =
  | "students-active"
  | "students-inactive"
  | "enrollments-by-group"
  | "grades-by-group"
  | "payments-period"
  | "debts";

export interface ReportCatalogItem {
  type: ReportType;
  title: string;
  financial: boolean;
}

export interface ReportFilters {
  termId?: string;
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
  filters: ReportFilters & { termNombre?: string | null };
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
}

export interface Dashboard {
  termId: string | null;
  termNombre: string | null;
  activeStudents: number;
  inactiveStudents: number;
  groupOccupancy: {
    average: number;
    groups: Array<{ groupId: string; name: string; curso: string; inscritos: number; capacity: number; ratio: number }>;
  };
  monthIncome: number | null;
  totalDebt: number | null;
  overdueDebt: number | null;
  incomeByMonth: Array<{ month: string; total: number }> | null;
  generatedAt: string;
}
