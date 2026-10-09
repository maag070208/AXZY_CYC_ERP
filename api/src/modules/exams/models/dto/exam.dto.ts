import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";

const decimal = z.number().refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "INVALID_DECIMAL");
const instant = z.string().datetime({ offset: true, message: "INVALID_DATE" });

export const EXAM_STATUSES = ["BORRADOR", "PUBLICADO", "CERRADO"] as const;

// --- Examen -------------------------------------------------------------------

const examFields = {
  groupId: z.string().uuid(),
  titulo: z.string().trim().min(1, "NOMBRE_REQUIRED").max(150),
  instrucciones: z.string().trim().max(5000).transform((v) => v || null).nullable().optional(),
  duracionMin: z.number().int().min(1).max(600),
  intentosMax: z.number().int().min(1).max(10).default(1),
  fechaApertura: instant,
  fechaCierre: instant,
  aleatorizarPreguntas: z.boolean().default(false),
  aleatorizarOpciones: z.boolean().default(false),
  mostrarResultado: z.boolean().default(true),
  puntajeAprobatorio: decimal.pipe(z.number().min(0)),
  criterioIntentos: z.enum(["MEJOR", "ULTIMO"]).default("MEJOR"),
  assessmentId: z.string().uuid().nullable().optional(),
};

export const ExamCreateDto = z
  .object(examFields)
  .strict()
  .refine((v) => new Date(v.fechaApertura) < new Date(v.fechaCierre), { message: "INVALID_RANGE", path: ["fechaCierre"] })
  .openapi("OnlineExamCreateInput");
registry.register("OnlineExamCreateInput", ExamCreateDto);
export type ExamCreateInput = z.infer<typeof ExamCreateDto>;

const { groupId: _group, ...editable } = examFields;
export const ExamUpdateDto = z
  .object({
    ...editable,
    intentosMax: editable.intentosMax.removeDefault(),
    aleatorizarPreguntas: z.boolean(),
    aleatorizarOpciones: z.boolean(),
    mostrarResultado: z.boolean(),
    criterioIntentos: z.enum(["MEJOR", "ULTIMO"]),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("OnlineExamUpdateInput");
registry.register("OnlineExamUpdateInput", ExamUpdateDto);
export type ExamUpdateInput = z.infer<typeof ExamUpdateDto>;

export const ExamQuestionsDto = z
  .object({
    questions: z
      .array(
        z
          .object({ questionId: z.string().uuid(), puntos: decimal.pipe(z.number().gt(0).max(1000)).optional() })
          .strict()
      )
      .max(200)
      .refine((rows) => new Set(rows.map((r) => r.questionId)).size === rows.length, { message: "REQUIRED_FIELD" }),
  })
  .strict()
  .openapi("OnlineExamQuestionsInput");
registry.register("OnlineExamQuestionsInput", ExamQuestionsDto);
export type ExamQuestionsInput = z.infer<typeof ExamQuestionsDto>;

export const ExamSchema = z
  .object({
    id: z.string(),
    groupId: z.string(),
    groupNombre: z.string(),
    courseId: z.string(),
    courseNombre: z.string(),
    termNombre: z.string(),
    titulo: z.string(),
    instrucciones: z.string().nullable(),
    duracionMin: z.number().int(),
    intentosMax: z.number().int(),
    fechaApertura: z.string(),
    fechaCierre: z.string(),
    aleatorizarPreguntas: z.boolean(),
    aleatorizarOpciones: z.boolean(),
    mostrarResultado: z.boolean(),
    puntajeAprobatorio: z.number(),
    criterioIntentos: z.enum(["MEJOR", "ULTIMO"]),
    assessmentId: z.string().nullable(),
    assessmentNombre: z.string().nullable(),
    status: z.enum(EXAM_STATUSES),
    totalPuntos: z.number(),
    preguntas: z.number().int(),
    intentos: z.number().int(),
    publishedAt: z.string().nullable(),
    closedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("OnlineExam");
registry.register("OnlineExam", ExamSchema);
export type ExamView = z.infer<typeof ExamSchema>;
export const ExamTableResponseSchema = paginatedTableResponseSchema(ExamSchema, "OnlineExamTableResponse");

export const ExamDetailSchema = ExamSchema.extend({
  questions: z.array(
    z.object({
      questionId: z.string(),
      orden: z.number().int(),
      puntos: z.number(),
      tipo: z.string(),
      tema: z.string().nullable(),
      enunciado: z.string(),
      status: z.enum(["ACTIVA", "INACTIVA"]),
    })
  ),
}).openapi("OnlineExamDetail");
registry.register("OnlineExamDetail", ExamDetailSchema);
export type ExamDetail = z.infer<typeof ExamDetailSchema>;

// --- Intentos -----------------------------------------------------------------

const answerValue = z.union([z.string().max(5000), z.array(z.string().uuid()).max(10), z.null()]);

export const SaveAnswersDto = z
  .object({
    answers: z.array(z.object({ questionId: z.string().uuid(), respuesta: answerValue }).strict()).min(1, "REQUIRED_FIELD").max(200),
  })
  .strict()
  .openapi("SaveAnswersInput");
registry.register("SaveAnswersInput", SaveAnswersDto);
export type SaveAnswersInput = z.infer<typeof SaveAnswersDto>;

export const SubmitAttemptDto = z
  .object({ answers: SaveAnswersDto.shape.answers.optional() })
  .strict()
  .openapi("SubmitAttemptInput");
registry.register("SubmitAttemptInput", SubmitAttemptDto);

export const AttemptEventDto = z
  .object({ type: z.enum(["TAB_BLUR", "TAB_FOCUS"]), at: z.string().datetime({ offset: true }).optional() })
  .strict()
  .openapi("AttemptEventInput");
registry.register("AttemptEventInput", AttemptEventDto);

export const ReviewDto = z
  .object({
    questionId: z.string().uuid(),
    puntosObtenidos: decimal.pipe(z.number().min(0)),
    esCorrecta: z.boolean().optional(),
    comentario: z.string().trim().max(1000).optional(),
  })
  .strict()
  .openapi("ReviewAnswerInput");
registry.register("ReviewAnswerInput", ReviewDto);
export type ReviewInput = z.infer<typeof ReviewDto>;

export interface AttemptQuestionView {
  questionId: string;
  orden: number;
  tipo: string;
  enunciado: string;
  puntos: number;
  options: Array<{ id: string; texto: string; esCorrecta?: boolean }>;
  respuesta: string | string[] | null;
  esCorrecta?: boolean | null;
  puntosObtenidos?: number | null;
  comentario?: string | null;
}

export interface AttemptView {
  attemptId: string;
  examId: string;
  titulo: string;
  instrucciones: string | null;
  numero: number;
  status: "EN_CURSO" | "ENVIADO" | "EXPIRADO";
  student: { id: string; matricula: string; nombre: string };
  startedAt: string;
  endsAt: string;
  finishedAt: string | null;
  /** Calculado en el servidor (el cliente nunca decide el tiempo). */
  remainingSeconds: number;
  serverTime: string;
  focusLosses: number;
  questions: AttemptQuestionView[];
  /** Solo al terminar (y para el alumno solo si el examen muestra resultado). */
  result: { score: number; totalPuntos: number; pendingCount: number; aprobado: boolean | null } | null;
}
