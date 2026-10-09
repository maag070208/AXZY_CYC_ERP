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
  nombre: string;
  courseId: string;
  courseClave: string;
  courseNombre: string;
  termId: string;
  termNombre: string;
  termActivo: boolean;
  teacherId: string | null;
  teacherNombre: string | null;
  cupo: number;
  inscritos: number;
  disponibles: number;
  horario: ScheduleSlot[];
  aula: string | null;
  active: boolean;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupInput {
  courseId?: string;
  termId?: string;
  teacherId?: string | null;
  nombre?: string;
  cupo?: number;
  horario?: ScheduleSlot[];
  aula?: string | null;
}

export type EnrollmentStatus = "INSCRITO" | "BAJA" | "ACREDITADO" | "REPROBADO";

export interface Enrollment {
  id: string;
  studentId: string;
  matricula: string;
  studentNombre: string;
  studentStatus: "ACTIVO" | "BAJA";
  groupId: string;
  groupNombre: string;
  courseNombre: string;
  termNombre: string;
  fecha: string;
  status: EnrollmentStatus;
  finalGrade: number | null;
  bajaAt: string | null;
  bajaMotivo: string | null;
  transferredToId: string | null;
  createdAt: string;
}
