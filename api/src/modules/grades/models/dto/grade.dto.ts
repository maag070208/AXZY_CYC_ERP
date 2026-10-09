import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { isRealDay } from "@core/utils/day";
import { hasTwoDecimalsAtMost } from "../entity/grading";

const day = z.string().refine(isRealDay, "INVALID_DATE");
const decimal = z.number().refine(hasTwoDecimalsAtMost, "INVALID_DECIMAL");

export const ASSESSMENT_TYPES = ["PARTIAL", "FINAL", "HOMEWORK", "OTHER"] as const;

// --- Instrumentos de evaluación -------------------------------------------------

const assessmentFields = {
  name: z.string().trim().min(1, "NOMBRE_REQUIRED").max(120),
  type: z.enum(ASSESSMENT_TYPES),
  /** Porcentaje de la final: `> 0` y `<= 100`. */
  weight: decimal.pipe(z.number().gt(0).max(100)),
  date: day.nullable().optional(),
  maxScore: decimal.pipe(z.number().gt(0).max(1000)).optional(),
};

export const AssessmentCreateDto = z
  .object({ groupId: z.string().uuid(), ...assessmentFields })
  .strict()
  .openapi("AssessmentCreateInput");
registry.register("AssessmentCreateInput", AssessmentCreateDto);
export type AssessmentCreateInput = z.infer<typeof AssessmentCreateDto>;

export const AssessmentUpdateDto = z
  .object(assessmentFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("AssessmentUpdateInput");
registry.register("AssessmentUpdateInput", AssessmentUpdateDto);
export type AssessmentUpdateInput = z.infer<typeof AssessmentUpdateDto>;

export const AssessmentSchema = z
  .object({
    id: z.string(),
    groupId: z.string(),
    name: z.string(),
    type: z.enum(ASSESSMENT_TYPES),
    weight: z.number(),
    date: z.string().nullable(),
    maxScore: z.number(),
    active: z.boolean(),
    capturadas: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Assessment");
registry.register("Assessment", AssessmentSchema);
export type AssessmentView = z.infer<typeof AssessmentSchema>;
export const AssessmentTableResponseSchema = paginatedTableResponseSchema(AssessmentSchema, "AssessmentTableResponse");

// --- Calificaciones -------------------------------------------------------------

export const GradeCaptureDto = z
  .object({
    grades: z
      .array(
        z
          .object({
            enrollmentId: z.string().uuid(),
            /** `null` vacía una calificación capturada. */
            score: decimal.pipe(z.number().min(0)).nullable(),
            notes: z.string().trim().max(500).nullable().optional(),
          })
          .strict()
      )
      .min(1, "REQUIRED_FIELD")
      .max(500)
      .refine((rows) => new Set(rows.map((r) => r.enrollmentId)).size === rows.length, {
        message: "DUPLICATE_ENROLLMENT_IN_BATCH",
      }),
  })
  .strict()
  .openapi("GradeCaptureInput");
registry.register("GradeCaptureInput", GradeCaptureDto);
export type GradeCaptureInput = z.infer<typeof GradeCaptureDto>;

export const GradeSchema = z
  .object({
    id: z.string(),
    assessmentId: z.string(),
    assessmentNombre: z.string(),
    enrollmentId: z.string(),
    studentId: z.string(),
    studentNumber: z.string(),
    studentNombre: z.string(),
    score: z.number().nullable(),
    notes: z.string().nullable(),
    capturedBy: z.string().nullable(),
    capturedAt: z.string().nullable(),
  })
  .openapi("Grade");
registry.register("Grade", GradeSchema);
export type GradeView = z.infer<typeof GradeSchema>;
export const GradeTableResponseSchema = paginatedTableResponseSchema(GradeSchema, "GradeTableResponse");

// --- Libro de calificaciones ----------------------------------------------------

export const GradebookSchema = z
  .object({
    group: z.object({
      id: z.string(),
      name: z.string(),
      courseNombre: z.string(),
      termNombre: z.string(),
      teacherNombre: z.string().nullable(),
      closedAt: z.string().nullable(),
    }),
    assessments: z.array(
      z.object({ id: z.string(), name: z.string(), type: z.enum(ASSESSMENT_TYPES), weight: z.number(), maxScore: z.number() })
    ),
    weightsTotal: z.number(),
    approvalThreshold: z.number(),
    /** Todos los inscritos tienen todas sus calificaciones (se puede cerrar). */
    complete: z.boolean(),
    students: z.array(
      z.object({
        enrollmentId: z.string(),
        studentId: z.string(),
        studentNumber: z.string(),
        name: z.string(),
        enrollmentStatus: z.enum(["ENROLLED", "WITHDRAWN", "PASSED", "FAILED"]),
        scores: z.record(z.number().nullable()),
        notes: z.record(z.string().nullable()),
        /** Proyección (abierto) o final escrita (cerrado); `null` si las ponderaciones no suman 100. */
        final: z.number().nullable(),
        missing: z.number().int(),
        result: z.enum(["PASSED", "FAILED"]).nullable(),
      })
    ),
  })
  .openapi("Gradebook");
registry.register("Gradebook", GradebookSchema);
export type Gradebook = z.infer<typeof GradebookSchema>;
