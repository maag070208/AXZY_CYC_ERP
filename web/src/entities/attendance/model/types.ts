// Tipos del módulo de asistencia (M18): sesiones, pase de lista, porcentajes y
// justificantes. Espejo de los DTO de la API.
export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "JUSTIFIED";
/** Estatus que se eligen en el pase de lista (la justificada la resuelve el justificante). */
export type AttendanceMark = "PRESENT" | "LATE" | "ABSENT";
export type JustificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export const ATTENDANCE_STATUSES: readonly AttendanceMark[] = ["PRESENT", "LATE", "ABSENT"];

/** Sesión de un grupo (`GET /groups/{id}/sessions`, M18). `fecha` es AAAA-MM-DD. */
export interface AttendanceSession {
  id: string;
  groupId: string;
  date: string;
  time: string | null;
  topic: string | null;
  recordedCount: number;
  absences: number;
  annulled: boolean;
  deleteReason: string | null;
  createdAt: string;
}

export interface SessionInput {
  date: string;
  time?: string | null;
  topic?: string | null;
}

/** Renglón del pase de lista. `locked` = tiene justificante pendiente/aprobado. */
export interface AttendanceRollRow {
  enrollmentId: string;
  studentId: string;
  studentNumber: string;
  name: string;
  attendanceId: string | null;
  status: AttendanceStatus | null;
  justification: JustificationStatus | null;
  locked: boolean;
}

/** Pase de lista completo de una sesión (`GET /attendance-sessions/{id}`). */
export interface AttendanceRoll extends AttendanceSession {
  group: { id: string; name: string; courseName: string; termName: string; closed: boolean };
  rows: AttendanceRollRow[];
}

export interface RollCallItem {
  enrollmentId: string;
  status: AttendanceMark;
}

/** Fila del resumen de asistencia por grupo. */
export interface AttendanceSummaryRow {
  enrollmentId: string;
  studentId: string;
  studentNumber: string;
  name: string;
  sessions: number;
  presentes: number;
  lates: number;
  absences: number;
  justified: number;
  percentage: number | null;
  alert: boolean;
}

export interface GroupAttendanceSummary {
  groupId: string;
  threshold: number;
  sessions: number;
  average: number | null;
  inAlert: number;
  rows: AttendanceSummaryRow[];
}

export interface StudentAttendanceRecord {
  attendanceId: string;
  sessionId: string;
  date: string;
  time: string | null;
  status: AttendanceStatus;
  justification: { id: string; status: JustificationStatus; note: string | null } | null;
}

export interface StudentAttendanceGroup extends Omit<AttendanceSummaryRow, "studentId" | "studentNumber" | "name"> {
  groupId: string;
  groupName: string;
  courseName: string;
  termName: string;
  records: StudentAttendanceRecord[];
}

export interface StudentAttendance {
  studentId: string;
  threshold: number;
  groups: StudentAttendanceGroup[];
}

/** Justificante de una falta (`/justifications`, M18). */
export interface Justification {
  id: string;
  attendanceId: string;
  status: JustificationStatus;
  reason: string;
  note: string | null;
  hasFile: boolean;
  fileName: string | null;
  date: string;
  time: string | null;
  groupId: string;
  groupName: string;
  courseName: string;
  studentId: string;
  studentNumber: string;
  name: string;
  resolvedAt: string | null;
  createdAt: string;
}
