import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import {
  clearAcademicE2E,
  clearAuthE2E,
  clearFinanceE2E,
  clearStudentsE2E,
  clearTeachersE2E,
  createAuthUser,
  db,
  lastAudit,
} from "./support/db";
import { loginAs } from "./support/http";
import { makeCourse, makeStudent, makeTeacher, makeTerm, slot } from "./support/academic";

/**
 * Contrato de M10: catálogo, cada reporte con sus filtros, alcance AREA del
 * profesor, reportes con montos solo para ALL, exportación xlsx/pdf auditada
 * y KPIs del tablero.
 */
assertSafeDatabase();

const RUN = newRunId();
const CONTROL = { username: `${E2E_PREFIX}rcontrol_${RUN}`, name: "E2E Control Reportes", roleKey: "SCHOOL_CONTROL" };
const NOEXPORT = { username: `${E2E_PREFIX}rnoexp_${RUN}`, name: "E2E Sin Exportar", roleKey: "SCHOOL_CONTROL" };
const PUPIL = { username: `${E2E_PREFIX}rpupil_${RUN}`, name: "E2E Alumno Reportes", roleKey: "STUDENT" };
const ADMIN = { username: `${E2E_PREFIX}radmin_${RUN}`, name: "E2E Admin Reportes", roleKey: "ADMIN" };

let control: APIRequestContext;
let prof: APIRequestContext;
let controlId: string;
let termId: string;
let mine: { id: string };
let foreign: { id: string };
const students: Array<{ id: string; studentNumber: string }> = [];
let teacher: Awaited<ReturnType<typeof makeTeacher>>;
let paidReceipt = "";
let cancelledReceipt = "";

const report = (api: APIRequestContext, type: string, query: Record<string, string> = {}) =>
  api.get(`reports/${type}?${new URLSearchParams(query).toString()}`);
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

test.beforeAll(async () => {
  controlId = (await createAuthUser({ ...CONTROL, password: E2E.password })).id;
  const noExportId = (await createAuthUser({ ...NOEXPORT, password: E2E.password })).id;
  await createAuthUser({ ...PUPIL, password: E2E.password });
  await createAuthUser({ ...ADMIN, password: E2E.password });
  control = (await loginAs(CONTROL.username)).api;
  const { api: admin } = await loginAs(ADMIN.username);
  const exception = await admin.put(`users/${noExportId}/permissions`, {
    data: { exception: { permission: "reports.export", scope: "NONE", reason: "Prueba de exportación" } },
  });
  expect(exception.status(), await exception.text()).toBe(200);
  await admin.dispose();

  termId = (await makeTerm(RUN, "Reportes")).id;
  const course = await makeCourse(RUN, "Reportes");
  teacher = await makeTeacher(RUN, "rprof");
  const other = await makeTeacher(RUN, "rprof2");
  prof = (await loginAs(teacher.username)).api;
  const group = async (name: string, teacherId: string, capacity: number) =>
    (await control.post("groups", {
      data: { courseId: course.id, termId, teacherId, name, capacity, schedule: [slot("TUESDAY", "07:00", "08:00")] },
    })).json();
  mine = await group("R1", teacher.teacher.id, 4);
  foreign = await group("R2", other.teacher.id, 10);
  for (const [label, g] of [["RepA", mine], ["RepB", mine], ["RepC", foreign]] as const) {
    const s = await makeStudent(RUN, label);
    students.push({ id: s.id, studentNumber: s.studentNumber });
    await control.post(`groups/${g.id}/enroll`, { data: { studentId: s.id } });
  }

  const concept = await (await control.post("fee-concepts", { data: { name: `E2E Reporte ${RUN}`, amount: 1000, type: "TUITION" } })).json();
  const charge = async (studentId: string, dueDate: string) =>
    (await control.post("charges", { data: { studentId, conceptId: concept.id, termId, dueDate } })).json();
  const c1 = await charge(students[0].id, "2026-01-10");
  const c2 = await charge(students[1].id, "2099-01-10");
  paidReceipt = (await (await control.post("payments", { data: { chargeId: c1.id, amount: 300, method: "CASH" } })).json()).receiptNumber;
  const toCancel = await (await control.post("payments", { data: { chargeId: c2.id, amount: 200, method: "TRANSFER" } })).json();
  cancelledReceipt = toCancel.receiptNumber;
  await control.delete(`payments/${toCancel.id}`, { data: { reason: "Prueba de reporte" } });
  const cancelledCharge = await charge(students[2].id, "2026-01-10");
  await control.delete(`charges/${cancelledCharge.id}`, { data: { reason: "Prueba de reporte" } });
});

test.afterAll(async () => {
  await control?.dispose();
  await prof?.dispose();
  await clearFinanceE2E();
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: termId } });
  await clearAuthE2E();
});

test("catálogo: el profesor no ve reportes con montos; el alumno no entra", async () => {
  const all = await (await control.get("reports")).json();
  // Los tipos de M10 están; los de M21 los verifica su propia suite (F8).
  expect(all.map((r: { type: string }) => r.type)).toEqual(expect.arrayContaining([
    "students-active", "students-inactive", "enrollments-by-group", "grades-by-group", "attendance-by-group", "payments-period", "debts",
  ]));
  const area = await (await prof.get("reports")).json();
  expect(area.map((r: { type: string }) => r.type)).not.toContain("debts");
  const { api } = await loginAs(PUPIL.username);
  expect((await api.get("reports")).status()).toBe(403);
  expect((await api.get("dashboard/executive")).status()).toBe(403);
  await api.dispose();
});

test("validaciones: tipo desconocido 404, formato inválido, rango invertido y fecha inválida 400", async () => {
  const unknown = await report(control, "attendance-list");
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).code).toBe("REPORT_NOT_FOUND");
  expect((await (await report(control, "debts", { format: "csv" })).json()).code).toBe("REPORT_FORMAT_INVALID");
  expect((await (await report(control, "payments-period", { from: "2026-02-01", to: "2026-01-01" })).json()).code).toBe("INVALID_RANGE");
  expect((await (await report(control, "payments-period", { from: "2026-02-30" })).json()).code).toBe("INVALID_FILTER");
});

test("inscripciones por grupo: ocupación y alcance AREA del profesor", async () => {
  const res = await (await report(control, "enrollments-by-group", { termId })).json();
  expect(res.filters.termName).toContain("Reportes");
  const r1 = res.rows.find((r: { groupName: string }) => r.groupName === "R1");
  expect(r1).toMatchObject({ capacity: 4, enrolledCount: 2, available: 2, occupancy: 50 });
  expect(res.totals).toMatchObject({ rows: 2, capacity: 14, enrolledCount: 3 });
  expect(res.columns.find((c: { key: string }) => c.key === "occupancy").type).toBe("percent");

  const area = await (await report(prof, "enrollments-by-group", { termId })).json();
  expect(area.rows.map((r: { groupName: string }) => r.groupName)).toEqual(["R1"]);
  // Pedir el grupo ajeno no amplía el alcance.
  const forced = await (await report(prof, "enrollments-by-group", { termId, groupId: foreign.id })).json();
  expect(forced.rows).toHaveLength(0);
});

test("alumnos activos y calificaciones: el profesor solo ve a sus alumnos", async () => {
  const active = await (await report(prof, "students-active")).json();
  const studentNumbers = active.rows.map((r: { studentNumber: string }) => r.studentNumber);
  expect(studentNumbers).toEqual(expect.arrayContaining([students[0].studentNumber, students[1].studentNumber]));
  expect(studentNumbers).not.toContain(students[2].studentNumber);
  const grades = await (await report(prof, "grades-by-group", { termId })).json();
  expect(grades.rows).toHaveLength(2);
  expect(grades.rows.every((r: { groupName: string; status: string }) => r.groupName === "R1" && r.status === "ENROLLED")).toBe(true);
});

test("pagos del periodo y adeudos: excluyen cancelados; el profesor → 403", async () => {
  const payments = await (await report(control, "payments-period", { termId })).json();
  const receiptNumbers = payments.rows.map((r: { receiptNumber: string }) => r.receiptNumber);
  expect(receiptNumbers).toContain(paidReceipt);
  expect(receiptNumbers).not.toContain(cancelledReceipt);
  expect(payments.filters.from).toBe(`${today().slice(0, 7)}-01`);
  expect(payments.totals).toMatchObject({ rows: 1, amount: 300, CASH: 300 });

  const debts = await (await report(control, "debts", { termId })).json();
  expect(debts.rows).toHaveLength(2);
  const overdue = debts.rows.find((r: { studentNumber: string }) => r.studentNumber === students[0].studentNumber);
  expect(overdue).toMatchObject({ total: 1000, paid: 300, balance: 700 });
  expect(overdue.daysOverdue).toBeGreaterThan(0);
  expect(debts.totals).toMatchObject({ balance: 1700, overdue: 700 });

  const denied = await report(prof, "debts");
  expect(denied.status()).toBe(403);
  expect((await denied.json()).code).toBe("REPORT_REQUIRES_FULL_SCOPE");
});

test("exportación xlsx y pdf con los mismos filtros, auditada; sin reports.export → 403", async () => {
  const xlsx = await report(control, "debts", { termId, format: "xlsx" });
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  expect((await lastAudit("REPORT_EXPORTED", controlId))?.metadata).toMatchObject({ type: "debts", format: "xlsx", rows: 2 });

  const pdf = await report(control, "enrollments-by-group", { termId, format: "pdf" });
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await lastAudit("REPORT_EXPORTED", controlId))?.metadata).toMatchObject({ format: "pdf", rows: 2 });

  const { api } = await loginAs(NOEXPORT.username);
  expect((await report(api, "debts", { termId })).status()).toBe(200);
  expect((await report(api, "debts", { termId, format: "xlsx" })).status()).toBe(403);
  await api.dispose();
});

test("tablero: KPIs institucionales con alertas; el profesor sin montos y con sus grupos", async () => {
  const kpis = await (await control.get(`dashboard/executive?termId=${termId}`)).json();
  expect(kpis.term.id).toBe(termId);
  // Un cargo vencido con saldo (1000 - 300): el alumno es el único con adeudo.
  expect(kpis.alerts.overdueDebt).toMatchObject({ count: 1, amount: 700 });
  expect(kpis.alerts.overdueDebt.students[0].name).toContain("RepA");
  // Con alcance ALL el bloque financiero existe (puede estar en cero si el ciclo no es el activo).
  expect(kpis.financialPosition).not.toBeNull();
  expect(kpis.incomeVsExpenses).not.toBeNull();
  expect(kpis.groupsByOccupancy.length).toBeGreaterThan(0);
  expect(kpis.recentMovements).toEqual(expect.any(Array));

  const area = await (await prof.get(`dashboard/executive?termId=${termId}`)).json();
  expect(area).toMatchObject({
    expenses: null,
    financialPosition: null,
    incomeVsProjection: null,
    incomeVsExpenses: null,
    recentPayments: null,
  });
  expect(area.indicators.pendingAmount).toBeNull();
  expect(area.indicators.collected).toBeNull();
  expect(area.alerts.overdueDebt).toBeNull();
  // El profesor solo ve los grupos de su alcance AREA.
  expect(area.groupsByOccupancy.every((g: { groupId: string }) => g.groupId === mine.id)).toBe(true);
});
