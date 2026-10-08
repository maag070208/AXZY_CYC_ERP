import { z, registry } from "@core/swagger/registry";

export const AuditLogSchema = z
  .object({
    id: z.string(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    userId: z.string().nullable(),
    userName: z.string().nullable(),
    previousState: z.record(z.string(), z.unknown()).nullable().optional(),
    newState: z.record(z.string(), z.unknown()).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    createdAt: z.string(),
  })
  .openapi("AuditLog");

registry.register("AuditLog", AuditLogSchema);

export const AuditLogTableResponseSchema = z
  .object({
    data: z.array(AuditLogSchema),
    total: z.number(),
    page: z.number(),
    pageIndex: z.number(),
    totalPages: z.number(),
    totalCount: z.number(),
    limit: z.number(),
    hasPreviousPage: z.boolean(),
    hasNextPage: z.boolean(),
  })
  .openapi("AuditLogTableResponse");

registry.register("AuditLogTableResponse", AuditLogTableResponseSchema);
