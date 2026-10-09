// API pública del slice "expenses" (M23: gastos institucionales).
export { expenseApi } from "./api/expenseApi";
export { EXPENSE_STATUS_COLOR, EXPENSE_STATUSES, EXPENSE_TYPES } from "./model/types";
export type {
  EditableExpenseStatus,
  Expense,
  ExpenseInput,
  ExpenseStatus,
  ExpenseSummary,
  ExpenseType,
} from "./model/types";
