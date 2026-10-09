import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";

const name = z.string().trim().min(1, "NOMBRE_REQUIRED").max(120);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "INVALID_DATE");

// --- Niveles ------------------------------------------------------------------

export const LevelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sortOrder: z.number().int().nullable(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Level");
registry.register("Level", LevelSchema);

export const LevelCreateDto = z
  .object({ name, sortOrder: z.number().int().min(0).max(999).nullable().optional() })
  .strict()
  .openapi("LevelCreateInput");
registry.register("LevelCreateInput", LevelCreateDto);

export const LevelUpdateDto = LevelCreateDto.extend({ active: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("LevelUpdateInput");
registry.register("LevelUpdateInput", LevelUpdateDto);

// --- Motivos de baja ----------------------------------------------------------

export const CancellationReasonSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CancellationReason");
registry.register("CancellationReason", CancellationReasonSchema);

export const CancellationReasonCreateDto = z
  .object({ name })
  .strict()
  .openapi("CancellationReasonCreateInput");
registry.register("CancellationReasonCreateInput", CancellationReasonCreateDto);

export const CancellationReasonUpdateDto = CancellationReasonCreateDto.extend({ active: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("CancellationReasonUpdateInput");
registry.register("CancellationReasonUpdateInput", CancellationReasonUpdateDto);

// --- Tipos de documento -------------------------------------------------------

export const DocumentTypeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    required: z.boolean(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DocumentType");
registry.register("DocumentType", DocumentTypeSchema);

export const DocumentTypeCreateDto = z
  .object({ name, required: z.boolean().optional() })
  .strict()
  .openapi("DocumentTypeCreateInput");
registry.register("DocumentTypeCreateInput", DocumentTypeCreateDto);

export const DocumentTypeUpdateDto = DocumentTypeCreateDto.extend({ active: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("DocumentTypeUpdateInput");
registry.register("DocumentTypeUpdateInput", DocumentTypeUpdateDto);

// --- Ciclos escolares ---------------------------------------------------------

export const TermSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Día del calendario `AAAA-MM-DD`. */
    startDate: z.string(),
    endDate: z.string(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Term");
registry.register("Term", TermSchema);

export const TermCreateDto = z
  .object({ name, startDate: isoDay, endDate: isoDay })
  .strict()
  .openapi("TermCreateInput");
registry.register("TermCreateInput", TermCreateDto);
export type TermCreateInput = z.infer<typeof TermCreateDto>;

export const TermUpdateDto = TermCreateDto.partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("TermUpdateInput");
registry.register("TermUpdateInput", TermUpdateDto);
export type TermUpdateInput = z.infer<typeof TermUpdateDto>;

export const LevelTableResponseSchema = paginatedTableResponseSchema(LevelSchema, "LevelTableResponse");
export const CancellationReasonTableResponseSchema = paginatedTableResponseSchema(
  CancellationReasonSchema,
  "CancellationReasonTableResponse"
);
export const DocumentTypeTableResponseSchema = paginatedTableResponseSchema(
  DocumentTypeSchema,
  "DocumentTypeTableResponse"
);
export const TermTableResponseSchema = paginatedTableResponseSchema(TermSchema, "TermTableResponse");
