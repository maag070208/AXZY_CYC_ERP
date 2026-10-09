import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";

const decimal = z.number().refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "INVALID_DECIMAL");
const instant = z.string().datetime({ offset: true, message: "INVALID_DATE" });

export const EXAM_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;

// --- Examen -------------------------------------------------------------------

const examFields = {
  groupId: z.string().uuid(),
  title: z.string().trim().min(1, "NOMBRE_REQUIRED").max(150),
  instructions: z.string().trim().max(5000).transform((v) => v || null).nullable().optional(),
  durationMin: z.number().int().min(1).max(600),
  maxAttempts: z.number().int().min(1).max(10).default(1),
  opensAt: instant,
  closesAt: instant,
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  showResult: z.boolean().default(true),
  passingScore: decimal.pipe(z.number().min(0)),
  attemptCriterion: z.enum(["BEST", "LAST"]).default("BEST"),
  assessmentId: z.string().uuid().nullable().optional(),
};

export const ExamCreateDto = z
  .object(examFields)
  .strict()
  .refine((v) => new Date(v.opensAt) < new Date(v.closesAt), { message: "INVALID_RANGE", path: ["closesAt"] })
  .openapi("OnlineExamCreateInput");
registry.register("OnlineExamCreateInput", ExamCreateDto);
export type ExamCreateInput = z.infer<typeof ExamCreateDto>;

const { groupId: _group, ...editable } = examFields;
export const ExamUpdateDto = z
  .object({
    ...editable,
    maxAttempts: editable.maxAttempts.removeDefault(),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    showResult: z.boolean(),
    attemptCriterion: z.enum(["BEST", "LAST"]),
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
          .object({ questionId: z.string().uuid(), points: decimal.pipe(z.number().gt(0).max(1000)).optional() })
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
    title: z.string(),
    instructions: z.string().nullable(),
    durationMin: z.number().int(),
    maxAttempts: z.number().int(),
    opensAt: z.string(),
    closesAt: z.string(),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    showResult: z.boolean(),
    passingScore: z.number(),
    attemptCriterion: z.enum(["BEST", "LAST"]),
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
      sortOrder: z.number().int(),
      points: z.number(),
      type: z.string(),
      topic: z.string().nullable(),
      text: z.string(),
      status: z.enum(["ACTIVE", "INACTIVE"]),
    })
  ),
}).openapi("OnlineExamDetail");
registry.register("OnlineExamDetail", ExamDetailSchema);
export type ExamDetail = z.infer<typeof ExamDetailSchema>;

// --- Intentos -----------------------------------------------------------------

const answerValue = z.union([z.string().max(5000), z.array(z.string().uuid()).max(10), z.null()]);

export const SaveAnswersDto = z
  .object({
    answers: z.array(z.object({ questionId: z.string().uuid(), answer: answerValue }).strict()).min(1, "REQUIRED_FIELD").max(200),
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
    pointsEarned: decimal.pipe(z.number().min(0)),
    isCorrect: z.boolean().optional(),
    comment: z.string().trim().max(1000).optional(),
  })
  .strict()
  .openapi("ReviewAnswerInput");
registry.register("ReviewAnswerInput", ReviewDto);
export type ReviewInput = z.infer<typeof ReviewDto>;

export interface AttemptQuestionView {
  questionId: string;
  sortOrder: number;
  type: string;
  text: string;
  points: number;
  options: Array<{ id: string; text: string; isCorrect?: boolean }>;
  answer: string | string[] | null;
  isCorrect?: boolean | null;
  pointsEarned?: number | null;
  comment?: string | null;
}

export interface AttemptView {
  attemptId: string;
  examId: string;
  title: string;
  instructions: string | null;
  number: number;
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  student: { id: string; studentNumber: string; name: string };
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
