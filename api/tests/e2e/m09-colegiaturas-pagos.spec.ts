import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import {
  clearAcademicE2E,
  clearAccessE2E,
  clearAuthE2E,
  clearFinanceE2E,
  clearStudentsE2E,
  clearTeachersE2E,
  createAuthUser,
  db,
  lastAudit,
} from "./support/db";
import { loginAs } from "./support/http";
import { makeCourse, makeStudent, makeTerm, slot } from "./support/academic";

/**
 * Contrato de M09: conceptos, cargos (individual, masivo idempotente,
 * cancelación), pagos parciales con folio consecutivo, cancelación de pagos,
 * idempotencia, recargos por mora, estado de cuenta, políticas y alcance.
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}fadmin_${RUN}`, name: "E2E Admin Finanzas", roleKey: "ADMIN" };
const CONTROL = { username: `${E2E_PREFIX}fcontrol_${RUN}`, name: "E2E Cajera", roleKey: "SCHOOL_CONTROL" };
const CONTROL2 = { username: `${E2E_PREFIX}fcontrol2_${RUN}`, name: "E2E Cajero Dos", roleKey: "SCHOOL_CONTROL" };
const PUPIL = { username: `${E2E_PREFIX}fpupil_${RUN}`, name: "E2E Alumno Pagos", roleKey: "STUDENT" };
const TEACHER = { username: `${E2E_PREFIX}fprof_${RUN}`, name: "E2E Prof Finanzas", roleKey: "TEACHER" };

let admin: APIRequestContext;
let control: APIRequestContext;
let control2: APIRequestContext;
let controlId: string;
let pupilUserId: string;
let conceptId: string;
let termId: string;
let originalLateFee: unknown;
let keySeq = 0;

const key = (label: string) => `e2e-${label}-${RUN}-${(keySeq += 1)}`;
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const daysAgo = (n: number) => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const newCharge = async (studentId: string, data: Record<string, unknown> = {}) => {
  const res = await control.post("charges", { data: { studentId, conceptId, dueDate: "2026-12-10", ...data } });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
};
const pay = (api: APIRequestContext, chargeId: string, amount: number, headers: Record<string, string> = {}, extra = {}) =>
  api.post("payments", { data: { chargeId, amount, method: "CASH", ...extra }, headers });

test.beforeAll(async () => {
  await createAuthUser({ ...ADMIN, password: E2E.password });
  controlId = (await createAuthUser({ ...CONTROL, password: E2E.password })).id;
  await createAuthUser({ ...CONTROL2, password: E2E.password });
  await createAuthUser({ ...TEACHER, password: E2E.password });
  pupilUserId = (await createAuthUser({ ...PUPIL, password: E2E.password })).id;
  admin = (await loginAs(ADMIN.username)).api;
  control = (await loginAs(CONTROL.username)).api;
  control2 = (await loginAs(CONTROL2.username)).api;
  const concept = await control.post("fee-concepts", {
    data: { name: `E2E Colegiatura ${RUN}`, amount: 2500, type: "TUITION", description: "Mensualidad" },
  });
  expect(concept.status(), await concept.text()).toBe(201);
  conceptId = (await concept.json()).id;
  termId = (await makeTerm(RUN, "Finanzas")).id;
  originalLateFee = (await db.setting.findUnique({ where: { key: "LATE_FEE" } }))?.value;
});

test.afterAll(async () => {
  if (originalLateFee !== undefined) {
    await db.setting.update({ where: { key: "LATE_FEE" }, data: { value: originalLateFee as object } });
  }
  await Promise.all([admin?.dispose(), control?.dispose(), control2?.dispose()]);
  await clearFinanceE2E();
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: termId } });
  await clearAccessE2E();
  await clearAuthE2E();
});

test.describe("conceptos", () => {
  test("alta, duplicado y concepto de recargo reservado", async () => {
    const dup = await control.post("fee-concepts", { data: { name: `e2e colegiatura ${RUN}`, amount: 1, type: "OTHER" } });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).code).toBe("FEE_CONCEPT_NAME_TAKEN");
    expect((await lastAudit("FEE_CONCEPT_CREATED", controlId))?.entityId).toBe(conceptId);

    const recargo = await db.feeConcept.findFirstOrThrow({ where: { type: "LATE_FEE" } });
    const reserved = await control.patch(`fee-concepts/${recargo.id}`, { data: { amount: 10 } });
    expect((await reserved.json()).code).toBe("FEE_CONCEPT_RESERVED");
    const asRecargo = await control.post("fee-concepts", { data: { name: `E2E R ${RUN}`, amount: 1, type: "LATE_FEE" } });
    expect(asRecargo.status()).toBe(400);
    const options = await (await control.get("fee-concepts/options")).json();
    expect(options.some((c: { type: string }) => c.type === "LATE_FEE")).toBe(false);

    const { api } = await loginAs(TEACHER.username);
    expect((await api.post("fee-concepts", { data: { name: `E2E X ${RUN}`, amount: 1, type: "OTHER" } })).status()).toBe(403);
    await api.dispose();
  });
});

test.describe("cargos y pagos", () => {
  test("cargo con el amount del concepto; discount mayor al amount → 400", async () => {
    const student = await makeStudent(RUN, "Cargo");
    const charge = await newCharge(student.id, { discount: 500, description: "Colegiatura septiembre" });
    expect(charge).toMatchObject({ amount: 2500, discount: 500, total: 2000, pagado: 0, saldo: 2000, status: "PENDING" });
    expect((await lastAudit("CHARGE_CREATED", controlId))?.entityId).toBe(charge.id);
    const bad = await control.post("charges", {
      data: { studentId: student.id, conceptId, amount: 100, discount: 150, dueDate: "2026-12-10" },
    });
    expect((await bad.json()).code).toBe("DISCOUNT_EXCEEDS_AMOUNT");
  });

  test("pago parcial → PARTIAL, completo → PAID; folios consecutivos; ya pagado → 409", async () => {
    const student = await makeStudent(RUN, "Parcial");
    const charge = await newCharge(student.id);
    const first = await pay(control, charge.id, 1000, {}, { reference: "Caja 1" });
    expect(first.status(), await first.text()).toBe(201);
    const p1 = await first.json();
    expect(p1).toMatchObject({ amount: 1000, chargeStatus: "PARTIAL", chargeSaldo: 1500, registeredByName: CONTROL.name });
    expect(p1.receiptNumber).toMatch(/^REC-\d{4}-\d{6}$/);
    expect((await lastAudit("PAYMENT_REGISTERED", controlId))?.entityId).toBe(p1.id);

    const over = await pay(control, charge.id, 1500.01);
    expect(over.status()).toBe(400);
    expect((await over.json()).code).toBe("PAYMENT_EXCEEDS_BALANCE");
    const future = await pay(control, charge.id, 10, {}, { date: "2099-01-01" });
    expect((await future.json()).code).toBe("FUTURE_DATE");

    const p2 = await (await pay(control, charge.id, 1500)).json();
    expect(p2).toMatchObject({ chargeStatus: "PAID", chargeSaldo: 0 });
    const n = (folio: string) => Number(folio.split("-")[2]);
    expect(n(p2.receiptNumber)).toBeGreaterThan(n(p1.receiptNumber));

    const paid = await pay(control, charge.id, 1);
    expect(paid.status()).toBe(409);
    expect((await paid.json()).code).toBe("CHARGE_ALREADY_PAID");
  });

  test("cancelar un pago conserva el folio, recalcula el cargo y queda en bitácora", async () => {
    const student = await makeStudent(RUN, "CancelaPago");
    const charge = await newCharge(student.id, { amount: 800 });
    const payment = await (await pay(control, charge.id, 800)).json();
    expect(payment.chargeStatus).toBe("PAID");

    const noReason = await control.delete(`payments/${payment.id}`, { data: {} });
    expect(noReason.status()).toBe(400);
    const res = await control.delete(`payments/${payment.id}`, { data: { reason: "Billete falso" } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ receiptNumber: payment.receiptNumber, cancelReason: "Billete falso", chargeStatus: "PENDING", chargeSaldo: 800 });
    const log = await lastAudit("PAYMENT_CANCELLED", controlId);
    expect(log?.previousState).toMatchObject({ chargeStatus: "PAID" });
    expect(log?.newState).toMatchObject({ chargeStatus: "PENDING" });
    expect((await (await control.delete(`payments/${payment.id}`, { data: { reason: "Otra vez" } })).json()).code).toBe("PAYMENT_ALREADY_CANCELLED");
    expect(await db.payment.count({ where: { id: payment.id } })).toBe(1);
  });

  test("cancelar cargo: con pagos vigentes → 409; sin pagos → CANCELLED y ya no acepta pagos", async () => {
    const student = await makeStudent(RUN, "CancelaCargo");
    const charge = await newCharge(student.id, { amount: 300 });
    const payment = await (await pay(control, charge.id, 100)).json();
    const blocked = await control.delete(`charges/${charge.id}`, { data: { reason: "Error de captura" } });
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).code).toBe("CHARGE_HAS_PAYMENTS");
    await control.delete(`payments/${payment.id}`, { data: { reason: "Se cancela el cargo" } });
    const ok = await control.delete(`charges/${charge.id}`, { data: { reason: "Error de captura" } });
    expect(await ok.json()).toMatchObject({ status: "CANCELLED", saldo: 0, cancelReason: "Error de captura" });
    expect((await lastAudit("CHARGE_CANCELLED", controlId))?.entityId).toBe(charge.id);
    expect((await (await pay(control, charge.id, 10)).json()).code).toBe("CHARGE_ALREADY_PAID");
  });

  test("Idempotency-Key en pagos: repetir devuelve el mismo pago; otra persona → 409; inválida → 400", async () => {
    const student = await makeStudent(RUN, "Idem");
    const charge = await newCharge(student.id, { amount: 1000 });
    const k = key("pay");
    const first = await pay(control, charge.id, 400, { "Idempotency-Key": k });
    expect(first.status()).toBe(201);
    const again = await pay(control, charge.id, 400, { "Idempotency-Key": k });
    expect(again.status()).toBe(200);
    expect(again.headers()["idempotent-replayed"]).toBe("true");
    expect((await again.json()).receiptNumber).toBe((await first.json()).receiptNumber);
    expect(await db.payment.count({ where: { chargeId: charge.id } })).toBe(1);

    const stolen = await pay(control2, charge.id, 400, { "Idempotency-Key": k });
    expect(stolen.status()).toBe(409);
    expect((await stolen.json()).code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect((await (await pay(control, charge.id, 1, { "Idempotency-Key": "corta" })).json()).code).toBe("INVALID_IDEMPOTENCY_KEY");
  });

  test("concurrencia: dos pagos por el saldo completo al mismo tiempo → solo uno pasa", async () => {
    const student = await makeStudent(RUN, "Carrera");
    const charge = await newCharge(student.id, { amount: 500 });
    const results = await Promise.all([pay(control, charge.id, 500), pay(control2, charge.id, 500)]);
    const statuses = results.map((r) => r.status()).sort();
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);
    expect(await db.payment.count({ where: { chargeId: charge.id, cancelledAt: null } })).toBe(1);
  });

  test("política ABAC: discount mayor a 50 % → 403 POLICY_DENIED", async () => {
    const student = await makeStudent(RUN, "Politica");
    const policy = await (
      await admin.post("permissions/policies", {
        data: {
          key: `${E2E_PREFIX}tope_descuento_${RUN}`,
          name: "Tope de discount",
          action: "charges.create",
          effect: "DENY",
          priority: 10,
          conditions: [{ field: "porcentajeDescuento", operator: "gt", value: 50 }],
        },
      })
    ).json();
    const denied = await control.post("charges", {
      data: { studentId: student.id, conceptId, amount: 1000, discount: 600, dueDate: "2026-12-10" },
    });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).code).toBe("POLICY_DENIED");
    expect((await control.post("charges", {
      data: { studentId: student.id, conceptId, amount: 1000, discount: 500, dueDate: "2026-12-10" },
    })).status()).toBe(201);
    await admin.delete(`permissions/policies/${policy.id}`);
  });
});

test.describe("generación masiva", () => {
  test("por grupo: solo inscritos vigentes y activos; idempotente con y sin code", async () => {
    const course = await makeCourse(RUN, "Cobranza");
    const group = await (
      await control.post("groups", {
        data: { courseId: course.id, termId, name: "F1", capacity: 10, schedule: [slot("LUNES", "07:00", "08:00")] },
      })
    ).json();
    const [a, b, c, d] = await Promise.all(["GenA", "GenB", "GenC", "GenD"].map((l) => makeStudent(RUN, l)));
    for (const s of [a, b, c, d]) await control.post(`groups/${group.id}/enroll`, { data: { studentId: s.id } });
    const dropped = await db.enrollment.findFirstOrThrow({ where: { studentId: c.id } });
    await control.delete(`enrollments/${dropped.id}`, { data: { reason: "Baja voluntaria" } });
    await db.student.update({ where: { id: d.id }, data: { status: "WITHDRAWN" } });

    const body = { conceptId, scope: "group", groupId: group.id, dueDate: "2026-09-10", description: "Septiembre" };
    const k = key("gen");
    const res = await control.post("charges/generate", { data: body, headers: { "Idempotency-Key": k } });
    expect(res.status(), await res.text()).toBe(201);
    const result = await res.json();
    expect(result).toMatchObject({ created: 2, skipped: 0 });
    const charges = await db.charge.findMany({ where: { conceptId, dueDate: new Date("2026-09-10T00:00:00Z") } });
    expect(charges.map((x) => x.studentId).sort()).toEqual([a.id, b.id].sort());
    expect(charges.every((x) => x.termId === termId)).toBe(true);
    expect((await lastAudit("CHARGE_GENERATED", controlId))?.metadata).toMatchObject({ created: 2, groupId: group.id });

    const replay = await control.post("charges/generate", { data: body, headers: { "Idempotency-Key": k } });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual(result);
    const noKey = await (await control.post("charges/generate", { data: body })).json();
    expect(noKey).toMatchObject({ created: 0, skipped: 2 });
    const other = await control2.post("charges/generate", { data: body, headers: { "Idempotency-Key": k } });
    expect((await other.json()).code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await db.charge.count({ where: { conceptId, dueDate: new Date("2026-09-10T00:00:00Z") } })).toBe(2);

    const missing = await control.post("charges/generate", { data: { ...body, groupId: undefined } });
    expect((await missing.json()).code).toBe("GENERATION_TARGET_REQUIRED");
  });
});

test.describe("recargos y estado de cuenta", () => {
  test("recargo por mora: desactivado → 409; activo calcula sobre el saldo y no se duplica", async () => {
    await db.setting.update({ where: { key: "LATE_FEE" }, data: { value: { enabled: false, dailyRate: 0, graceDays: 0 } } });
    expect((await (await control.post("charges/late-fees")).json()).code).toBe("LATE_FEES_DISABLED");

    const student = await makeStudent(RUN, "Mora");
    const charge = await newCharge(student.id, { amount: 1200, dueDate: daysAgo(15) });
    await pay(control, charge.id, 200);
    await db.setting.update({ where: { key: "LATE_FEE" }, data: { value: { enabled: true, dailyRate: 0.01, graceDays: 5 } } });
    const res = await control.post("charges/late-fees", { data: {} });
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).created).toBeGreaterThanOrEqual(1);
    // saldo 1000 × 1 % × (15 − 5) días = 100
    const fee = await db.charge.findUniqueOrThrow({ where: { parentChargeId: charge.id }, include: { concept: true } });
    expect(Number(fee.amount)).toBe(100);
    expect(fee.concept.type).toBe("LATE_FEE");

    await control.post("charges/late-fees", { data: {} });
    expect(await db.charge.count({ where: { parentChargeId: charge.id } })).toBe(1);
    expect((await lastAudit("LATE_FEES_APPLIED", controlId))?.metadata).toMatchObject({ asOf: today() });
    await db.setting.update({ where: { key: "LATE_FEE" }, data: { value: { enabled: false, dailyRate: 0, graceDays: 0 } } });
  });

  test("estado de cuenta con totales; el alumno solo ve lo suyo y no cobra", async () => {
    const own = await makeStudent(RUN, "Portal", pupilUserId);
    const other = await makeStudent(RUN, "Ajeno");
    const c1 = await newCharge(own.id, { amount: 1000, discount: 100, dueDate: daysAgo(3) });
    await newCharge(own.id, { amount: 500, dueDate: "2026-12-31" });
    const cancelled = await newCharge(own.id, { amount: 999 });
    await control.delete(`charges/${cancelled.id}`, { data: { reason: "Duplicado" } });
    await pay(control, c1.id, 400);
    await newCharge(other.id, { amount: 700 });

    const statement = await (await control.get(`students/${own.id}/account-statement`)).json();
    expect(statement.charges).toHaveLength(2);
    expect(statement.totals).toEqual({ cargos: 1500, descuentos: 100, pagado: 400, saldo: 1000, vencido: 500 });
    expect(statement.charges[0].payments).toHaveLength(1);

    const { api } = await loginAs(PUPIL.username);
    expect((await api.get(`students/${own.id}/account-statement`)).status()).toBe(200);
    expect((await api.get(`students/${other.id}/account-statement`)).status()).toBe(404);
    const mine = await (await api.post("charges/query", { data: { page: 1, limit: 50 } })).json();
    expect(new Set(mine.data.map((c: { studentId: string }) => c.studentId))).toEqual(new Set([own.id]));
    const payments = await (await api.post("payments/query", { data: { page: 1, limit: 50 } })).json();
    expect(payments.total).toBe(1);
    expect((await pay(api, c1.id, 10)).status()).toBe(403);
    await api.dispose();

    const { api: teacher } = await loginAs(TEACHER.username);
    expect((await teacher.post("charges/query", { data: { page: 1, limit: 5 } })).status()).toBe(403);
    await teacher.dispose();
  });
});
