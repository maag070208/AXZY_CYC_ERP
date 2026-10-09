/** Reglas puras de M18 (sin BD). Cubiertas por `tests/unit/attendance.spec.ts`. */

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "JUSTIFIED"] as const;
export type AttendanceStatusValue = (typeof ATTENDANCE_STATUSES)[number];
export const JUSTIFICATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export const DEFAULT_ATTENDANCE_THRESHOLD = 80;
export const MAX_JUSTIFICATION_BYTES = 5 * 1024 * 1024;

export interface AttendanceCounts {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  JUSTIFIED: number;
}

export const emptyCounts = (): AttendanceCounts => ({ PRESENT: 0, ABSENT: 0, LATE: 0, JUSTIFIED: 0 });

export const totalOf = (c: AttendanceCounts): number => c.PRESENT + c.ABSENT + c.LATE + c.JUSTIFIED;

/**
 * Porcentaje de asistencia (M18 §4.4): solo la falta resta; el retardo cuenta
 * como asistencia y la justificada no penaliza. Sobre las sesiones vigentes con
 * pase registrado para la inscripción; `null` si aún no hay ninguna.
 */
export const attendancePct = (c: AttendanceCounts): number | null => {
  const total = totalOf(c);
  if (total === 0) return null;
  return Math.round(((total - c.ABSENT) / total) * 10_000) / 100;
};

/** ¿Está por debajo del umbral? (sin sesiones no hay alerta). */
export const belowThreshold = (pct: number | null, threshold: number): boolean => pct !== null && pct < threshold;

/**
 * Transición de la alerta (M18 §4.5): se emite al cruzar el umbral hacia abajo
 * y se limpia al recuperarlo; mientras siga abajo no se repite.
 */
export const alertTransition = (pct: number | null, threshold: number, alerted: boolean): "TRIGGER" | "CLEAR" | "NONE" => {
  const below = belowThreshold(pct, threshold);
  if (below && !alerted) return "TRIGGER";
  if (!below && alerted) return "CLEAR";
  return "NONE";
};

/** Solo una falta se justifica; al aprobarse pasa a JUSTIFICADA (M18 §4.6). */
export const canJustify = (status: AttendanceStatusValue): boolean => status === "ABSENT";

export const statusAfterResolution = (decision: "APPROVED" | "REJECTED"): AttendanceStatusValue =>
  decision === "APPROVED" ? "JUSTIFIED" : "ABSENT";
