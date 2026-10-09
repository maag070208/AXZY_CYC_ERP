export type AssessmentType = "PARTIAL" | "FINAL" | "HOMEWORK" | "OTHER";
export const ASSESSMENT_TYPES: readonly AssessmentType[] = ["PARTIAL", "FINAL", "HOMEWORK", "OTHER"];

/** Instrumento de evaluación (`/assessments`, M08). */
export interface Assessment {
  id: string;
  groupId: string;
  name: string;
  type: AssessmentType;
  weight: number;
  date: string | null;
  maxScore: number;
  active: boolean;
  capturadas: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentInput {
  groupId?: string;
  name?: string;
  type?: AssessmentType;
  weight?: number;
  date?: string | null;
  maxScore?: number;
}

export interface GradeInput {
  enrollmentId: string;
  score: number | null;
  notes?: string | null;
}

export type GradeResult = "PASSED" | "FAILED";

export interface GradebookRow {
  enrollmentId: string;
  studentId: string;
  studentNumber: string;
  name: string;
  enrollmentStatus: "ENROLLED" | "WITHDRAWN" | "PASSED" | "FAILED";
  scores: Record<string, number | null>;
  notes: Record<string, string | null>;
  final: number | null;
  missing: number;
  result: GradeResult | null;
}

/** Libro de calificaciones del grupo con proyección de la final. */
export interface Gradebook {
  group: {
    id: string;
    name: string;
    courseNombre: string;
    termNombre: string;
    teacherNombre: string | null;
    closedAt: string | null;
  };
  assessments: Array<Pick<Assessment, "id" | "name" | "type" | "weight" | "maxScore">>;
  weightsTotal: number;
  approvalThreshold: number;
  complete: boolean;
  students: GradebookRow[];
}
