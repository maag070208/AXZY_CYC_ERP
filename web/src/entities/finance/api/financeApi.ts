import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type {
  AccountStatement,
  Charge,
  ChargeGenerateInput,
  ChargeInput,
  FeeConcept,
  FeeConceptInput,
  Payment,
  PaymentInput,
} from "../model/types";

const idempotency = (key?: string) => (key ? { headers: { "Idempotency-Key": key } } : undefined);

export const feeConceptApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<FeeConcept>("/fee-concepts/query", params),
  /** Activos y capturables (sin RECARGO). */
  options: () => api.get<FeeConcept[]>("/fee-concepts/options"),
  create: (data: FeeConceptInput) => api.post<FeeConcept>("/fee-concepts", data),
  update: (id: string, data: FeeConceptInput) => api.patch<FeeConcept>(`/fee-concepts/${id}`, data),
  deactivate: (id: string) => api.delete<FeeConcept>(`/fee-concepts/${id}`),
  reactivate: (id: string) => api.post<FeeConcept>(`/fee-concepts/${id}/reactivate`),
};

export const chargeApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Charge>("/charges/query", params),
  get: (id: string) => api.get<Charge>(`/charges/${id}`),
  create: (data: ChargeInput) => api.post<Charge>("/charges", data),
  /** Masiva; la clave hace que un doble clic no duplique nada. */
  generate: (data: ChargeGenerateInput, key?: string) =>
    api.post<{ created: number; skipped: number }>("/charges/generate", data, idempotency(key)),
  lateFees: (asOf?: string) =>
    api.post<{ asOf: string; created: number; updated: number; skipped: number }>("/charges/late-fees", asOf ? { asOf } : {}),
  cancel: (id: string, reason: string) => api.delete<Charge>(`/charges/${id}`, { data: { reason } }),
  statement: (studentId: string) => api.get<AccountStatement>(`/students/${studentId}/account-statement`),
};

export const paymentApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Payment>("/payments/query", params),
  get: (id: string) => api.get<Payment>(`/payments/${id}`),
  register: (data: PaymentInput, key?: string) => api.post<Payment>("/payments", data, idempotency(key)),
  cancel: (id: string, reason: string) => api.delete<Payment>(`/payments/${id}`, { data: { reason } }),
};
