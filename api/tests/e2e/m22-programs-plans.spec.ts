import { expect, test } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import { loginAs } from "./support/http";
import { createAuthUser, db } from "./support/db";
import { makeCurp } from "./support/people";

/**
 * Contrato de M22: carreras con costos y periodos, plan de estudios y generación
 * del plan de pagos (reinscripción por periodo + mensualidades) idempotente, con
 * descuentos, snapshot y cancelación.
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}m22_${RUN}`, name: "E2E Admin M22", roleKey: "ADMIN" };
const CODE = `E2E-M22-${RUN}`.toUpperCase().slice(0, 30);
const COURSE_CODE = `E2E-C-${RUN}`.toUpperCase().slice(0, 30);

type Api = Awaited<ReturnType<typeof loginAs>>["api"];

let admin: Api;
let courseId: string;
let studentId: string;
let programId: string;

test.beforeAll(async () => {
  await createAuthUser({ ...ADMIN, password: E2E.password });
  admin = (await loginAs(ADMIN.username)).api;

  const course = await admin.post("courses", { data: { code: COURSE_CODE, name: `E2E Materia ${RUN}` } });
  expect(course.status(), await course.text()).toBe(201);
  courseId = (await course.json()).id;

  const birth = "2000-05-05";
  const student = await admin.post("students", {
    data: { firstNames: `E2E M22 ${RUN}`, paternalSurname: "Plan", curp: makeCurp(birth, "M"), birthDate: birth },
  });
  expect(student.status(), await student.text()).toBe(201);
  studentId = (await student.json()).id;
});

test.afterAll(async () => {
  await admin.dispose();
});

test.describe.serial("programas y planes de pago", () => {
  test("crea la carrera (código único) y define el plan de estudios", async () => {
    const created = await admin.post("programs", {
      data: { code: CODE, name: `Mecánico Diésel ${RUN}`, periodType: "QUADRIMESTER", periodCount: 3, monthlyFee: 1500, enrollmentFee: 1000 },
    });
    expect(created.status(), await created.text()).toBe(201);
    programId = (await created.json()).id;
    expect((await created.json()).monthsPerPeriod).toBe(4);

    const dup = await admin.post("programs", { data: { code: CODE, name: "Otra", periodType: "SEMESTER", periodCount: 1, monthlyFee: 1, enrollmentFee: 1 } });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).code).toBe("PROGRAM_CODE_TAKEN");

    const subjects = await admin.put(`programs/${programId}/subjects`, { data: { subjects: [{ courseId, periodIndex: 1, sortOrder: 0 }] } });
    expect(subjects.status(), await subjects.text()).toBe(200);
    expect((await subjects.json()).subjectsList[0]).toMatchObject({ courseId, periodIndex: 1 });

    const outOfRange = await admin.put(`programs/${programId}/subjects`, { data: { subjects: [{ courseId, periodIndex: 9 }] } });
    expect(outOfRange.status()).toBe(400);
  });

  test("la asignación exige Idempotency-Key", async () => {
    const res = await admin.post("plans", { data: { studentId, programId, startDate: "2026-09-01" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("INVALID_IDEMPOTENCY_KEY");
  });

  test("genera 15 cargos (3 reinscripciones + 12 mensualidades) y no duplica al repetir la code", async () => {
    const key = `${E2E_PREFIX}plan_${RUN}`;
    const res = await admin.post("plans", {
      headers: { "Idempotency-Key": key },
      data: { studentId, programId, startDate: "2026-09-01" },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body.totals).toMatchObject({ charges: 15, enrollmentCharges: 3, monthlyCharges: 12 });
    expect(body.firstDueDate).toBe("2026-09-05");
    expect(body.lastDueDate).toBe("2027-08-05");

    const replay = await admin.post("plans", { headers: { "Idempotency-Key": key }, data: { studentId, programId, startDate: "2026-09-01" } });
    expect(replay.status()).toBe(201);
    expect((await replay.json()).id).toBe(body.id);
    expect(await db.charge.count({ where: { planId: body.id } })).toBe(15);
  });

  test("el discount se aplica a los cargos (snapshot)", async () => {
    const res = await admin.post("plans", {
      headers: { "Idempotency-Key": `${E2E_PREFIX}plan_d_${RUN}` },
      data: { studentId, programId, startDate: "2026-09-01", discountPercent: 20, discountReason: "Beca" },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body.discountPercent).toBe(20);
    const charges = await db.charge.findMany({ where: { planId: body.id }, select: { amount: true, description: true } });
    const enrollment = charges.find((c) => c.description?.startsWith("Reinscripción"));
    const monthly = charges.find((c) => c.description?.startsWith("Colegiatura"));
    expect(Number(enrollment?.amount)).toBe(800);
    expect(Number(monthly?.amount)).toBe(1200);

    // Cambiar el precio de la carrera NO recalcula los cargos existentes.
    await admin.patch(`programs/${programId}`, { data: { monthlyFee: 9999 } });
    const after = await db.charge.findMany({ where: { planId: body.id }, select: { amount: true }, orderBy: { planChargeIndex: "asc" } });
    expect(Number(after[1].amount)).toBe(1200);
  });

  test("cancela el plan y sus cargos pendientes", async () => {
    const created = await admin.post("plans", {
      headers: { "Idempotency-Key": `${E2E_PREFIX}plan_c_${RUN}` },
      data: { studentId, programId, startDate: "2026-09-01" },
    });
    const planId = (await created.json()).id;
    const cancelled = await admin.post(`plans/${planId}/cancel`, { data: { reason: "Cambio de carrera" } });
    expect(cancelled.status(), await cancelled.text()).toBe(200);
    expect((await cancelled.json()).status).toBe("CANCELLED");
    expect(await db.charge.count({ where: { planId, status: "CANCELLED" } })).toBe(15);
  });

  test("tabla de carreras y planes responde el contrato", async () => {
    const programs = await admin.post("programs/query", { data: { page: 1, limit: 10, filters: { code: CODE } } });
    expect(programs.status()).toBe(200);
    expect((await programs.json()).data[0].code).toBe(CODE);

    const plans = await admin.post("plans/query", { data: { page: 1, limit: 10, filters: { studentId } } });
    expect(plans.status()).toBe(200);
    expect((await plans.json()).total).toBeGreaterThanOrEqual(3);
  });
});
