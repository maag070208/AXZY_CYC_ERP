export type TeacherStatus = "ACTIVO" | "INACTIVO";

export interface TeacherAccount {
  userId: string;
  username: string;
  active: boolean;
  /** Aún no define su contraseña (invitación pendiente). */
  pendingInvitation: boolean;
  lastLoginAt: string | null;
}

export interface Teacher {
  id: string;
  nombres: string;
  apellidos: string;
  nombreCompleto: string;
  email: string;
  telefono: string | null;
  especialidad: string | null;
  status: TeacherStatus;
  account: TeacherAccount | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherInput {
  nombres?: string;
  apellidos?: string;
  email?: string;
  telefono?: string | null;
  especialidad?: string | null;
}
