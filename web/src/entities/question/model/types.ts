export type QuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "MULTIPLE_ANSWER" | "OPEN";
export const QUESTION_TYPES: readonly QuestionType[] = ["MULTIPLE_CHOICE", "TRUE_FALSE", "MULTIPLE_ANSWER", "OPEN"];
export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export const DIFFICULTIES: readonly Difficulty[] = ["EASY", "MEDIUM", "HARD"];

export interface QuestionOption {
  id?: string;
  text: string;
  isCorrect: boolean;
  sortOrder?: number;
}

/** Reactivo del banco (`/questions`, M14). */
export interface Question {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  topic: string | null;
  type: QuestionType;
  text: string;
  points: number;
  difficulty: Difficulty | null;
  status: "ACTIVE" | "INACTIVE";
  options: QuestionOption[];
  usedInExams: number;
  /** Ya respondido en un intento: solo se puede desactivar. */
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionInput {
  courseId?: string;
  topic?: string | null;
  type?: QuestionType;
  text?: string;
  points?: number;
  difficulty?: Difficulty | null;
  options?: Array<{ text: string; isCorrect: boolean }>;
}

export interface ImportResult {
  preview: boolean;
  total: number;
  valid: number;
  created: number;
  rejected: Array<{ row: number; code: string; message: string }>;
  sample: Array<{ row: number; courseName: string; type: QuestionType; text: string; points: number; optionCount: number }>;
}
