import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { AuditLog } from "../model/types";

export const auditApi = {
  /** Tabla server-side (`audit.view`). */
  table: (params: ITDataTableFetchParamsPost) => tableRequest<AuditLog>("/audit/query", params),
  get: (id: string) => api.get<AuditLog>(`/audit/${id}`),
};
