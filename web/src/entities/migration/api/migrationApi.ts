import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { MigrationBatch, MigrationBatchDetail, MigrationEntity, MigrationResult } from "../model/types";

const upload = (path: string, entity: MigrationEntity, file: File, extra: Record<string, string>, headers?: Record<string, string>) => {
  const form = new FormData();
  form.append("entity", entity);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  form.append("file", file);
  return api.post<MigrationResult>(path, form, {
    headers: { "Content-Type": "multipart/form-data", ...(headers ?? {}) },
  });
};

export const migrationApi = {
  /** Simulación (`dry-run`): reporta sin escribir. */
  preview: (entity: MigrationEntity, file: File) => upload("/migration/preview", entity, file, {}),
  /** Importación real: exige `Idempotency-Key` y respaldo reciente. */
  execute: (entity: MigrationEntity, file: File, checksum: string, idempotencyKey: string) =>
    upload("/migration/execute", entity, file, { checksum }, { "Idempotency-Key": idempotencyKey }),
  table: (params: ITDataTableFetchParamsPost) => tableRequest<MigrationBatch>("/migration/batches/query", params),
  getBatch: (id: string) => api.get<MigrationBatchDetail>(`/migration/batches/${id}`),
};
