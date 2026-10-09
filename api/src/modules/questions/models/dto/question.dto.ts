import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { DIFFICULTIES, QUESTION_TYPES } from "../entity/question-rules";

const points = z
  .number()
  .gt(0)
  .max(1000)
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "INVALID_DECIMAL");

const option = z
  .object({ texto: z.string().trim().min(1, "REQUIRED_FIELD").max(1000), esCorrecta: z.boolean() })
  .strict();

const fields = {
  courseId: z.string().uuid(),
  tema: z.string().trim().max(120).transform((v) => v || null).nullable().optional(),
  tipo: z.enum(QUESTION_TYPES),
  enunciado: z.string().trim().min(3, "REQUIRED_FIELD").max(5000),
  puntos: points,
  dificultad: z.enum(DIFFICULTIES).nullable().optional(),
  options: z.array(option).max(10).default([]),
};

export const QuestionCreateDto = z.object(fields).strict().openapi("QuestionCreateInput");
registry.register("QuestionCreateInput", QuestionCreateDto);
export type QuestionCreateInput = z.infer<typeof QuestionCreateDto>;

/** El curso no cambia: un reactivo de otro curso es otro reactivo. */
const { courseId: _course, ...editable } = fields;
export const QuestionUpdateDto = z
  .object({ ...editable, options: z.array(option).max(10) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("QuestionUpdateInput");
registry.register("QuestionUpdateInput", QuestionUpdateDto);
export type QuestionUpdateInput = z.infer<typeof QuestionUpdateDto>;

export const QuestionSchema = z
  .object({
    id: z.string(),
    courseId: z.string(),
    courseClave: z.string(),
    courseNombre: z.string(),
    tema: z.string().nullable(),
    tipo: z.enum(QUESTION_TYPES),
    enunciado: z.string(),
    puntos: z.number(),
    dificultad: z.enum(DIFFICULTIES).nullable(),
    status: z.enum(["ACTIVA", "INACTIVA"]),
    options: z.array(z.object({ id: z.string(), texto: z.string(), esCorrecta: z.boolean(), orden: z.number().int() })),
    /** Exámenes que la incluyen. */
    usedInExams: z.number().int(),
    /** Ya respondida en un intento: solo se puede desactivar. */
    locked: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Question");
registry.register("Question", QuestionSchema);
export type QuestionView = z.infer<typeof QuestionSchema>;
export const QuestionTableResponseSchema = paginatedTableResponseSchema(QuestionSchema, "QuestionTableResponse");

export const ImportResultSchema = z
  .object({
    preview: z.boolean(),
    total: z.number().int(),
    valid: z.number().int(),
    created: z.number().int(),
    rejected: z.array(z.object({ row: z.number().int(), code: z.string(), message: z.string() })),
    sample: z.array(z.object({ row: z.number().int(), curso: z.string(), tipo: z.string(), enunciado: z.string(), puntos: z.number(), opciones: z.number().int() })),
  })
  .openapi("QuestionImportResult");
registry.register("QuestionImportResult", ImportResultSchema);
export type ImportResult = z.infer<typeof ImportResultSchema>;
