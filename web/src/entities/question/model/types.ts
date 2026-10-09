export type QuestionType = "OPCION_MULTIPLE" | "VERDADERO_FALSO" | "MULTIPLE_RESPUESTA" | "ABIERTA";
export const QUESTION_TYPES: readonly QuestionType[] = ["OPCION_MULTIPLE", "VERDADERO_FALSO", "MULTIPLE_RESPUESTA", "ABIERTA"];
export type Difficulty = "FACIL" | "MEDIA" | "DIFICIL";
export const DIFFICULTIES: readonly Difficulty[] = ["FACIL", "MEDIA", "DIFICIL"];

export interface QuestionOption {
  id?: string;
  texto: string;
  esCorrecta: boolean;
  orden?: number;
}

/** Reactivo del banco (`/questions`, M14). */
export interface Question {
  id: string;
  courseId: string;
  courseClave: string;
  courseNombre: string;
  tema: string | null;
  tipo: QuestionType;
  enunciado: string;
  puntos: number;
  dificultad: Difficulty | null;
  status: "ACTIVA" | "INACTIVA";
  options: QuestionOption[];
  usedInExams: number;
  /** Ya respondido en un intento: solo se puede desactivar. */
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionInput {
  courseId?: string;
  tema?: string | null;
  tipo?: QuestionType;
  enunciado?: string;
  puntos?: number;
  dificultad?: Difficulty | null;
  options?: Array<{ texto: string; esCorrecta: boolean }>;
}

export interface ImportResult {
  preview: boolean;
  total: number;
  valid: number;
  created: number;
  rejected: Array<{ row: number; code: string; message: string }>;
  sample: Array<{ row: number; curso: string; tipo: QuestionType; enunciado: string; puntos: number; opciones: number }>;
}
