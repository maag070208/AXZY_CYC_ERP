import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import { clearAcademicE2E, clearAuthE2E, clearFinanceE2E, clearStudentsE2E, clearTeachersE2E, createAuthUser, db, lastAudit } from "./support/db";
import { anon, loginAs } from "./support/http";
import { makeCourse, makeStudent, makeTeacher, makeTerm, slot } from "./support/academic";

/**
 * Contrato de M21: indicadores ejecutivos (deserción, rendimiento, tendencia,
 * morosidad, ingresos contra proyección), comparación con el ciclo anterior,
 * alcance AREA del profesor sin montos y exportación por el motor de M10.
 *
 * Los ciclos se fechan en 1990/1991 para que «el anterior» sea siempre el de
 * esta corrida, sin importar qué ciclos reales haya en la base.
 */
assertSafeDatabase();

const RUN = newRunId();
const CONTROL = { username: `${E2E_PREFIX}xcontrol_${RUN}`, name: "E2E Control Ejecutivo", roleKey: "SCHOOL_CONTROL" };
const PUPIL = { username: `${E2E_PREFIX}xpupil_${RUN}`, name: "E2E Alumno Ejecutivo", roleKey: "STUDENT" };

let control: APIRequestContext;
let prof: APIRequestContext;
let pupil: APIRequestContext;
let controlId: string;
let termId: string;
let previousTermId: string;
let courseName: string;
let mineId: string;
let teacher: Awaited<ReturnType<typeof makeTeacher>>;

const report = (api: APIRequestContext, type: string, query: Record<string, string> = {}) =>
  api.get(`reports/${type}?${new URLSearchParams({ termId, ...query }).toString()}`);
const executive = (api: APIRequestContext, query: Record<string, string> = {}) =>
  api.get(`dashboard/executive?${new URLSearchParams({ termId, ...query }).toString()}`);

test.beforeAll(async () => {
  controlId = (await createAuthUser({ ...CONTROL, password: E2E.password })).id;
  await createAuthUser({ ...PUPIL, password: E2E.password });
  control = (await loginAs(CONTROL.username)).api;
  pupil = (await loginAs(PUPIL.username)).api;

  previousTermId = (await makeTerm(RUN, "Ejecutivo anterior", ["1990-01-01", "1990-06-30"])).id;
  termId = (await makeTerm(RUN, "Ejecutivo", ["1991-01-01", "1991-06-30"])).id;
  const course = await makeCourse(RUN, "Ejecutivo");
  courseName = course.name;
  teacher = await makeTeacher(RUN, "xprof");
  const other = await makeTeacher(RUN, "xprof2");
  prof = (await loginAs(teacher.username)).api;

  const group = async (term: string, name: string, teacherId: string, capacity: number) =>
    (await control.post("groups", {
      data: { courseId: course.id, termId: term, teacherId, name, capacity, schedule: [slot("TUESDAY", "07:00", "08:00")] },
    })).json();
  const enroll = async (groupId: string, studentId: string): Promise<{ id: string }> =>
    (await control.post(`groups/${groupId}/enroll`, { data: { studentId } })).json();

  // Ciclo actual: X1 (del profesor) con 3 inscritos y 1 baja; X2 (ajeno) con 1 inscrito.
  const mine = await group(termId, "X1", teacher.teacher.id, 4);
  const foreign = await group(termId, "X2", other.teacher.id, 10);
  mineId = mine.id;
  const [a, b, c, d] = await Promise.all(["ExA", "ExB", "ExC", "ExD"].map((label) => makeStudent(RUN, label)));
  const ea = await enroll(mine.id, a.id);
  const eb = await enroll(mine.id, b.id);
  const ec = await enroll(mine.id, c.id);
  await enroll(foreign.id, d.id);
  expect((await control.delete(`enrollments/${ec.id}`, { data: { reason: "Prueba de deserción" } })).status()).toBe(200);
  // Resultado del cierre (M08) escrito directo: una acreditada (90) y una reprobada (50).
  await db.enrollment.update({ where: { id: ea.id }, data: { status: "PASSED", finalGrade: 90 } });
  await db.enrollment.update({ where: { id: eb.id }, data: { status: "FAILED", finalGrade: 50 } });

  // Ciclo anterior: un grupo del mismo profesor con 2 inscritos y sin bajas.
  const past = await group(previousTermId, "X0", teacher.teacher.id, 4);
  await enroll(past.id, a.id);
  await enroll(past.id, b.id);

  // Cobranza del ciclo: un cargo vencido con abono (saldo 700) y uno que aún no vence.
  const concept = await (await control.post("fee-concepts", { data: { name: `E2E Ejecutivo ${RUN}`, amount: 1000, type: "TUITION" } })).json();
  const charge = async (studentId: string, dueDate: string) =>
    (await control.post("charges", { data: { studentId, conceptId: concept.id, termId, dueDate } })).json();
  const overdue = await charge(a.id, "1991-02-10");
  await charge(b.id, "2099-01-10");
  expect((await control.post("payments", { data: { chargeId: overdue.id, amount: 300, method: "CASH" } })).status()).toBe(201);
});

test.afterAll(async () => {
  await control?.dispose();
  await prof?.dispose();
  await pupil?.dispose();
  await clearFinanceE2E();
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: { in: [termId, previousTermId] } } });
  await clearAuthE2E();
});

test("catálogo: los indicadores ejecutivos aparecen; el profesor no ve los que llevan montos", async () => {
  const all = (await (await control.get("reports")).json()).map((r: { type: string }) => r.type);
  expect(all).toEqual(expect.arrayContaining(["dropout", "performance-by-course", "performance-by-teacher", "enrollment-trend", "delinquency", "income-vs-projection"]));
  const own = (await (await prof.get("reports")).json()).map((r: { type: string }) => r.type);
  expect(own).toEqual(expect.arrayContaining(["dropout", "performance-by-course", "enrollment-trend"]));
  expect(own).not.toContain("delinquency");
  expect(own).not.toContain("income-vs-projection");
});

test("deserción: bajas entre matrícula inicial por grupo; el profesor solo ve los suyos", async () => {
  const res = await (await report(control, "dropout")).json();
  const row = (name: string) => res.rows.find((r: { groupName: string }) => r.groupName === name);
  expect(row("X1")).toMatchObject({ courseName, initialCount: 3, withdrawnCount: 1, dropoutRate: 33.3 });
  expect(row("X2")).toMatchObject({ initialCount: 1, withdrawnCount: 0, dropoutRate: 0 });
  expect(res.totals).toMatchObject({ rows: 2, initialCount: 4, withdrawnCount: 1, dropoutRate: 25 });
  expect(res.columns.find((c: { key: string }) => c.key === "dropoutRate")).toMatchObject({ type: "percent", label: "Deserción" });

  const own = await (await report(prof, "dropout")).json();
  expect(own.rows.map((r: { groupName: string }) => r.groupName)).toEqual(["X1"]);
  expect(own.totals).toMatchObject({ initialCount: 3, dropoutRate: 33.3 });
});

test("rendimiento por curso y por profesor: promedio y aprobación sobre lo cerrado", async () => {
  const byCourse = await (await report(control, "performance-by-course")).json();
  expect(byCourse.rows).toHaveLength(1);
  expect(byCourse.rows[0]).toMatchObject({ courseName, groupCount: 2, enrolledCount: 3, average: 70, passedCount: 1, failedCount: 1, passRate: 50 });

  const byTeacher = await (await report(control, "performance-by-teacher")).json();
  const mine = byTeacher.rows.find((r: { teacherName: string }) => r.teacherName.includes("xprof "));
  expect(mine).toMatchObject({ groupCount: 1, enrolledCount: 2, average: 70, passRate: 50 });
  // Sin calificaciones cerradas no hay promedio ni aprobación (no es 0 %).
  const other = byTeacher.rows.find((r: { teacherName: string }) => r.teacherName.includes("xprof2"));
  expect(other).toMatchObject({ groupCount: 1, enrolledCount: 1, average: null, passRate: null });
});

test("tendencia de inscripciones: cada ciclo con su variación frente al anterior", async () => {
  const res = await (await report(control, "enrollment-trend")).json();
  const [previous, current] = res.rows.slice(-2);
  expect(previous).toMatchObject({ initialCount: 2, withdrawnCount: 0, dropoutRate: 0 });
  expect(current).toMatchObject({ initialCount: 4, withdrawnCount: 1, dropoutRate: 25, variation: 100 });
});

test("morosidad e ingresos contra proyección: solo con alcance institucional", async () => {
  const delinquency = await (await report(control, "delinquency")).json();
  expect(delinquency.rows).toHaveLength(1);
  expect(delinquency.rows[0]).toMatchObject({ concept: `E2E Ejecutivo ${RUN}`, dueCount: 1, overdueCount: 1, delinquencyRate: 100, balance: 700 });

  const income = await (await report(control, "income-vs-projection")).json();
  expect(income.rows).toEqual([
    { month: "1991-02", projected: 1000, collected: 300, difference: -700, percentage: 30 },
    { month: "2099-01", projected: 1000, collected: 0, difference: -1000, percentage: 0 },
  ]);
  expect(income.totals).toMatchObject({ projected: 2000, collected: 300, difference: -1700, percentage: 15 });

  for (const type of ["delinquency", "income-vs-projection"]) {
    const denied = await report(prof, type);
    expect(denied.status()).toBe(403);
    expect((await denied.json()).code).toBe("REPORT_REQUIRES_FULL_SCOPE");
  }
});

test("tablero ejecutivo: indicadores del ciclo comparados con el anterior", async () => {
  const res = await executive(control);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.term.id).toBe(termId);
  expect(body.previousTerm.id).toBe(previousTermId);
  expect(body.indicators.enrolledCount).toEqual({ value: 4, previous: 2, delta: 2, deltaPercent: 100 });
  expect(body.indicators.dropoutRate).toMatchObject({ value: 25, previous: 0, delta: 25 });
  expect(body.indicators.passRate).toMatchObject({ value: 50, previous: null, delta: null });
  expect(body.indicators.averageGrade.value).toBe(70);
  // 3 inscritos vigentes entre 14 lugares (4 + 10).
  expect(body.indicators.occupancy.value).toBe(21.4);
  expect(body.indicators.delinquencyRate.value).toBe(100);
  expect(body.indicators.pendingAmount.value).toBe(700);
  expect(body.indicators.projected.value).toBe(2000);
  expect(body.indicators.collected.value).toBe(300);
  expect(body.enrollmentTrend.slice(-2).map((t: { initialCount: number }) => t.initialCount)).toEqual([2, 4]);
  expect(body.incomeVsProjection).toHaveLength(2);
});

test("tablero ejecutivo: filtros, alcance del profesor y control de acceso", async () => {
  const byGroup = await (await executive(control, { groupId: mineId })).json();
  expect(byGroup.indicators.enrolledCount.value).toBe(3);
  expect(byGroup.indicators.dropoutRate.value).toBe(33.3);

  const own = await (await executive(prof)).json();
  expect(own.indicators.enrolledCount).toMatchObject({ value: 3, previous: 2 });
  expect(own.indicators.delinquencyRate).toBeNull();
  expect(own.indicators.projected).toBeNull();
  expect(own.incomeVsProjection).toBeNull();

  const invalid = await executive(control, { courseId: "no-es-uuid" });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).code).toBe("INVALID_FILTER");
  expect((await executive(pupil)).status()).toBe(403);
  const guest = await anon();
  expect((await guest.get("dashboard/executive")).status()).toBe(401);
  await guest.dispose();
});

test("exportación: los indicadores salen por el mismo motor de M10 y quedan en bitácora", async () => {
  const xlsx = await report(control, "dropout", { format: "xlsx" });
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  expect((await xlsx.body()).length).toBeGreaterThan(1000);
  const pdf = await report(control, "income-vs-projection", { format: "pdf" });
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await expect.poll(async () => (await lastAudit("REPORT_EXPORTED", controlId))?.entityId).toBe("income-vs-projection");
});
