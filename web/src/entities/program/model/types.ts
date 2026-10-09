// Tipos de M22 (carreras y plan de estudios).
export type PeriodType = "BIMONTHLY" | "TRIMESTER" | "QUADRIMESTER" | "SEMESTER";
export const PERIOD_TYPES: readonly PeriodType[] = ["BIMONTHLY", "TRIMESTER", "QUADRIMESTER", "SEMESTER"];

export interface Program {
  id: string;
  code: string;
  name: string;
  description: string | null;
  periodType: PeriodType;
  periodCount: number;
  monthsPerPeriod: number;
  monthlyFee: number;
  enrollmentFee: number;
  active: boolean;
  subjects: number;
  plans: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramSubject {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  periodIndex: number;
  sortOrder: number;
}

export interface ProgramDetail extends Program {
  subjectsList: ProgramSubject[];
}

export interface ProgramInput {
  code?: string;
  name?: string;
  description?: string | null;
  periodType?: PeriodType;
  periodCount?: number;
  monthsPerPeriod?: number | null;
  monthlyFee?: number;
  enrollmentFee?: number;
}

export interface ProgramSubjectInput {
  courseId: string;
  periodIndex: number;
  sortOrder?: number;
}
