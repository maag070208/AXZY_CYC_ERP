import { expect, test } from "@playwright/test";
import { currentPeriodOf, parsePeriods } from "../../src/modules/config/models/entity/term-rules";

/** Periodos del ciclo (`Term.calendar`): parseo y periodo en curso (M09/M22). */
const CUATRIMESTRES = [
  { name: "Cuatrimestre 1", startDate: "2026-09-01", endDate: "2026-12-20" },
  { name: "Cuatrimestre 2", startDate: "2027-01-10", endDate: "2027-04-30" },
  { name: "Cuatrimestre 3", startDate: "2027-05-05", endDate: "2027-07-15" },
];

test.describe("periodos del ciclo", () => {
  test("ordena, marca el de hoy y no toca el calendario original", () => {
    const periods = parsePeriods([...CUATRIMESTRES].reverse(), "2026-10-16");
    expect(periods.map((p) => p.name)).toEqual(["Cuatrimestre 1", "Cuatrimestre 2", "Cuatrimestre 3"]);
    expect(periods.map((p) => p.current)).toEqual([true, false, false]);
    expect(currentPeriodOf(periods)?.name).toBe("Cuatrimestre 1");
  });

  test("los extremos pertenecen al periodo", () => {
    expect(parsePeriods(CUATRIMESTRES, "2026-09-01")[0].current).toBe(true);
    expect(parsePeriods(CUATRIMESTRES, "2026-12-20")[0].current).toBe(true);
    expect(currentPeriodOf(parsePeriods(CUATRIMESTRES, "2027-05-06"))?.name).toBe("Cuatrimestre 3");
  });

  test("fuera de todo periodo no hay periodo en curso", () => {
    expect(currentPeriodOf(parsePeriods(CUATRIMESTRES, "2027-08-01"))).toBeNull();
    expect(currentPeriodOf(parsePeriods(CUATRIMESTRES, "2026-08-15"))).toBeNull();
  });

  test("descarta periodos incompletos o sin nombre", () => {
    expect(
      parsePeriods(
        [
          { name: "Cuatrimestre 1", startDate: "2026-09-01", endDate: "2026-12-20" },
          { name: "Sin fin", startDate: "2026-09-01" },
          { name: "  ", startDate: "2026-09-01", endDate: "2026-12-20" },
          { name: "Fecha rara", startDate: "01/09/2026", endDate: "20/12/2026" },
          null,
          "Cuatrimestre 2",
        ],
        "2026-10-16"
      ).map((p) => p.name)
    ).toEqual(["Cuatrimestre 1"]);
  });

  test("un ciclo sin calendario no tiene periodos", () => {
    expect(parsePeriods(null, "2026-10-16")).toEqual([]);
    expect(parsePeriods({ name: "Cuatrimestre 1" }, "2026-10-16")).toEqual([]);
    expect(currentPeriodOf([])).toBeNull();
  });
});
