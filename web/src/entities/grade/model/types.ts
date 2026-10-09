export type AssessmentType = "PARCIAL" | "FINAL" | "TAREA" | "OTRO";
export const ASSESSMENT_TYPES: readonly AssessmentType[] = ["PARCIAL", "FINAL", "TAREA", "OTRO"];

/** Instrumento de evaluación (`/assessments`, M08). */
export interface Assessment {
  id: string;
  groupId: string;
  nombre: string;
  tipo: AssessmentType;
  ponderacion: number;
  fecha: string | null;
  maxScore: number;
  active: boolean;
  capturadas: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentInput {
  groupId?: string;
  nombre?: string;
  tipo?: AssessmentType;
  ponderacion?: number;
  fecha?: string | null;
  maxScore?: number;
}

export interface GradeInput {
  enrollmentId: string;
  score: number | null;
  observaciones?: string | null;
}

export type GradeResult = "ACREDITADO" | "REPROBADO";

export interface GradebookRow {
  enrollmentId: string;
  studentId: string;
  matricula: string;
  nombre: string;
  enrollmentStatus: "INSCRITO" | "BAJA" | "ACREDITADO" | "REPROBADO";
  scores: Record<string, number | null>;
  observaciones: Record<string, string | null>;
  final: number | null;
  missing: number;
  result: GradeResult | null;
}

/** Libro de calificaciones del grupo con proyección de la final. */
export interface Gradebook {
  group: {
    id: string;
    nombre: string;
    courseNombre: string;
    termNombre: string;
    teacherNombre: string | null;
    closedAt: string | null;
  };
  assessments: Array<Pick<Assessment, "id" | "nombre" | "tipo" | "ponderacion" | "maxScore">>;
  weightsTotal: number;
  approvalThreshold: number;
  complete: boolean;
  students: GradebookRow[];
}
