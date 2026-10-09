import { expect, test } from "@playwright/test";
import {
  applyDiscount,
  buildChargeSchedule,
  dueDayFor,
  monthsPerPeriod,
  planTotals,
} from "../../src/modules/programs/models/entity/program-rules";

/** Reglas puras de M22: meses por periodo, calendario de cargos y descuentos. */

test.describe("meses por periodo", () => {
  test("mapea el type de periodo y respeta el override", () => {
    expect(monthsPerPeriod("BIMONTHLY")).toBe(2);
    expect(monthsPerPeriod("TRIMESTER")).toBe(3);
    expect(monthsPerPeriod("QUADRIMESTER")).toBe(4);
    expect(monthsPerPeriod("SEMESTER")).toBe(6);
    expect(monthsPerPeriod("QUADRIMESTER", 5)).toBe(5);
    expect(monthsPerPeriod("QUADRIMESTER", 0)).toBe(4);
  });
});

test.describe("calendario de cargos", () => {
  test("3 cuatrimestres: 3 reinscripciones + 12 mensualidades", () => {
    const schedule = buildChargeSchedule({ periodCount: 3, monthsPerPeriod: 4, monthlyFee: 1500, enrollmentFee: 1000 });
    expect(schedule).toHaveLength(15);
    expect(schedule.filter((c) => c.kind === "ENROLLMENT")).toHaveLength(3);
    expect(schedule.filter((c) => c.kind === "MONTHLY")).toHaveLength(12);
    expect(schedule[0]).toMatchObject({ index: 0, kind: "ENROLLMENT", period: 1, monthOffset: 0, amount: 1000 });
    expect(schedule[1]).toMatchObject({ index: 1, kind: "MONTHLY", period: 1, monthInPeriod: 1, monthOffset: 0, amount: 1500 });
    expect(schedule[5]).toMatchObject({ index: 5, kind: "ENROLLMENT", period: 2, monthOffset: 4 });
    expect(schedule.at(-1)).toMatchObject({ index: 14, kind: "MONTHLY", period: 3, monthOffset: 11 });
  });

  test("reinscripción en 0 no genera cargos de inscripción", () => {
    const schedule = buildChargeSchedule({ periodCount: 2, monthsPerPeriod: 4, monthlyFee: 1000, enrollmentFee: 0 });
    expect(schedule).toHaveLength(8);
    expect(schedule.every((c) => c.kind === "MONTHLY")).toBe(true);
  });

  test("totales del plan", () => {
    const schedule = buildChargeSchedule({ periodCount: 3, monthsPerPeriod: 4, monthlyFee: 1500, enrollmentFee: 1000 });
    expect(planTotals(schedule)).toEqual({ charges: 15, enrollmentCharges: 3, monthlyCharges: 12, amount: 3 * 1000 + 12 * 1500 });
  });
});

test.describe("descuentos", () => {
  test("porcentaje, amount y porcentaje-gana; nunca negativo", () => {
    expect(applyDiscount(1500, { percent: 20 })).toBe(1200);
    expect(applyDiscount(1000, { amount: 500 })).toBe(500);
    expect(applyDiscount(1000, { percent: 10, amount: 999 })).toBe(900);
    expect(applyDiscount(100, { amount: 500 })).toBe(0);
    expect(applyDiscount(1000, {})).toBe(1000);
  });
});

test.describe("vencimientos", () => {
  test("día fijo del mes, con desplazamiento", () => {
    expect(dueDayFor("2026-09-01", 0, 5)).toBe("2026-09-05");
    expect(dueDayFor("2026-09-01", 4, 5)).toBe("2027-01-05");
    expect(dueDayFor("2026-09-15", 3, 10)).toBe("2026-12-10");
  });
});
