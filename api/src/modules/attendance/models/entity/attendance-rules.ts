/** Reglas puras de M18 (sin BD). Cubiertas por `tests/unit/attendance.spec.ts`. */

export const ATTENDANCE_STATUSES = ["PRESENTE", "FALTA", "RETARDO", "JUSTIFICADA"] as const;
export type AttendanceStatusValue = (typeof ATTENDANCE_STATUSES)[number];
export const JUSTIFICATION_STATUSES = ["PENDIENTE", "APROBADA", "RECHAZADA"] as const;

export const DEFAULT_ATTENDANCE_THRESHOLD = 80;
export const MAX_JUSTIFICATION_BYTES = 5 * 1024 * 1024;

export interface AttendanceCounts {
  PRESENTE: number;
  FALTA: number;
  RETARDO: number;
  JUSTIFICADA: number;
}

export const emptyCounts = (): AttendanceCounts => ({ PRESENTE: 0, FALTA: 0, RETARDO: 0, JUSTIFICADA: 0 });

export const totalOf = (c: AttendanceCounts): number => c.PRESENTE + c.FALTA + c.RETARDO + c.JUSTIFICADA;

/**
 * Porcentaje de asistencia (M18 §4.4): solo la falta resta; el retardo cuenta
 * como asistencia y la justificada no penaliza. Sobre las sesiones vigentes con
 * pase registrado para la inscripción; `null` si aún no hay ninguna.
 */
export const attendancePct = (c: AttendanceCounts): number | null => {
  const total = totalOf(c);
  if (total === 0) return null;
  return Math.round(((total - c.FALTA) / total) * 10_000) / 100;
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
export const canJustify = (status: AttendanceStatusValue): boolean => status === "FALTA";

export const statusAfterResolution = (decision: "APROBADA" | "RECHAZADA"): AttendanceStatusValue =>
  decision === "APROBADA" ? "JUSTIFICADA" : "FALTA";
