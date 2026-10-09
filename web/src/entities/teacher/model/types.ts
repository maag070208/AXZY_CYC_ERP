export type TeacherStatus = "ACTIVE" | "INACTIVE";

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
  firstNames: string;
  surnames: string;
  nombreCompleto: string;
  email: string;
  phone: string | null;
  specialty: string | null;
  status: TeacherStatus;
  account: TeacherAccount | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherInput {
  firstNames?: string;
  surnames?: string;
  email?: string;
  phone?: string | null;
  specialty?: string | null;
}
