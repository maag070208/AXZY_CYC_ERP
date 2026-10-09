import { z, registry } from "@core/swagger/registry";

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const DocumentUploadFieldsDto = z
  .object({
    documentTypeId: z.string().uuid("REQUIRED_FIELD"),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const DocumentValidateDto = z
  .object({
    status: z.enum(["VALIDATED", "REJECTED"]),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .openapi("DocumentValidateInput");
registry.register("DocumentValidateInput", DocumentValidateDto);

export const DocumentSchema = z
  .object({
    id: z.string(),
    studentId: z.string(),
    documentTypeId: z.string(),
    documentType: z.string(),
    required: z.boolean(),
    originalName: z.string(),
    mimeType: z.string(),
    size: z.number().int(),
    status: z.enum(["PENDING", "VALIDATED", "REJECTED"]),
    notes: z.string().nullable(),
    uploadedByName: z.string().nullable(),
    validatedByName: z.string().nullable(),
    validatedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("StudentDocument");
registry.register("StudentDocument", DocumentSchema);
export type DocumentView = z.infer<typeof DocumentSchema>;

export const StudentDocumentsSchema = z
  .object({
    documents: z.array(DocumentSchema),
    /** Tipos obligatorios activos (M11) sin un documento VALIDADO. */
    missing: z.array(z.object({ id: z.string(), name: z.string() })),
    requiredCount: z.number().int(),
  })
  .openapi("StudentDocuments");
registry.register("StudentDocuments", StudentDocumentsSchema);

export const KardexEntrySchema = z.object({
  termId: z.string(),
  termNombre: z.string(),
  courseId: z.string(),
  courseNombre: z.string(),
  grupo: z.string(),
  calificaciones: z.array(z.number()),
  ponderaciones: z.array(z.number()),
  calificacionFinal: z.number().nullable(),
  estatus: z.enum(["PASSED", "FAILED", "IN_PROGRESS", "WITHDRAWN"]),
});

export const KardexSchema = z
  .object({
    studentId: z.string(),
    studentNumber: z.string(),
    name: z.string(),
    status: z.enum(["ACTIVE", "WITHDRAWN"]),
    enrollmentDate: z.string(),
    entries: z.array(KardexEntrySchema),
    promedioGeneral: z.number().nullable(),
    creditosAcreditados: z.number().int(),
    documentosFaltantes: z.array(z.string()),
    minPassingGrade: z.number(),
    escuela: z.string(),
    generadoEn: z.string(),
  })
  .openapi("Kardex");
registry.register("Kardex", KardexSchema);
export type Kardex = z.infer<typeof KardexSchema>;
export type KardexEntry = z.infer<typeof KardexEntrySchema>;
