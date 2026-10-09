import { test, expect } from "@playwright/test";
import { CURP_PATTERN, curpCheckDigit, isValidCurp } from "../../src/core/utils/curp";
import { ageOn, isRealDay, todayInBusinessZone } from "../../src/core/utils/day";
import { assertGuardians, formatStudentNumber } from "../../src/modules/students/services/student.service";

/** Reglas puras de M03: CURP, matrícula, tutores y fechas de calendario. */

const withCheckDigit = (first17: string) => `${first17}${curpCheckDigit(first17)}`;

test.describe("CURP", () => {
  test("acepta una CURP con estructura y dígito verificador correctos", () => {
    const curp = withCheckDigit("PELJ100101HDFRXN0");
    expect(isValidCurp(curp)).toBe(true);
    expect(isValidCurp(curp.toLowerCase())).toBe(true);
  });

  test("rechaza el dígito verificador incorrecto", () => {
    const curp = withCheckDigit("PELJ100101HDFRXN0");
    const wrong = `${curp.slice(0, 17)}${(Number(curp[17]) + 1) % 10}`;
    expect(isValidCurp(wrong)).toBe(false);
  });

  test("rechaza fecha, sexo o entidad imposibles y longitudes distintas a 18", () => {
    expect(CURP_PATTERN.test("PELJ101301HDFRXN01")).toBe(false); // mes 13
    expect(CURP_PATTERN.test("PELJ100101ZDFRXN01")).toBe(false); // sexo Z
    expect(CURP_PATTERN.test("PELJ100101HXXRXN01")).toBe(false); // entity XX
    expect(isValidCurp("PELJ100101HDFRXN")).toBe(false);
  });
});

test.describe("matrícula", () => {
  test("formato AAAA-NNNN con relleno de ceros", () => {
    expect(formatStudentNumber(2026, 1)).toBe("2026-0001");
    expect(formatStudentNumber(2026, 42)).toBe("2026-0042");
    expect(formatStudentNumber(2026, 12345)).toBe("2026-12345");
  });
});

test.describe("tutores", () => {
  const tutor = (isPaymentResponsible = false) => ({ name: "T", relationship: "Madre", phone: "5512345678", isPaymentResponsible });

  test("menor de edad sin tutores → GUARDIAN_REQUIRED", () => {
    expect(() => assertGuardians("2012-05-01", [], "2026-10-09")).toThrow(expect.objectContaining({ code: "GUARDIAN_REQUIRED" }));
    expect(() => assertGuardians("2012-05-01", [tutor()], "2026-10-09")).not.toThrow();
  });

  test("mayor de edad puede no tener tutores (cumple 18 el mismo día)", () => {
    expect(() => assertGuardians("2008-10-09", [], "2026-10-09")).not.toThrow();
    expect(() => assertGuardians("2008-10-10", [], "2026-10-09")).toThrow();
  });

  test("solo un responsable de pago", () => {
    expect(() => assertGuardians("2000-01-01", [tutor(true), tutor(true)], "2026-10-09")).toThrow(
      expect.objectContaining({ code: "MULTIPLE_PAYMENT_RESPONSIBLES" })
    );
  });
});

test.describe("días del calendario", () => {
  test("edad cumplida", () => {
    expect(ageOn("2008-10-09", "2026-10-09")).toBe(18);
    expect(ageOn("2008-10-10", "2026-10-09")).toBe(17);
  });

  test("rechaza días que no existen", () => {
    expect(isRealDay("2026-02-29")).toBe(false);
    expect(isRealDay("2028-02-29")).toBe(true);
    expect(isRealDay("2026-13-01")).toBe(false);
  });

  test("hoy en America/Mexico_City (no en UTC)", () => {
    // 2026-10-10 03:00 UTC = 2026-10-09 21:00 en CDMX.
    expect(todayInBusinessZone(new Date("2026-10-10T03:00:00Z"))).toBe("2026-10-09");
  });
});
