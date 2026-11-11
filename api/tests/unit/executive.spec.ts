import { expect, test } from "@playwright/test";
import {
  catalogFromRows,
  loadPermissionsFixture,
  loadRolePermissionsFixture,
  matrixFromRows,
  resetCatalog,
  resetMatrix,
  setCatalog,
  setMatrix,
} from "../../src/core/permissions";
import { average, indicator, rate, seesInstitutionalMoney } from "../../src/modules/reports/models/entity/report";

/** Reglas puras de los indicadores ejecutivos (M21). */

test.describe("rate", () => {
  test("porcentaje con un decimal", () => {
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(1, 4)).toBe(25);
    expect(rate(4, 4)).toBe(100);
  });

  test("sin base no divide entre cero", () => {
    expect(rate(0, 0)).toBe(0);
    expect(rate(5, 0)).toBe(0);
  });
});

test.describe("average", () => {
  test("dos decimales; null sin datos", () => {
    expect(average([90, 50])).toBe(70);
    expect(average([10, 9, 9])).toBe(9.33);
    expect(average([])).toBeNull();
  });
});

test.describe("indicator", () => {
  test("variación absoluta y relativa frente al periodo anterior", () => {
    expect(indicator(4, 2)).toEqual({ value: 4, previous: 2, delta: 2, deltaPercent: 100 });
    expect(indicator(18.5, 25)).toEqual({ value: 18.5, previous: 25, delta: -6.5, deltaPercent: -26 });
  });

  test("sin periodo anterior o con base 0 no hay variación relativa", () => {
    expect(indicator(4, null)).toEqual({ value: 4, previous: null, delta: null, deltaPercent: null });
    expect(indicator(null, 3)).toEqual({ value: null, previous: 3, delta: null, deltaPercent: null });
    expect(indicator(5, 0)).toEqual({ value: 5, previous: 0, delta: 5, deltaPercent: null });
  });
});

test.describe("alcance del dinero en los tableros", () => {
  /** El alcance sale de la matriz de roles, no del mapa de la sesión. */
  const conMatriz = (roles: string[]): never =>
    ({ id: "u", roles, permissions: {} }) as never;

  test("las ganancias exigen reportes institucionales y administrar egresos", () => {
    // El catálogo también vive en la BD: sin él, `scopeOf` cierra todo (fail-closed).
    setCatalog(catalogFromRows(loadPermissionsFixture()));
    setMatrix(matrixFromRows(loadRolePermissionsFixture()));
    // Dirección: reportes institucionales + egresos.
    expect(seesInstitutionalMoney(conMatriz(["ADMIN"]))).toBe(true);
    // Oficina: ve cobranza, no el resultado del ejercicio.
    expect(seesInstitutionalMoney(conMatriz(["SCHOOL_CONTROL"]))).toBe(false);
    // Profesor y alumno: ninguna de las dos.
    expect(seesInstitutionalMoney(conMatriz(["TEACHER"]))).toBe(false);
    expect(seesInstitutionalMoney(conMatriz(["STUDENT"]))).toBe(false);
    resetMatrix();
    resetCatalog();
  });
});
