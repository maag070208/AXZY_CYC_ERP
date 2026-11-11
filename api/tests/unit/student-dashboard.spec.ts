import { expect, test } from "@playwright/test";
import { parseSchedule, pendingCharges } from "../../src/modules/reports/services/student-dashboard.service";

/**
 * Reglas puras del Inicio del alumno (M21): el horario guardado en JSON y la
 * lista de cargos con saldo que se le muestra.
 */
test.describe("horario del grupo", () => {
  test("conserva los tramos completos", () => {
    expect(parseSchedule([{ day: "MONDAY", startTime: "08:00", endTime: "10:00" }])).toEqual([
      { day: "MONDAY", startTime: "08:00", endTime: "10:00" },
    ]);
  });

  test("descarta tramos incompletos en vez de romper el tablero", () => {
    expect(
      parseSchedule([
        { day: "MONDAY", startTime: "08:00", endTime: "10:00" },
        { day: "TUESDAY", startTime: "08:00" },
        { day: 3, startTime: "08:00", endTime: "10:00" },
        { startTime: "08:00", endTime: "10:00" },
        null,
        "MONDAY",
      ])
    ).toEqual([{ day: "MONDAY", startTime: "08:00", endTime: "10:00" }]);
  });

  test("un horario que no es lista queda vacío", () => {
    expect(parseSchedule(null)).toEqual([]);
    expect(parseSchedule({ day: "MONDAY" })).toEqual([]);
    expect(parseSchedule(undefined)).toEqual([]);
  });
});

test.describe("cargos con saldo", () => {
  const charge = (over: Record<string, unknown> = {}) => ({
    id: "c1",
    conceptName: "Colegiatura",
    description: "Colegiatura — Mes 1",
    dueDate: "2026-10-05",
    total: 1500,
    paid: 0,
    balance: 1500,
    overdue: true,
    // Campos que el estado de cuenta trae y **no** deben salir al alumno.
    studentId: "s1",
    studentName: "Ana",
    conceptType: "TUITION",
    payments: [{ id: "p1" }],
    cancelledAt: null,
    ...over,
  });

  test("deja fuera los cargos sin saldo", () => {
    const rows = pendingCharges([charge(), charge({ id: "c2", balance: 0, paid: 1500, overdue: false })]);
    expect(rows.map((row) => row.id)).toEqual(["c1"]);
  });

  test("ordena por vencimiento (lo más viejo primero)", () => {
    const rows = pendingCharges([
      charge({ id: "nuevo", dueDate: "2026-12-05" }),
      charge({ id: "viejo", dueDate: "2026-09-05" }),
      charge({ id: "medio", dueDate: "2026-10-05" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["viejo", "medio", "nuevo"]);
  });

  test("expone solo los campos del alumno y traduce el nombre del concepto", () => {
    const [row] = pendingCharges([charge()]);
    expect(Object.keys(row).sort()).toEqual(
      ["balance", "concept", "description", "dueDate", "id", "overdue", "paid", "total"].sort()
    );
    expect(row.concept).toBe("Colegiatura");
    expect(row.balance).toBe(1500);
  });

  test("sin cargos con saldo devuelve una lista vacía", () => {
    expect(pendingCharges([charge({ balance: 0 })])).toEqual([]);
    expect(pendingCharges([])).toEqual([]);
  });
});
