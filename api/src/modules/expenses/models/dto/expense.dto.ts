import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { isRealDay } from "@core/utils/day";
import { isCents } from "@modules/finance/models/entity/money";

/**
 * M23 — Gastos institucionales (egresos). El gasto no se liga a un alumno: es
 * operación de la institución y la contraparte de `Charge`/`Payment` en el
 * tablero (M21 ampliado).
 */

const day = z.string().refine(isRealDay, "INVALID_DATE");
const uuid = z.string().uuid();
const amount = z.number().refine(isCents, "INVALID_DECIMAL");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const EXPENSE_TYPES = ["SERVICES", "SUPPLIES", "PAYROLL", "MAINTENANCE", "TAXES", "EQUIPMENT", "OTHER"] as const;
export const EXPENSE_STATUSES = ["PENDING", "PAID", "CANCELLED"] as const;

const expenseFields = {
  date: day,
  dueDate: day.nullable().optional(),
  concept: z.string().trim().min(1, "CONCEPT_REQUIRED").max(200),
  type: z.enum(EXPENSE_TYPES),
  vendor: optionalText(200),
  amount: amount.pipe(z.number().gt(0).max(9_999_999)),
  status: z.enum(["PENDING", "PAID"]).default("PENDING"),
  notes: optionalText(500),
  termId: uuid.nullable().optional(),
};

/**
 * El vencimiento contra la fecha se valida en el servicio (`DUE_DATE_BEFORE_DATE`),
 * no aquí: el alta y la edición deben responder el mismo código, y `ZodError`
 * siempre sale como `VALIDATION_ERROR`.
 */
export const ExpenseCreateDto = z
  .object(expenseFields)
  .strict()
  .openapi("ExpenseCreateInput");
registry.register("ExpenseCreateInput", ExpenseCreateDto);
export type ExpenseCreateInput = z.infer<typeof ExpenseCreateDto>;

export const ExpenseUpdateDto = z
  .object({
    date: day.optional(),
    dueDate: day.nullable().optional(),
    concept: expenseFields.concept.optional(),
    type: z.enum(EXPENSE_TYPES).optional(),
    vendor: optionalText(200),
    amount: expenseFields.amount.optional(),
    status: z.enum(["PENDING", "PAID"]).optional(),
    notes: optionalText(500),
    termId: uuid.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("ExpenseUpdateInput");
registry.register("ExpenseUpdateInput", ExpenseUpdateDto);
export type ExpenseUpdateInput = z.infer<typeof ExpenseUpdateDto>;

export const ExpenseSchema = z
  .object({
    id: z.string(),
    date: z.string(),
    dueDate: z.string().nullable(),
    concept: z.string(),
    type: z.enum(EXPENSE_TYPES),
    vendor: z.string().nullable(),
    amount: z.number(),
    status: z.enum(EXPENSE_STATUSES),
    notes: z.string().nullable(),
    termId: z.string().nullable(),
    termName: z.string().nullable(),
    /** Compromiso sin pagar con vencimiento anterior a hoy. */
    overdue: z.boolean(),
    cancelledAt: z.string().nullable(),
    cancelReason: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Expense");
registry.register("Expense", ExpenseSchema);
export type ExpenseView = z.infer<typeof ExpenseSchema>;
export const ExpenseTableResponseSchema = paginatedTableResponseSchema(ExpenseSchema, "ExpenseTableResponse");

/** Totales del ciclo para el tablero: por tipo, por mes y por estatus. */
export const ExpenseSummarySchema = z
  .object({
    total: z.number(),
    paid: z.number(),
    pending: z.number(),
    count: z.number(),
    byType: z.array(z.object({ type: z.enum(EXPENSE_TYPES), label: z.string(), total: z.number(), count: z.number() })),
    byMonth: z.array(z.object({ month: z.string(), total: z.number() })),
  })
  .openapi("ExpenseSummary");
registry.register("ExpenseSummary", ExpenseSummarySchema);
export type ExpenseSummary = z.infer<typeof ExpenseSummarySchema>;
