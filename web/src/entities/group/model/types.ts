export const WEEK_DAYS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** Bloque semanal `[horaInicio, horaFin)` en `HH:mm`. */
export interface ScheduleSlot {
  dia: WeekDay;
  horaInicio: string;
  horaFin: string;
}

/** Grupo (`/groups`, M07): curso + ciclo + profesor + cupo + horario. */
export interface Group {
  id: string;
  name: string;
  courseId: string;
  courseClave: string;
  courseNombre: string;
  termId: string;
  termNombre: string;
  termActivo: boolean;
  teacherId: string | null;
  teacherNombre: string | null;
  capacity: number;
  inscritos: number;
  disponibles: number;
  schedule: ScheduleSlot[];
  classroom: string | null;
  active: boolean;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupInput {
  courseId?: string;
  termId?: string;
  teacherId?: string | null;
  name?: string;
  capacity?: number;
  schedule?: ScheduleSlot[];
  classroom?: string | null;
}

export type EnrollmentStatus = "ENROLLED" | "WITHDRAWN" | "PASSED" | "FAILED";

export interface Enrollment {
  id: string;
  studentId: string;
  studentNumber: string;
  studentNombre: string;
  studentStatus: "ACTIVE" | "WITHDRAWN";
  groupId: string;
  groupNombre: string;
  courseNombre: string;
  termNombre: string;
  date: string;
  status: EnrollmentStatus;
  finalGrade: number | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  transferredToId: string | null;
  createdAt: string;
}
