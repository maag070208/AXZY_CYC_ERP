import { test, expect } from "@playwright/test";
import {
  balanceOf,
  chargeStatusOf,
  chargeTotal,
  daysBetween,
  formatFolio,
  isCents,
  lateFeeOf,
  sumOf,
} from "../../src/modules/finance/models/entity/money";
import { ChargeCreateDto, PaymentCreateDto } from "../../src/modules/finance/models/dto/finance.dto";
import { isReportType, lastMonths, monthRange } from "../../src/modules/reports/models/entity/report";

/** M09/M10 puros: dinero en decimal, estatus del cargo, recargo, folio y periodos. */

test.describe("dinero (M09)", () => {
  test("totales y sumas en decimal exacto", () => {
    expect(chargeTotal(2500, 500)).toBe(2000);
    expect(sumOf([0.1, 0.2])).toBe(0.3);
    expect(sumOf([1000.1, 999.9, 0.005])).toBe(2000.01);
    expect(balanceOf(1000, 1200)).toBe(0);
    expect(balanceOf(1000, 333.33)).toBe(666.67);
  });

  test("estatus: PENDIENTE → PARCIAL → PAGADO; cancelado se queda cancelado", () => {
    expect(chargeStatusOf(1000, 0)).toBe("PENDIENTE");
    expect(chargeStatusOf(1000, 0.01)).toBe("PARCIAL");
    expect(chargeStatusOf(1000, 999.99)).toBe("PARCIAL");
    expect(chargeStatusOf(1000, 1000)).toBe("PAGADO");
    expect(chargeStatusOf(1000, 1000, true)).toBe("CANCELADO");
  });

  test("recargo por mora: tasa diaria sobre el saldo después de la gracia", () => {
    const rule = { enabled: true, dailyRate: 0.01, graceDays: 5 };
    expect(lateFeeOf(1000, "2026-01-01", "2026-01-16", rule)).toBe(100);
    expect(lateFeeOf(1000, "2026-01-01", "2026-01-06", rule)).toBe(0);
    expect(lateFeeOf(0, "2026-01-01", "2026-03-01", rule)).toBe(0);
    expect(lateFeeOf(1000, "2026-01-01", "2026-03-01", { ...rule, enabled: false })).toBe(0);
    expect(lateFeeOf(333.33, "2026-01-01", "2026-01-08", { enabled: true, dailyRate: 0.0015, graceDays: 0 })).toBe(3.5);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  test("folio consecutivo con año y relleno", () => {
    expect(formatFolio(2026, 123)).toBe("REC-2026-000123");
    expect(formatFolio(2027, 1)).toBe("REC-2027-000001");
  });

  test("montos: máximo 2 decimales; pago > 0; método del catálogo", () => {
    expect(isCents(1500.5)).toBe(true);
    expect(isCents(10.005)).toBe(false);
    const chargeId = crypto.randomUUID();
    expect(PaymentCreateDto.safeParse({ chargeId, monto: 100.25, metodo: "EFECTIVO" }).success).toBe(true);
    expect(PaymentCreateDto.safeParse({ chargeId, monto: 0, metodo: "EFECTIVO" }).success).toBe(false);
    expect(PaymentCreateDto.safeParse({ chargeId, monto: 10.001, metodo: "EFECTIVO" }).success).toBe(false);
    expect(PaymentCreateDto.safeParse({ chargeId, monto: 10, metodo: "CHEQUE" }).success).toBe(false);
    expect(
      ChargeCreateDto.safeParse({ studentId: chargeId, conceptId: chargeId, fechaVencimiento: "2026-02-30" }).success
    ).toBe(false);
  });
});

test.describe("reportes (M10)", () => {
  test("periodos: mes calendario y últimos meses", () => {
    expect(monthRange("2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02-01")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(lastMonths("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  test("catálogo cerrado de tipos", () => {
    expect(isReportType("debts")).toBe(true);
    expect(isReportType("attendance-list")).toBe(false);
  });
});
