export const WEEK_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** Bloque semanal `[horaInicio, horaFin)` en `HH:mm`. */
export interface ScheduleSlot {
  day: WeekDay;
  startTime: string;
  endTime: string;
}

/** Grupo (`/groups`, M07): curso + ciclo + profesor + cupo + horario. */
export interface Group {
  id: string;
  name: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  termId: string;
  termName: string;
  activeTerm: boolean;
  teacherId: string | null;
  teacherName: string | null;
  capacity: number;
  enrolledCount: number;
  available: number;
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
  studentName: string;
  studentStatus: "ACTIVE" | "WITHDRAWN";
  groupId: string;
  groupName: string;
  courseName: string;
  termName: string;
  date: string;
  status: EnrollmentStatus;
  finalGrade: number | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  transferredToId: string | null;
  createdAt: string;
}
