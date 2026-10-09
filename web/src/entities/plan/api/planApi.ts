import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { Plan, PlanDetail, PlanInput } from "../model/types";

export const planApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Plan>("/plans/query", params),
  get: (id: string) => api.get<PlanDetail>(`/plans/${id}`),
  /** Asigna el alumno y genera los cargos; la clave evita duplicar al reintentar. */
  create: (data: PlanInput, idempotencyKey: string) =>
    api.post<PlanDetail>("/plans", data, { headers: { "Idempotency-Key": idempotencyKey } }),
  cancel: (id: string, reason: string) => api.post<PlanDetail>(`/plans/${id}/cancel`, { reason }),
};
