import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { Expense, ExpenseInput, ExpenseSummary } from "../model/types";

export const expenseApi = {
  table: (params: ITDataTableFetchParamsPost) =>
    tableRequest<Expense>("/expenses/query", params),
  get: (id: string) => api.get<Expense>(`/expenses/${id}`),
  /** Totales del ciclo; sin `termId` (o `all`) no se acota a un ciclo. */
  summary: (termId?: string) =>
    api.get<ExpenseSummary>("/expenses/summary", {
      params: termId && termId !== "all" ? { termId } : undefined,
    }),
  create: (data: ExpenseInput) => api.post<Expense>("/expenses", data),
  update: (id: string, data: ExpenseInput) => api.patch<Expense>(`/expenses/${id}`, data),
  /** Cancelación lógica con motivo (mínimo 3 caracteres). */
  cancel: (id: string, reason: string) =>
    api.delete<Expense>(`/expenses/${id}`, { data: { reason } }),
};
