import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { MIGRATION_ENTITIES } from "../entity/migration-rules";

export const MigrationEntitySchema = z.enum(MIGRATION_ENTITIES).openapi("MigrationEntity");

/** Totales del lote: `{ read, valid|inserted, updated?, rejected }`. */
export const MigrationTotalsSchema = z.record(z.string(), z.number().int());

export const MigrationBatchSchema = z
  .object({
    id: z.string(),
    entity: MigrationEntitySchema,
    file: z.string(),
    checksum: z.string(),
    mode: z.enum(["DRY_RUN", "EXECUTE"]),
    status: z.enum(["IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"]),
    totals: MigrationTotalsSchema,
    createdBy: z.string(),
    executedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("MigrationBatch");
registry.register("MigrationBatch", MigrationBatchSchema);
export type MigrationBatchView = z.infer<typeof MigrationBatchSchema>;

/** Fila no aceptada del reporte. */
export const MigrationRejectionSchema = z
  .object({
    row: z.number().int(),
    naturalKey: z.string().nullable(),
    reason: z.string(),
    value: z.string().nullable(),
  })
  .openapi("MigrationRejection");
export type MigrationRejection = z.infer<typeof MigrationRejectionSchema>;

export const MigrationBatchDetailSchema = MigrationBatchSchema.extend({
  rows: z.array(MigrationRejectionSchema),
}).openapi("MigrationBatchDetail");
registry.register("MigrationBatchDetail", MigrationBatchDetailSchema);
export type MigrationBatchDetailView = z.infer<typeof MigrationBatchDetailSchema>;

/** Resultado de `preview`/`execute`. */
export const MigrationResultSchema = z
  .object({
    batchId: z.string(),
    entity: MigrationEntitySchema,
    mode: z.enum(["DRY_RUN", "EXECUTE"]),
    status: z.enum(["IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"]),
    checksum: z.string(),
    totals: MigrationTotalsSchema,
    rejected: z.array(MigrationRejectionSchema),
  })
  .openapi("MigrationResult");
registry.register("MigrationResult", MigrationResultSchema);
export type MigrationResultView = z.infer<typeof MigrationResultSchema>;

export const MigrationBatchTableResponseSchema = paginatedTableResponseSchema(MigrationBatchSchema, "MigrationBatchTableResponse");
