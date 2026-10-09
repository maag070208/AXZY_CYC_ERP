import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { isRealDay } from "@core/utils/day";
import { PERIOD_TYPES } from "../entity/program-rules";

const day = z.string().refine(isRealDay, "INVALID_DATE");
const money = z.number().min(0);
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional();

export const PeriodTypeSchema = z.enum(PERIOD_TYPES);

// --- programas ----------------------------------------------------------------

export const ProgramCreateDto = z
  .object({
    code: z.string().trim().regex(/^[A-Z0-9-]{2,30}$/, "INVALID_FORMAT"),
    name: z.string().trim().min(1, "NOMBRE_REQUIRED").max(150),
    description: optionalText(500),
    periodType: PeriodTypeSchema,
    periodCount: z.number().int().min(1).max(20),
    monthsPerPeriod: z.number().int().min(1).max(12).nullable().optional(),
    monthlyFee: money,
    enrollmentFee: money,
  })
  .strict()
  .openapi("ProgramCreateInput");
registry.register("ProgramCreateInput", ProgramCreateDto);
export type ProgramCreateInput = z.infer<typeof ProgramCreateDto>;

export const ProgramUpdateDto = ProgramCreateDto.omit({ code: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("ProgramUpdateInput");
registry.register("ProgramUpdateInput", ProgramUpdateDto);
export type ProgramUpdateInput = z.infer<typeof ProgramUpdateDto>;

export const ProgramSubjectInput = z
  .object({ courseId: z.string().uuid(), periodIndex: z.number().int().min(1), sortOrder: z.number().int().min(0).default(0) })
  .strict();
export type ProgramSubjectInputType = z.infer<typeof ProgramSubjectInput>;

export const ProgramSubjectsDto = z
  .object({ subjects: z.array(ProgramSubjectInput).max(300) })
  .strict()
  .refine((v) => new Set(v.subjects.map((s) => s.courseId)).size === v.subjects.length, { message: "DUPLICATE_RECORD" })
  .openapi("ProgramSubjectsInput");
registry.register("ProgramSubjectsInput", ProgramSubjectsDto);
export type ProgramSubjectsInput = z.infer<typeof ProgramSubjectsDto>;

export const ProgramSubjectSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  courseCode: z.string(),
  courseName: z.string(),
  periodIndex: z.number().int(),
  sortOrder: z.number().int(),
});
export type ProgramSubjectView = z.infer<typeof ProgramSubjectSchema>;

export const ProgramSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    periodType: PeriodTypeSchema,
    periodCount: z.number().int(),
    monthsPerPeriod: z.number().int(),
    monthlyFee: z.number(),
    enrollmentFee: z.number(),
    active: z.boolean(),
    subjects: z.number().int(),
    plans: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Program");
registry.register("Program", ProgramSchema);
export type ProgramView = z.infer<typeof ProgramSchema>;

export const ProgramDetailSchema = ProgramSchema.extend({ subjectsList: z.array(ProgramSubjectSchema) }).openapi("ProgramDetail");
registry.register("ProgramDetail", ProgramDetailSchema);
export type ProgramDetailView = z.infer<typeof ProgramDetailSchema>;

export const ProgramTableResponseSchema = paginatedTableResponseSchema(ProgramSchema, "ProgramTableResponse");

// --- planes de pago -----------------------------------------------------------

export const PlanCreateDto = z
  .object({
    studentId: z.string().uuid(),
    programId: z.string().uuid(),
    termId: z.string().uuid().nullable().optional(),
    startDate: day,
    discountPercent: z.number().min(0).max(100).nullable().optional(),
    discountAmount: money.nullable().optional(),
    discountReason: optionalText(200),
  })
  .strict()
  .refine((v) => !(v.discountPercent != null && v.discountAmount != null), { message: "DISCOUNT_EXCLUSIVE", path: ["discountAmount"] })
  .openapi("PlanCreateInput");
registry.register("PlanCreateInput", PlanCreateDto);
export type PlanCreateInput = z.infer<typeof PlanCreateDto>;

export const PlanTotalsSchema = z.object({
  charges: z.number().int(),
  enrollmentCharges: z.number().int(),
  monthlyCharges: z.number().int(),
  amount: z.number(),
});

export const PlanSchema = z
  .object({
    id: z.string(),
    student: z.object({ id: z.string(), matricula: z.string(), name: z.string() }),
    program: z.object({ id: z.string(), code: z.string(), name: z.string() }),
    term: z.object({ id: z.string(), nombre: z.string() }).nullable(),
    startDate: z.string(),
    periodType: PeriodTypeSchema,
    periodCount: z.number().int(),
    monthsPerPeriod: z.number().int(),
    monthlyFee: z.number(),
    enrollmentFee: z.number(),
    discountPercent: z.number().nullable(),
    discountAmount: z.number().nullable(),
    discountReason: z.string().nullable(),
    status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]),
    totals: PlanTotalsSchema,
    firstDueDate: z.string().nullable(),
    lastDueDate: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("StudentPlan");
registry.register("StudentPlan", PlanSchema);
export type PlanView = z.infer<typeof PlanSchema>;

export const PlanChargeSchema = z.object({
  id: z.string(),
  planChargeIndex: z.number().int().nullable(),
  descripcion: z.string().nullable(),
  monto: z.number(),
  fechaVencimiento: z.string(),
  status: z.string(),
});
export type PlanChargeView = z.infer<typeof PlanChargeSchema>;

export const PlanDetailSchema = PlanSchema.extend({ charges: z.array(PlanChargeSchema) }).openapi("StudentPlanDetail");
registry.register("StudentPlanDetail", PlanDetailSchema);
export type PlanDetailView = z.infer<typeof PlanDetailSchema>;

export const PlanTableResponseSchema = paginatedTableResponseSchema(PlanSchema, "StudentPlanTableResponse");
