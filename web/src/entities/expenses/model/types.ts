/** M23 — gastos institucionales (egresos). Contrato propio del módulo. */

export type ExpenseType =
  | "SERVICES"
  | "SUPPLIES"
  | "PAYROLL"
  | "MAINTENANCE"
  | "TAXES"
  | "EQUIPMENT"
  | "OTHER";

/** Estatus capturables en el alta/edición; la API además devuelve `CANCELLED`. */
export type ExpenseStatus = "PENDING" | "PAID" | "CANCELLED";

/** Estatus que aceptan `POST /expenses` y `PATCH /expenses/:id`. */
export type EditableExpenseStatus = Exclude<ExpenseStatus, "CANCELLED">;

/** Color del badge por estatus (`ITBadget`). */
export const EXPENSE_STATUS_COLOR: Record<
  ExpenseStatus,
  "warning" | "success" | "secondary"
> = {
  PENDING: "warning",
  PAID: "success",
  CANCELLED: "secondary",
};

/** Tipos de gasto con su clave i18n (`type.<KEY>`) y el tono de su badge. */
export const EXPENSE_TYPES = [
  { value: "SERVICES", label: "type.SERVICES", color: "info" as const },
  { value: "SUPPLIES", label: "type.SUPPLIES", color: "primary" as const },
  { value: "PAYROLL", label: "type.PAYROLL", color: "purple" as const },
  { value: "MAINTENANCE", label: "type.MAINTENANCE", color: "warning" as const },
  { value: "TAXES", label: "type.TAXES", color: "danger" as const },
  { value: "EQUIPMENT", label: "type.EQUIPMENT", color: "success" as const },
  { value: "OTHER", label: "type.OTHER", color: "secondary" as const },
] as const;

/** Estatus capturables con su clave i18n (`status.<KEY>`) y el color del badge. */
export const EXPENSE_STATUSES = [
  { value: "PENDING", label: "status.PENDING", color: EXPENSE_STATUS_COLOR.PENDING },
  { value: "PAID", label: "status.PAID", color: EXPENSE_STATUS_COLOR.PAID },
] as const;

/** Gasto tal como lo devuelve la API (`/expenses`). */
export interface Expense {
  id: string;
  date: string;
  dueDate: string | null;
  concept: string;
  type: ExpenseType;
  vendor: string | null;
  amount: number;
  status: ExpenseStatus;
  notes: string | null;
  termId: string | null;
  termName: string | null;
  /** Compromiso sin pagar con vencimiento anterior a hoy. */
  overdue: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Alta (`POST /expenses`) y edición parcial (`PATCH /expenses/:id`). */
export interface ExpenseInput {
  date?: string;
  dueDate?: string | null;
  concept?: string;
  type?: ExpenseType;
  vendor?: string | null;
  amount?: number;
  status?: EditableExpenseStatus;
  notes?: string | null;
  termId?: string | null;
}

/** Totales del ciclo (`GET /expenses/summary`). */
export interface ExpenseSummary {
  total: number;
  paid: number;
  pending: number;
  count: number;
  byType: Array<{ type: ExpenseType; label: string; total: number; count: number }>;
  byMonth: Array<{ month: string; total: number }>;
}
