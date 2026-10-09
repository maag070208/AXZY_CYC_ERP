import { expect, test } from "@playwright/test";
import {
  groupExpensesByMonth,
  groupExpensesByType,
  isDueDateValid,
  isExpenseOverdue,
  isExpenseType,
} from "../../src/modules/expenses/models/entity/expense-rules";
import { ExpenseCreateDto, ExpenseUpdateDto } from "../../src/modules/expenses/models/dto/expense.dto";

/** Reglas puras de M23 (gastos institucionales). */

test.describe("mora del gasto", () => {
  test("solo un compromiso pendiente con vencimiento anterior a hoy", () => {
    expect(isExpenseOverdue("PENDING", "2026-01-10", "2026-01-11")).toBe(true);
    expect(isExpenseOverdue("PENDING", "2026-01-11", "2026-01-11")).toBe(false);
    expect(isExpenseOverdue("PENDING", "2026-02-01", "2026-01-11")).toBe(false);
  });

  test("un gasto pagado o cancelado nunca genera mora, y sin vencimiento tampoco", () => {
    expect(isExpenseOverdue("PAID", "2026-01-10", "2026-01-11")).toBe(false);
    expect(isExpenseOverdue("CANCELLED", "2026-01-10", "2026-01-11")).toBe(false);
    expect(isExpenseOverdue("PENDING", null, "2026-01-11")).toBe(false);
  });
});

test.describe("vencimiento contra fecha del gasto", () => {
  test("el vencimiento puede ser el mismo día o posterior", () => {
    expect(isDueDateValid("2026-01-10", "2026-01-10")).toBe(true);
    expect(isDueDateValid("2026-01-10", "2026-02-01")).toBe(true);
  });

  test("un vencimiento anterior a la fecha no es válido; sin vencimiento sí", () => {
    expect(isDueDateValid("2026-01-10", "2026-01-09")).toBe(false);
    expect(isDueDateValid("2026-01-10", null)).toBe(true);
    expect(isDueDateValid("2026-01-10", undefined)).toBe(true);
  });
});

test.describe("agrupado por tipo", () => {
  test("suma por tipo, cuenta filas y ordena de mayor a menor", () => {
    const rows = [
      { type: "PAYROLL", amount: 1000 },
      { type: "SERVICES", amount: 250.5 },
      { type: "PAYROLL", amount: 500 },
      { type: "SERVICES", amount: 249.5 },
    ];
    expect(groupExpensesByType(rows)).toEqual([
      { type: "PAYROLL", total: 1500, count: 2 },
      { type: "SERVICES", total: 500, count: 2 },
    ]);
  });

  test("sin filas no hay grupos y los tipos sin gasto no aparecen", () => {
    expect(groupExpensesByType([])).toEqual([]);
    expect(groupExpensesByType([{ type: "TAXES", amount: 100 }])).toEqual([{ type: "TAXES", total: 100, count: 1 }]);
  });

  test("redondea a centavos", () => {
    expect(groupExpensesByType([{ type: "SUPPLIES", amount: 0.1 }, { type: "SUPPLIES", amount: 0.2 }])).toEqual([
      { type: "SUPPLIES", total: 0.3, count: 2 },
    ]);
  });
});

test.describe("serie mensual", () => {
  test("agrupa por mes de la fecha y ordena cronológicamente", () => {
    const rows = [
      { date: "2026-10-05", amount: 100 },
      { date: "2026-09-30", amount: 50 },
      { date: "2026-10-20", amount: 25 },
    ];
    expect(groupExpensesByMonth(rows)).toEqual([
      { month: "2026-09", total: 50 },
      { month: "2026-10", total: 125 },
    ]);
  });
});

test.describe("catálogo de tipos", () => {
  test("acepta los tipos del catálogo y rechaza cualquier otro", () => {
    expect(isExpenseType("PAYROLL")).toBe(true);
    expect(isExpenseType("OTHER")).toBe(true);
    expect(isExpenseType("RENT")).toBe(false);
    expect(isExpenseType("payroll")).toBe(false);
  });
});

test.describe("DTO de alta", () => {
  const base = {
    date: "2026-10-05",
    concept: "Renta del local",
    type: "SERVICES" as const,
    amount: 18000.5,
  };

  test("acepta un gasto mínimo y normaliza los opcionales vacíos a null", () => {
    const parsed = ExpenseCreateDto.parse({ ...base, vendor: "", notes: "" });
    expect(parsed.status).toBe("PENDING");
    expect(parsed.vendor).toBeNull();
    expect(parsed.notes).toBeNull();
    expect(parsed.termId).toBeUndefined();
  });

  test("rechaza monto no positivo, decimales inválidos, tipo desconocido y fecha inexistente", () => {
    // El vencimiento anterior a la fecha lo valida el servicio (DUE_DATE_BEFORE_DATE),
    // no el DTO: ver `isDueDateValid` arriba y el contrato de la API.
    expect(ExpenseCreateDto.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(ExpenseCreateDto.safeParse({ ...base, amount: 10.005 }).success).toBe(false);
    expect(ExpenseCreateDto.safeParse({ ...base, type: "RENT" }).success).toBe(false);
    expect(ExpenseCreateDto.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
  });

  test("el mismo día de vencimiento es válido", () => {
    const parsed = ExpenseCreateDto.parse({ ...base, dueDate: "2026-10-05" });
    expect(parsed.dueDate).toBe("2026-10-05");
  });
});

test.describe("DTO de edición", () => {
  test("exige al menos un campo", () => {
    expect(ExpenseUpdateDto.safeParse({}).success).toBe(false);
    expect(ExpenseUpdateDto.safeParse({ amount: 100 }).success).toBe(true);
  });

  test("no admite cambiar el estatus a cancelado por esta vía", () => {
    // La cancelación es una operación con motivo (`DELETE`), no una edición.
    expect(ExpenseUpdateDto.safeParse({ status: "CANCELLED" }).success).toBe(false);
    expect(ExpenseUpdateDto.safeParse({ status: "PAID" }).success).toBe(true);
  });

  test("permite quitar el vencimiento con null", () => {
    expect(ExpenseUpdateDto.safeParse({ dueDate: null }).success).toBe(true);
  });
});
