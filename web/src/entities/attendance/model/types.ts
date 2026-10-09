// Tipos del módulo de asistencia (M18): sesiones, pase de lista, porcentajes y
// justificantes. Espejo de los DTO de la API.
export type AttendanceStatus = "PRESENTE" | "RETARDO" | "FALTA" | "JUSTIFICADA";
/** Estatus que se eligen en el pase de lista (la justificada la resuelve el justificante). */
export type AttendanceMark = "PRESENTE" | "RETARDO" | "FALTA";
export type JustificationStatus = "PENDIENTE" | "APROBADA" | "RECHAZADA";

export const ATTENDANCE_STATUSES: readonly AttendanceMark[] = ["PRESENTE", "RETARDO", "FALTA"];

/** Sesión de un grupo (`GET /groups/{id}/sessions`, M18). `fecha` es AAAA-MM-DD. */
export interface AttendanceSession {
  id: string;
  groupId: string;
  fecha: string;
  hora: string | null;
  tema: string | null;
  registrados: number;
  faltas: number;
  annulled: boolean;
  deleteReason: string | null;
  createdAt: string;
}

export interface SessionInput {
  fecha: string;
  hora?: string | null;
  tema?: string | null;
}

/** Renglón del pase de lista. `locked` = tiene justificante pendiente/aprobado. */
export interface AttendanceRollRow {
  enrollmentId: string;
  studentId: string;
  matricula: string;
  nombre: string;
  attendanceId: string | null;
  status: AttendanceStatus | null;
  justification: JustificationStatus | null;
  locked: boolean;
}

/** Pase de lista completo de una sesión (`GET /attendance-sessions/{id}`). */
export interface AttendanceRoll extends AttendanceSession {
  group: { id: string; nombre: string; courseNombre: string; termNombre: string; closed: boolean };
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
  matricula: string;
  nombre: string;
  sesiones: number;
  presentes: number;
  retardos: number;
  faltas: number;
  justificadas: number;
  porcentaje: number | null;
  alerta: boolean;
}

export interface GroupAttendanceSummary {
  groupId: string;
  threshold: number;
  sesiones: number;
  promedio: number | null;
  enAlerta: number;
  rows: AttendanceSummaryRow[];
}

export interface StudentAttendanceRecord {
  attendanceId: string;
  sessionId: string;
  fecha: string;
  hora: string | null;
  status: AttendanceStatus;
  justification: { id: string; status: JustificationStatus; nota: string | null } | null;
}

export interface StudentAttendanceGroup extends Omit<AttendanceSummaryRow, "studentId" | "matricula" | "nombre"> {
  groupId: string;
  grupo: string;
  curso: string;
  ciclo: string;
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
  motivo: string;
  nota: string | null;
  hasFile: boolean;
  archivoNombre: string | null;
  fecha: string;
  hora: string | null;
  groupId: string;
  grupo: string;
  curso: string;
  studentId: string;
  matricula: string;
  nombre: string;
  resolvedAt: string | null;
  createdAt: string;
}
