import type { ExpenseStatus } from "@prisma/client";

/** Tipos de gasto editables (los mismos del DTO y del catálogo de i18n). */
export type ExpenseTypeValue =
  | "SERVICES"
  | "SUPPLIES"
  | "PAYROLL"
  | "MAINTENANCE"
  | "TAXES"
  | "EQUIPMENT"
  | "OTHER";

export const EXPENSE_TYPE_VALUES: readonly ExpenseTypeValue[] = [
  "SERVICES",
  "SUPPLIES",
  "PAYROLL",
  "MAINTENANCE",
  "TAXES",
  "EQUIPMENT",
  "OTHER",
];

export const isExpenseType = (value: string): value is ExpenseTypeValue =>
  (EXPENSE_TYPE_VALUES as readonly string[]).includes(value);

/**
 * Reglas puras de M23 (gastos). Viven aparte del servicio para poder probarlas
 * sin base de datos y para que el servicio solo orqueste.
 */

/**
 * ¿El compromiso está vencido? Solo un gasto **pendiente** con vencimiento
 * anterior a hoy: un gasto ya pagado no genera mora y uno sin vencimiento no
 * puede vencer. Las fechas son días del calendario `AAAA-MM-DD`, así que la
 * comparación es lexicográfica (mismo formato, sin husos horarios).
 */
export const isExpenseOverdue = (
  status: ExpenseStatus | "PENDING" | "PAID" | "CANCELLED",
  dueDate: string | null,
  today: string
): boolean => status === "PENDING" && dueDate !== null && dueDate < today;

/**
 * Reparto de los gastos del ciclo por tipo, de mayor a menor, con su total. Los
 * tipos sin gasto no aparecen. La etiqueta la pone quien llama (i18n).
 */
export const groupExpensesByType = (
  rows: ReadonlyArray<{ type: string; amount: number }>
): Array<{ type: ExpenseTypeValue; total: number; count: number }> => {
  const buckets = new Map<string, number[]>();
  for (const row of rows) buckets.set(row.type, [...(buckets.get(row.type) ?? []), row.amount]);
  const sum = (values: number[]): number =>
    Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
  return [...buckets.entries()]
    .filter(([type]) => isExpenseType(type))
    .map(([type, amounts]) => ({ type: type as ExpenseTypeValue, total: sum(amounts), count: amounts.length }))
    .sort((a, b) => b.total - a.total);
};

/**
 * Serie mensual de gastos (`AAAA-MM`), sumando por fecha del gasto y ordenada
 * de más antiguo a más reciente.
 */
export const groupExpensesByMonth = (
  rows: ReadonlyArray<{ date: string; amount: number }>
): Array<{ month: string; total: number }> => {
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    buckets.set(month, [...(buckets.get(month) ?? []), row.amount]);
  }
  const sum = (values: number[]): number =>
    Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amounts]) => ({ month, total: sum(amounts) }));
};

/** ¿El vencimiento es válido respecto a la fecha del gasto? */
export const isDueDateValid = (date: string, dueDate: string | null | undefined): boolean =>
  !dueDate || dueDate >= date;
