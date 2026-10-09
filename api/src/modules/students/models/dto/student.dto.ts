import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { isValidCurp, normalizeCurp } from "@core/utils/curp";
import { isRealDay } from "@core/utils/day";

const day = z.string().refine(isRealDay, "INVALID_DATE");
const phone = z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, "INVALID_PHONE");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const GENDERS = ["M", "F", "OTRO"] as const;

export const GuardianSchema = z
  .object({
    nombre: z.string().trim().min(1, "REQUIRED_FIELD").max(150),
    parentesco: z.string().trim().min(1, "REQUIRED_FIELD").max(60),
    telefono: phone,
    email: z.string().trim().email("INVALID_EMAIL").max(150).nullable().optional().or(z.literal("").transform(() => null)),
    esResponsablePago: z.boolean().optional(),
  })
  .strict()
  .openapi("GuardianInput");
registry.register("GuardianInput", GuardianSchema);
export type GuardianInput = z.infer<typeof GuardianSchema>;

const studentFields = {
  nombres: z.string().trim().min(1, "REQUIRED_FIELD").max(100),
  apellidoPaterno: z.string().trim().min(1, "REQUIRED_FIELD").max(100),
  apellidoMaterno: optionalText(100),
  curp: z
    .string()
    .transform(normalizeCurp)
    .refine(isValidCurp, "INVALID_CURP"),
  fechaNacimiento: day,
  genero: z.enum(GENDERS).nullable().optional(),
  email: z.string().trim().email("INVALID_EMAIL").max(150).nullable().optional().or(z.literal("").transform(() => null)),
  telefono: phone.nullable().optional().or(z.literal("").transform(() => null)),
  direccion: optionalText(300),
  guardians: z.array(GuardianSchema).max(10).optional(),
  /** Cuenta del portal (opcional, única; A-007). */
  userId: z.string().uuid().nullable().optional(),
};

export const StudentCreateDto = z
  .object({
    ...studentFields,
    /** Por defecto, el día del alta. */
    fechaIngreso: day.optional(),
    /** Confirma el alta aunque exista alguien con el mismo nombre y nacimiento. */
    confirmDuplicate: z.boolean().optional(),
  })
  .strict()
  .openapi("StudentCreateInput");
registry.register("StudentCreateInput", StudentCreateDto);
export type StudentCreateInput = z.infer<typeof StudentCreateDto>;

export const StudentUpdateDto = z
  .object({ ...studentFields, confirmDuplicate: z.boolean().optional() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).filter((k) => k !== "confirmDuplicate").length > 0, {
    message: "REQUIRED_FIELD",
  })
  .openapi("StudentUpdateInput");
registry.register("StudentUpdateInput", StudentUpdateDto);
export type StudentUpdateInput = z.infer<typeof StudentUpdateDto>;

export const GuardianViewSchema = z
  .object({
    id: z.string(),
    nombre: z.string(),
    parentesco: z.string(),
    telefono: z.string(),
    email: z.string().nullable(),
    esResponsablePago: z.boolean(),
  })
  .openapi("Guardian");
registry.register("Guardian", GuardianViewSchema);

export const StudentSchema = z
  .object({
    id: z.string(),
    matricula: z.string(),
    nombres: z.string(),
    apellidoPaterno: z.string(),
    apellidoMaterno: z.string().nullable(),
    nombreCompleto: z.string(),
    curp: z.string(),
    fechaNacimiento: z.string(),
    genero: z.string().nullable(),
    email: z.string().nullable(),
    telefono: z.string().nullable(),
    direccion: z.string().nullable(),
    status: z.enum(["ACTIVO", "BAJA"]),
    fechaIngreso: z.string(),
    userId: z.string().nullable(),
    guardians: z.array(GuardianViewSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Student");
registry.register("Student", StudentSchema);
export type StudentView = z.infer<typeof StudentSchema>;

export const StudentTableResponseSchema = paginatedTableResponseSchema(StudentSchema, "StudentTableResponse");

// --- M05: movimientos -------------------------------------------------------

export const MovementInputDto = z
  .object({
    motivo: z.string().trim().min(3, "REQUIRED_FIELD").max(500),
    /** Motivo del catálogo M11 (`cancellation_reasons`), opcional. */
    reasonId: z.string().uuid().nullable().optional(),
    /** `AAAA-MM-DD`; por defecto hoy. No puede ser futura. */
    fecha: day.optional(),
    observaciones: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .openapi("StudentMovementInput");
registry.register("StudentMovementInput", MovementInputDto);
export type MovementInput = z.infer<typeof MovementInputDto>;

export const MovementSchema = z
  .object({
    id: z.string(),
    studentId: z.string(),
    tipo: z.enum(["BAJA", "REINGRESO"]),
    motivo: z.string(),
    reasonId: z.string().nullable(),
    fecha: z.string(),
    observaciones: z.string().nullable(),
    createdBy: z.string(),
    authorName: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("StudentMovement");
registry.register("StudentMovement", MovementSchema);
export type MovementView = z.infer<typeof MovementSchema>;

export const MovementResultSchema = z
  .object({
    studentId: z.string(),
    status: z.enum(["ACTIVO", "BAJA"]),
    movement: MovementSchema,
    cancelledEnrollments: z.number().int(),
  })
  .openapi("StudentMovementResult");
registry.register("StudentMovementResult", MovementResultSchema);

export const StudentExportQuerySchema = z
  .object({
    filters: z.record(z.string(), z.unknown()).optional(),
    sort: z.object({ key: z.string(), direction: z.enum(["asc", "desc"]) }).optional(),
  })
  .openapi("StudentExportInput");
registry.register("StudentExportInput", StudentExportQuerySchema);
