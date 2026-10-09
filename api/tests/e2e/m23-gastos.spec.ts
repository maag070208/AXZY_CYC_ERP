import { expect, test } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import { loginAs } from "./support/http";
import { clearFinanceE2E, createAuthUser, db, lastAudit } from "./support/db";

/**
 * Contrato de M23: gastos institucionales (egresos). Alta, edición y
 * cancelación lógica con motivo, permisos solo institucionales, totales por
 * tipo y por mes, y su aporte al tablero de Inicio (ingresos contra gastos).
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}m23_${RUN}`, name: "E2E Admin M23", roleKey: "ADMIN" as const };
const CONTROL = { username: `${E2E_PREFIX}m23c_${RUN}`, name: "E2E Control M23", roleKey: "SCHOOL_CONTROL" as const };
const TEACHER = { username: `${E2E_PREFIX}m23t_${RUN}`, name: "E2E Prof M23", roleKey: "TEACHER" as const };

type Api = Awaited<ReturnType<typeof loginAs>>["api"];

let admin: Api;
let control: Api;
let teacher: Api;
let adminId: string;
let termId: string;
let expenseId: string;

const CONCEPT = `E2E Renta ${RUN}`;

const createdExpense = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-10-05",
  concept: CONCEPT,
  type: "SERVICES",
  vendor: "Inmobiliaria E2E",
  amount: 18000.5,
  status: "PAID",
  ...overrides,
});

test.beforeAll(async () => {
  adminId = (await createAuthUser({ ...ADMIN, password: E2E.password })).id;
  await createAuthUser({ ...CONTROL, password: E2E.password });
  await createAuthUser({ ...TEACHER, password: E2E.password });
  admin = (await loginAs(ADMIN.username)).api;
  control = (await loginAs(CONTROL.username)).api;
  teacher = (await loginAs(TEACHER.username)).api;

  const term = await admin.post("terms", { data: { name: `E2E M23 ${RUN}`, startDate: "1991-01-01", endDate: "1991-06-30" } });
  expect(term.status(), await term.text()).toBe(201);
  termId = (await term.json()).id;
});

test.afterAll(async () => {
  await clearFinanceE2E();
  await db.expense.deleteMany({ where: { concept: { contains: RUN } } });
  await db.term.deleteMany({ where: { id: termId } });
  await admin?.dispose();
  await control?.dispose();
  await teacher?.dispose();
});

test.describe.serial("gastos institucionales", () => {
  test("alta: normaliza opcionales, valida el vencimiento y audita", async () => {
    const res = await admin.post("expenses", { data: createdExpense({ termId, vendor: "", notes: "" }) });
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expenseId = body.id;
    expect(body).toMatchObject({
      concept: CONCEPT,
      type: "SERVICES",
      amount: 18000.5,
      status: "PAID",
      vendor: null,
      notes: null,
      overdue: false,
      termName: `E2E M23 ${RUN}`,
    });

    const before = await admin.post("expenses", { data: createdExpense({ concept: `${CONCEPT} vencido`, dueDate: "2026-10-04" }) });
    expect(before.status()).toBe(400);
    expect((await before.json()).code).toBe("DUE_DATE_BEFORE_DATE");

    expect((await lastAudit("EXPENSE_CREATED", adminId))?.entityId).toBe(expenseId);
  });

  test("un compromiso pendiente vencido se marca como mora", async () => {
    const overdue = await admin.post("expenses", {
      data: createdExpense({ concept: `${CONCEPT} por pagar`, status: "PENDING", date: "1991-01-15", dueDate: "1991-02-01", termId }),
    });
    expect(overdue.status(), await overdue.text()).toBe(201);
    const body = await overdue.json();
    expect(body.status).toBe("PENDING");
    expect(body.overdue).toBe(true);
  });

  test("edición: parcial, valida el vencimiento contra la fecha y no admite cancelar por aquí", async () => {
    const updated = await admin.patch(`expenses/${expenseId}`, { data: { amount: 19500, vendor: "Inmobiliaria E2E SA" } });
    expect(updated.status(), await updated.text()).toBe(200);
    expect(await updated.json()).toMatchObject({ amount: 19500, vendor: "Inmobiliaria E2E SA" });

    const invalidDate = await admin.patch(`expenses/${expenseId}`, { data: { dueDate: "2026-10-04" } });
    expect(invalidDate.status()).toBe(400);
    expect((await invalidDate.json()).code).toBe("DUE_DATE_BEFORE_DATE");

    const empty = await admin.patch(`expenses/${expenseId}`, { data: {} });
    expect(empty.status()).toBe(400);

    const cancelled = await admin.patch(`expenses/${expenseId}`, { data: { status: "CANCELLED" } });
    expect(cancelled.status()).toBe(400);

    expect(await lastAudit("EXPENSE_UPDATED", adminId)).not.toBeNull();
  });

  test("tabla: filtra por tipo, estatus, texto y rango de fechas", async () => {
    const query = async (filters: Record<string, unknown>) => {
      const res = await admin.post("expenses/query", { data: { page: 1, limit: 50, filters } });
      expect(res.status(), await res.text()).toBe(200);
      return res.json();
    };

    const mine = await query({ concept: CONCEPT });
    expect(mine.total).toBeGreaterThanOrEqual(2);
    expect(mine.data.every((row: { concept: string }) => row.concept.includes(CONCEPT))).toBe(true);

    const paid = await query({ concept: CONCEPT, status: "PAID" });
    expect(paid.data.every((row: { status: string }) => row.status === "PAID")).toBe(true);

    const byType = await query({ concept: CONCEPT, type: "PAYROLL" });
    expect(byType.total).toBe(0);

    const byRange = await query({ concept: CONCEPT, date: ["2026-10-01", "2026-10-31"] });
    expect(byRange.total).toBeGreaterThanOrEqual(1);

    const byTerm = await query({ concept: CONCEPT, termId });
    expect(byTerm.total).toBeGreaterThanOrEqual(2);
  });

  test("resumen: totales por tipo y por mes, sin contar cancelados", async () => {
    const before = await (await admin.get(`expenses/summary?termId=${termId}`)).json();
    const renta = before.byType.find((row: { type: string }) => row.type === "SERVICES");
    expect(renta.total).toBeGreaterThanOrEqual(19500);
    expect(renta.label).toBe("Servicios");
    expect(before.byMonth.some((row: { month: string }) => row.month === "2026-10")).toBe(true);
    // El compromiso vencido cae en su propio mes (enero de 1991, el ciclo de prueba).
    expect(before.byMonth.some((row: { month: string }) => row.month === "1991-01")).toBe(true);
    // Un gasto sin ciclo también entra en los totales del ciclo.
    expect(before.total).toBeGreaterThanOrEqual(19500);
    expect(before.count).toBeGreaterThanOrEqual(2);
  });

  test("cancelación lógica con motivo: sale de los totales y ya no admite cambios", async () => {
    const beforeCancel = await (await admin.get(`expenses/summary?termId=${termId}`)).json();

    const withoutReason = await admin.delete(`expenses/${expenseId}`, { data: { reason: "xy" } });
    expect(withoutReason.status()).toBe(400);

    const cancelled = await admin.delete(`expenses/${expenseId}`, { data: { reason: "Duplicado de captura" } });
    expect(cancelled.status(), await cancelled.text()).toBe(200);
    const body = await cancelled.json();
    expect(body.status).toBe("CANCELLED");
    expect(body.cancelReason).toBe("Duplicado de captura");
    expect(await lastAudit("EXPENSE_CANCELLED", adminId)).not.toBeNull();

    const again = await admin.delete(`expenses/${expenseId}`, { data: { reason: "Otra vez" } });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("EXPENSE_ALREADY_CANCELLED");

    const edit = await admin.patch(`expenses/${expenseId}`, { data: { amount: 1 } });
    expect(edit.status()).toBe(409);
    expect((await edit.json()).code).toBe("EXPENSE_CANCELLED");

    const afterCancel = await (await admin.get(`expenses/summary?termId=${termId}`)).json();
    // El cancelado sale de los totales: baja exactamente su monto y su conteo.
    expect(afterCancel.total).toBe(Math.round((beforeCancel.total - 19500) * 100) / 100);
    expect(afterCancel.count).toBe(beforeCancel.count - 1);
  });

  test("permisos: solo el alcance institucional administra y ve gastos", async () => {
    // SCHOOL_CONTROL no tiene el permiso (los montos de egresos son de dirección).
    expect((await control.post("expenses/query", { data: { page: 1, limit: 5 } })).status()).toBe(403);
    expect((await control.get("expenses/summary")).status()).toBe(403);
    expect((await control.post("expenses", { data: createdExpense({ concept: `${CONCEPT} control` }) })).status()).toBe(403);

    expect((await teacher.get("expenses/summary")).status()).toBe(403);
    expect((await teacher.post("expenses/query", { data: { page: 1, limit: 5 } })).status()).toBe(403);
  });

  test("tablero de Inicio: el gasto entra en «Ingresos vs. gastos» y en el indicador", async () => {
    const res = await admin.get(`dashboard/executive?termId=${termId}`);
    expect(res.status(), await res.text()).toBe(200);
    const board = await res.json();

    expect(board.expenses).not.toBeNull();
    // Queda el gasto pendiente (el pagado se canceló): 18,000.50.
    expect(board.expenses.total).toBe(18000.5);
    expect(board.expenses.pending).toBe(18000.5);
    expect(board.indicators.expenses.value).toBe(board.expenses.total);
    expect(board.expenses.byType.map((row: { type: string }) => row.type)).toContain("SERVICES");

    // La serie une ingresos y gastos por mes: el compromiso pendiente está en su mes.
    const expenseMonth = (board.incomeVsExpenses ?? []).find((row: { month: string }) => row.month === "1991-01");
    expect(expenseMonth.expenses).toBe(18000.5);

    // El profesor nunca ve el bloque de dinero.
    const teacherBoard = await (await teacher.get(`dashboard/executive?termId=${termId}`)).json();
    expect(teacherBoard.expenses).toBeNull();
    expect(teacherBoard.incomeVsExpenses).toBeNull();
    expect(teacherBoard.indicators.expenses).toBeNull();
  });
});
