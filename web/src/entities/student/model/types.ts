export type StudentStatus = "ACTIVO" | "BAJA";
export type Gender = "M" | "F" | "OTRO";

export interface Guardian {
  id?: string;
  nombre: string;
  parentesco: string;
  telefono: string;
  email: string | null;
  esResponsablePago: boolean;
}

/** Alumno (`/students`); fechas como día del calendario `AAAA-MM-DD`. */
export interface Student {
  id: string;
  matricula: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombreCompleto: string;
  curp: string;
  fechaNacimiento: string;
  genero: Gender | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  status: StudentStatus;
  fechaIngreso: string;
  userId: string | null;
  guardians: Guardian[];
  createdAt: string;
  updatedAt: string;
}

export interface StudentInput {
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string | null;
  curp?: string;
  fechaNacimiento?: string;
  genero?: Gender | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  fechaIngreso?: string;
  guardians?: Omit<Guardian, "id">[];
  /** Confirma el alta aunque exista alguien con el mismo nombre y nacimiento. */
  confirmDuplicate?: boolean;
}

export interface StudentSummary {
  total: number;
  activos: number;
  bajas: number;
}

export type MovementType = "BAJA" | "REINGRESO";

export interface StudentMovement {
  id: string;
  studentId: string;
  tipo: MovementType;
  motivo: string;
  reasonId: string | null;
  fecha: string;
  observaciones: string | null;
  createdBy: string;
  authorName: string | null;
  createdAt: string;
}

export interface MovementInput {
  motivo: string;
  reasonId?: string | null;
  fecha?: string;
  observaciones?: string | null;
}

export interface MovementResult {
  studentId: string;
  status: StudentStatus;
  movement: StudentMovement;
  cancelledEnrollments: number;
}
