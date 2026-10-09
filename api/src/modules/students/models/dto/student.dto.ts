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

export const GENDERS = ["M", "F", "OTHER"] as const;

export const GuardianSchema = z
  .object({
    name: z.string().trim().min(1, "REQUIRED_FIELD").max(150),
    relationship: z.string().trim().min(1, "REQUIRED_FIELD").max(60),
    phone: phone,
    email: z.string().trim().email("INVALID_EMAIL").max(150).nullable().optional().or(z.literal("").transform(() => null)),
    isPaymentResponsible: z.boolean().optional(),
  })
  .strict()
  .openapi("GuardianInput");
registry.register("GuardianInput", GuardianSchema);
export type GuardianInput = z.infer<typeof GuardianSchema>;

const studentFields = {
  firstNames: z.string().trim().min(1, "REQUIRED_FIELD").max(100),
  paternalSurname: z.string().trim().min(1, "REQUIRED_FIELD").max(100),
  maternalSurname: optionalText(100),
  curp: z
    .string()
    .transform(normalizeCurp)
    .refine(isValidCurp, "INVALID_CURP"),
  birthDate: day,
  gender: z.enum(GENDERS).nullable().optional(),
  email: z.string().trim().email("INVALID_EMAIL").max(150).nullable().optional().or(z.literal("").transform(() => null)),
  phone: phone.nullable().optional().or(z.literal("").transform(() => null)),
  address: optionalText(300),
  guardians: z.array(GuardianSchema).max(10).optional(),
  /** Cuenta del portal (opcional, única; A-007). */
  userId: z.string().uuid().nullable().optional(),
};

export const StudentCreateDto = z
  .object({
    ...studentFields,
    /** Por defecto, el día del alta. */
    enrollmentDate: day.optional(),
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
    name: z.string(),
    relationship: z.string(),
    phone: z.string(),
    email: z.string().nullable(),
    isPaymentResponsible: z.boolean(),
  })
  .openapi("Guardian");
registry.register("Guardian", GuardianViewSchema);

export const StudentSchema = z
  .object({
    id: z.string(),
    studentNumber: z.string(),
    firstNames: z.string(),
    paternalSurname: z.string(),
    maternalSurname: z.string().nullable(),
    fullName: z.string(),
    curp: z.string(),
    birthDate: z.string(),
    gender: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    status: z.enum(["ACTIVE", "WITHDRAWN"]),
    enrollmentDate: z.string(),
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
    reason: z.string().trim().min(3, "REQUIRED_FIELD").max(500),
    /** Motivo del catálogo M11 (`cancellation_reasons`), opcional. */
    reasonId: z.string().uuid().nullable().optional(),
    /** `AAAA-MM-DD`; por defecto hoy. No puede ser futura. */
    date: day.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .openapi("StudentMovementInput");
registry.register("StudentMovementInput", MovementInputDto);
export type MovementInput = z.infer<typeof MovementInputDto>;

export const MovementSchema = z
  .object({
    id: z.string(),
    studentId: z.string(),
    type: z.enum(["WITHDRAWAL", "REENTRY"]),
    reason: z.string(),
    reasonId: z.string().nullable(),
    date: z.string(),
    notes: z.string().nullable(),
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
    status: z.enum(["ACTIVE", "WITHDRAWN"]),
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
