export type ExamStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
export type Criterion = "BEST" | "LAST";

/** Examen en línea (`/online-exams`, M15). Fechas en ISO (UTC). */
export interface OnlineExam {
  id: string;
  groupId: string;
  groupNombre: string;
  courseId: string;
  courseNombre: string;
  termNombre: string;
  title: string;
  instructions: string | null;
  durationMin: number;
  maxAttempts: number;
  opensAt: string;
  closesAt: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResult: boolean;
  passingScore: number;
  attemptCriterion: Criterion;
  assessmentId: string | null;
  assessmentNombre: string | null;
  status: ExamStatus;
  totalPuntos: number;
  preguntas: number;
  intentos: number;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface OnlineExamDetail extends OnlineExam {
  questions: Array<{ questionId: string; sortOrder: number; points: number; type: string; topic: string | null; text: string; status: "ACTIVE" | "INACTIVE" }>;
}

export interface OnlineExamInput {
  groupId?: string;
  title?: string;
  instructions?: string | null;
  durationMin?: number;
  maxAttempts?: number;
  opensAt?: string;
  closesAt?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResult?: boolean;
  passingScore?: number;
  attemptCriterion?: Criterion;
  assessmentId?: string | null;
}

/** Examen visto por el alumno (`/online-exams/available`). */
export interface AvailableExam {
  examId: string;
  title: string;
  curso: string;
  grupo: string;
  opensAt: string;
  closesAt: string;
  durationMin: number;
  maxAttempts: number;
  intentosUsados: number;
  totalPuntos: number;
  state: "NOT_PUBLISHED" | "NOT_OPEN" | "CLOSED" | "OPEN";
  inProgressAttemptId: string | null;
  canStart: boolean;
  lastAttempt: { attemptId: string; status: AttemptStatus; finishedAt: string | null; score: number | null; pendingCount: number | null } | null;
}

export type AnswerValue = string | string[] | null;

export interface AttemptQuestion {
  questionId: string;
  sortOrder: number;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "MULTIPLE_ANSWER" | "OPEN";
  text: string;
  points: number;
  options: Array<{ id: string; text: string; isCorrect?: boolean }>;
  answer: AnswerValue;
  isCorrect?: boolean | null;
  pointsEarned?: number | null;
  comment?: string | null;
}

export interface Attempt {
  attemptId: string;
  examId: string;
  title: string;
  instructions: string | null;
  number: number;
  status: AttemptStatus;
  student: { id: string; studentNumber: string; name: string };
  startedAt: string;
  endsAt: string;
  finishedAt: string | null;
  remainingSeconds: number;
  serverTime: string;
  focusLosses: number;
  questions: AttemptQuestion[];
  result: { score: number; totalPuntos: number; pendingCount: number; aprobado: boolean | null } | null;
}

export interface ExamResults {
  exam: OnlineExamDetail;
  kpis: { inscritos: number; presentaron: number; promedio: number | null; aprobados: number; pendientesRevision: number; totalPuntos: number };
  rows: Array<{
    enrollmentId: string;
    studentId: string;
    studentNumber: string;
    name: string;
    intentos: number;
    enCurso: boolean;
    pendientes: number;
    calificacion: number | null;
    aprobado: boolean | null;
    attempts: Array<{ attemptId: string; number: number; status: AttemptStatus; score: number | null; pendingCount: number; focusLosses: number; startedAt: string; finishedAt: string | null }>;
  }>;
}
