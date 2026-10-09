export type StudentStatus = "ACTIVE" | "WITHDRAWN";
export type Gender = "M" | "F" | "OTHER";

export interface Guardian {
  id?: string;
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  isPaymentResponsible: boolean;
}

/** Alumno (`/students`); fechas como día del calendario `AAAA-MM-DD`. */
export interface Student {
  id: string;
  studentNumber: string;
  firstNames: string;
  paternalSurname: string;
  maternalSurname: string | null;
  fullName: string;
  curp: string;
  birthDate: string;
  gender: Gender | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: StudentStatus;
  enrollmentDate: string;
  userId: string | null;
  guardians: Guardian[];
  createdAt: string;
  updatedAt: string;
}

export interface StudentInput {
  firstNames?: string;
  paternalSurname?: string;
  maternalSurname?: string | null;
  curp?: string;
  birthDate?: string;
  gender?: Gender | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  enrollmentDate?: string;
  guardians?: Omit<Guardian, "id">[];
  /** Confirma el alta aunque exista alguien con el mismo nombre y nacimiento. */
  confirmDuplicate?: boolean;
}

export interface StudentSummary {
  total: number;
  active: number;
  withdrawn: number;
}

export type MovementType = "WITHDRAWAL" | "REENTRY";

export interface StudentMovement {
  id: string;
  studentId: string;
  type: MovementType;
  reason: string;
  reasonId: string | null;
  date: string;
  notes: string | null;
  createdBy: string;
  authorName: string | null;
  createdAt: string;
}

export interface MovementInput {
  reason: string;
  reasonId?: string | null;
  date?: string;
  notes?: string | null;
}

export interface MovementResult {
  studentId: string;
  status: StudentStatus;
  movement: StudentMovement;
  cancelledEnrollments: number;
}
