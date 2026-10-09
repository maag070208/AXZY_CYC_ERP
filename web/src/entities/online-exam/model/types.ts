export type ExamStatus = "BORRADOR" | "PUBLICADO" | "CERRADO";
export type AttemptStatus = "EN_CURSO" | "ENVIADO" | "EXPIRADO";
export type Criterion = "MEJOR" | "ULTIMO";

/** Examen en línea (`/online-exams`, M15). Fechas en ISO (UTC). */
export interface OnlineExam {
  id: string;
  groupId: string;
  groupNombre: string;
  courseId: string;
  courseNombre: string;
  termNombre: string;
  titulo: string;
  instrucciones: string | null;
  duracionMin: number;
  intentosMax: number;
  fechaApertura: string;
  fechaCierre: string;
  aleatorizarPreguntas: boolean;
  aleatorizarOpciones: boolean;
  mostrarResultado: boolean;
  puntajeAprobatorio: number;
  criterioIntentos: Criterion;
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
  questions: Array<{ questionId: string; orden: number; puntos: number; tipo: string; tema: string | null; enunciado: string; status: "ACTIVA" | "INACTIVA" }>;
}

export interface OnlineExamInput {
  groupId?: string;
  titulo?: string;
  instrucciones?: string | null;
  duracionMin?: number;
  intentosMax?: number;
  fechaApertura?: string;
  fechaCierre?: string;
  aleatorizarPreguntas?: boolean;
  aleatorizarOpciones?: boolean;
  mostrarResultado?: boolean;
  puntajeAprobatorio?: number;
  criterioIntentos?: Criterion;
  assessmentId?: string | null;
}

/** Examen visto por el alumno (`/online-exams/available`). */
export interface AvailableExam {
  examId: string;
  titulo: string;
  curso: string;
  grupo: string;
  fechaApertura: string;
  fechaCierre: string;
  duracionMin: number;
  intentosMax: number;
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
  orden: number;
  tipo: "OPCION_MULTIPLE" | "VERDADERO_FALSO" | "MULTIPLE_RESPUESTA" | "ABIERTA";
  enunciado: string;
  puntos: number;
  options: Array<{ id: string; texto: string; esCorrecta?: boolean }>;
  respuesta: AnswerValue;
  esCorrecta?: boolean | null;
  puntosObtenidos?: number | null;
  comentario?: string | null;
}

export interface Attempt {
  attemptId: string;
  examId: string;
  titulo: string;
  instrucciones: string | null;
  numero: number;
  status: AttemptStatus;
  student: { id: string; matricula: string; nombre: string };
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
    matricula: string;
    nombre: string;
    intentos: number;
    enCurso: boolean;
    pendientes: number;
    calificacion: number | null;
    aprobado: boolean | null;
    attempts: Array<{ attemptId: string; numero: number; status: AttemptStatus; score: number | null; pendingCount: number; focusLosses: number; startedAt: string; finishedAt: string | null }>;
  }>;
}
