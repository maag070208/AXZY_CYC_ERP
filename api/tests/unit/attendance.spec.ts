import { test, expect } from "@playwright/test";
import {
  alertTransition,
  attendancePct,
  belowThreshold,
  canJustify,
  emptyCounts,
  statusAfterResolution,
} from "../../src/modules/attendance/models/entity/attendance-rules";

/** M18 §4.4–4.6: porcentaje, umbral y justificación (sin BD). */

const counts = (c: Partial<ReturnType<typeof emptyCounts>>) => ({ ...emptyCounts(), ...c });

test("porcentaje: solo la falta resta; retardo y justificada cuentan como asistencia", () => {
  expect(attendancePct(counts({ PRESENT: 7, ABSENT: 2, LATE: 1 }))).toBe(80);
  expect(attendancePct(counts({ PRESENT: 1, JUSTIFIED: 1 }))).toBe(100);
  expect(attendancePct(counts({ PRESENT: 2, ABSENT: 1 }))).toBe(66.67);
  expect(attendancePct(emptyCounts())).toBeNull();
});

test("umbral: estrictamente por debajo; sin sesiones no hay alerta", () => {
  expect(belowThreshold(79.99, 80)).toBe(true);
  expect(belowThreshold(80, 80)).toBe(false);
  expect(belowThreshold(null, 80)).toBe(false);
});

test("alerta: se dispara al cruzar, no se repite y se limpia al recuperar", () => {
  expect(alertTransition(60, 80, false)).toBe("TRIGGER");
  expect(alertTransition(60, 80, true)).toBe("NONE");
  expect(alertTransition(85, 80, true)).toBe("CLEAR");
  expect(alertTransition(85, 80, false)).toBe("NONE");
  expect(alertTransition(null, 80, true)).toBe("CLEAR");
});

test("justificante: solo faltas; aprobado → JUSTIFIED, rechazado → ABSENT", () => {
  expect(canJustify("ABSENT")).toBe(true);
  expect(canJustify("LATE")).toBe(false);
  expect(canJustify("JUSTIFIED")).toBe(false);
  expect(statusAfterResolution("APPROVED")).toBe("JUSTIFIED");
  expect(statusAfterResolution("REJECTED")).toBe("ABSENT");
});
