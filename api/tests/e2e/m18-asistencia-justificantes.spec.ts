import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import {
  clearAcademicE2E,
  clearAuthE2E,
  clearNotificationsE2E,
  clearStudentsE2E,
  clearTeachersE2E,
  createAuthUser,
  db,
  lastAudit,
} from "./support/db";
import { loginAs } from "./support/http";
import { makeCourse, makeStudent, makeTeacher, makeTerm } from "./support/academic";
import { makePupil, type Pupil } from "./support/online-exam";

/**
 * Contrato de M18 (una prueba por regla): sesión única por grupo/fecha/hora,
 * pase completo con upsert, pertenencia, porcentaje, alerta por umbral (→ M19),
 * justificante aprobado/rechazado con archivo validado, aislamiento por grupo,
 * anulación lógica y reporte de asistencia.
 */
assertSafeDatabase();

const RUN = newRunId();
const CONTROL = { username: `${E2E_PREFIX}acontrol_${RUN}`, name: "E2E Control Asistencia", roleKey: "SCHOOL_CONTROL" };
const PDF = Buffer.from("%PDF-1.4\n% e2e justificante\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

let control: APIRequestContext;
let prof: APIRequestContext;
let profUserId: string;
let groupId: string;
let foreignGroupId: string;
let foreignEnrollmentId: string;
let ana: Pupil;
let beto: Pupil;
let anaApi: APIRequestContext;
let betoApi: APIRequestContext;
let termId: string;
const sessions: string[] = [];

const roll = (sessionId: string, statuses: Record<string, string>) =>
  prof.put(`attendance-sessions/${sessionId}/attendance`, {
    data: { items: Object.entries(statuses).map(([enrollmentId, status]) => ({ enrollmentId, status })) },
  });
const attendanceOf = (sessionId: string, enrollmentId: string) =>
  db.attendance.findUniqueOrThrow({ where: { sessionId_enrollmentId: { sessionId, enrollmentId } } });
const summaryRow = async (api: APIRequestContext, enrollmentId: string) =>
  (await (await api.get(`groups/${groupId}/attendance-summary`)).json()).rows.find((r: { enrollmentId: string }) => r.enrollmentId === enrollmentId);
const justify = (api: APIRequestContext, attendanceId: string, file?: { name: string; mimeType: string; buffer: Buffer }) =>
  api.post("justifications", { multipart: { attendanceId, reason: "Consulta médica con comprobante", ...(file ? { file } : {}) } });

test.beforeAll(async () => {
  await createAuthUser({ ...CONTROL, password: E2E.password });
  control = (await loginAs(CONTROL.username)).api;
  termId = (await makeTerm(RUN, "Asistencia")).id;
  const course = await makeCourse(RUN, "Asistencia");
  const teacher = await makeTeacher(RUN, "aprof");
  profUserId = teacher.userId;
  prof = (await loginAs(teacher.username)).api;
  const other = await makeTeacher(RUN, "aprof2");
  const group = await db.group.create({
    data: { courseId: course.id, termId, teacherId: teacher.teacher.id, name: "A1", capacity: 10, schedule: [{ day: "MONDAY", startTime: "07:00", endTime: "08:00" }] },
  });
  const foreign = await db.group.create({
    data: { courseId: course.id, termId, teacherId: other.teacher.id, name: "A2", capacity: 10, schedule: [{ day: "TUESDAY", startTime: "07:00", endTime: "08:00" }] },
  });
  groupId = group.id;
  foreignGroupId = foreign.id;
  ana = await makePupil(RUN, "asana", groupId);
  beto = await makePupil(RUN, "asbeto", groupId);
  const stranger = await makeStudent(RUN, "AsExtra");
  foreignEnrollmentId = (await db.enrollment.create({ data: { studentId: stranger.id, groupId: foreignGroupId, date: new Date("2026-08-20T00:00:00Z") } })).id;
  anaApi = (await loginAs(ana.username)).api;
  betoApi = (await loginAs(beto.username)).api;
});

test.afterAll(async () => {
  for (const api of [control, prof, anaApi, betoApi]) await api?.dispose();
  await clearNotificationsE2E();
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: termId } });
  await clearAuthE2E();
});

test("regla 1: una sesión vigente por grupo/fecha/hora; fecha futura y hora inválida → 400; bitácora", async () => {
  for (const date of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
    const res = await prof.post(`groups/${groupId}/sessions`, { data: { date, time: "07:00" } });
    expect(res.status(), await res.text()).toBe(201);
    sessions.push((await res.json()).id);
  }
  expect((await lastAudit("ATTENDANCE_SESSION_CREATED", profUserId))?.newState).toMatchObject({ groupId, date: "2026-09-03", time: "07:00" });
  const dup = await prof.post(`groups/${groupId}/sessions`, { data: { date: "2026-09-01", time: "07:00" } });
  expect(dup.status()).toBe(409);
  expect((await dup.json()).code).toBe("SESSION_DUPLICATE");
  // Otra hora el mismo día sí es otra sesión.
  expect((await prof.post(`groups/${groupId}/sessions`, { data: { date: "2026-09-01", time: "12:00", topic: "Laboratorio" } })).status()).toBe(201);
  expect((await (await prof.post(`groups/${groupId}/sessions`, { data: { date: "2099-01-01" } })).json()).code).toBe("FUTURE_DATE");
  expect((await prof.post(`groups/${groupId}/sessions`, { data: { date: "2026-09-04", time: "7am" } })).status()).toBe(400);
  const list = await (await prof.get(`groups/${groupId}/sessions`)).json();
  expect(list).toHaveLength(4);
});

test("regla 8: el profesor solo opera sus grupos; el alumno no crea sesiones ni ve el pase", async () => {
  expect((await prof.post(`groups/${foreignGroupId}/sessions`, { data: { date: "2026-09-01" } })).status()).toBe(403);
  expect((await prof.get(`groups/${foreignGroupId}/sessions`)).status()).toBe(403);
  expect((await anaApi.post(`groups/${groupId}/sessions`, { data: { date: "2026-09-05" } })).status()).toBe(403);
  expect((await anaApi.get(`attendance-sessions/${sessions[0]}`)).status()).toBe(403);
  expect((await control.get(`attendance-sessions/${sessions[0]}`)).status()).toBe(200);
});

test("reglas 2–3: el pase incluye a todos los inscritos, rechaza inscripciones ajenas y hace upsert", async () => {
  const incomplete = await roll(sessions[0], { [ana.enrollmentId]: "PRESENT" });
  expect(incomplete.status()).toBe(400);
  expect(await incomplete.json()).toMatchObject({ code: "ATTENDANCE_INCOMPLETE" });
  const foreign = await roll(sessions[0], { [ana.enrollmentId]: "PRESENT", [beto.enrollmentId]: "PRESENT", [foreignEnrollmentId]: "ABSENT" });
  expect((await foreign.json()).code).toBe("INVALID_REFERENCE");

  const first = await roll(sessions[0], { [ana.enrollmentId]: "PRESENT", [beto.enrollmentId]: "LATE" });
  expect(await first.json()).toMatchObject({ saved: 2, skipped: 0 });
  const same = await roll(sessions[0], { [ana.enrollmentId]: "PRESENT", [beto.enrollmentId]: "LATE" });
  expect((await same.json()).saved).toBe(0);
  expect((await lastAudit("ATTENDANCE_RECORDED", profUserId))?.newState).toMatchObject({ records: expect.arrayContaining([{ enrollmentId: beto.enrollmentId, status: "LATE" }]) });

  const view = await (await prof.get(`attendance-sessions/${sessions[0]}`)).json();
  expect(view.rows.map((r: { status: string }) => r.status).sort()).toEqual(["LATE", "PRESENT"]);
});

test("reglas 4–5: porcentaje (retardo cuenta) y alerta al cruzar el umbral, una sola vez y con aviso", async () => {
  await roll(sessions[1], { [ana.enrollmentId]: "ABSENT", [beto.enrollmentId]: "PRESENT" });
  // Ana: P, F → 50 % (< 80): alerta. Beto: R, P → 100 %.
  expect(await summaryRow(prof, ana.enrollmentId)).toMatchObject({ sessions: 2, absences: 1, percentage: 50, alert: true });
  expect(await summaryRow(prof, beto.enrollmentId)).toMatchObject({ sessions: 2, lates: 1, percentage: 100, alert: false });
  const alertAt = (await db.enrollment.findUniqueOrThrow({ where: { id: ana.enrollmentId } })).attendanceAlertAt;
  expect(alertAt).not.toBeNull();
  const audit = await db.auditLog.findFirst({ where: { action: "ATTENDANCE_ALERT_TRIGGERED", entityId: ana.enrollmentId }, orderBy: { createdAt: "desc" } });
  expect(audit?.newState).toMatchObject({ alert: true, percentage: 50, threshold: 80 });
  const notices = await db.notification.findMany({ where: { origin: "ABSENCE_ALERT", userId: ana.userId } });
  expect(notices.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
  expect(notices.find((n) => n.channel === "IN_APP")?.body).toContain("50 %");

  // Sigue por debajo con otra falta: no se repite la alerta.
  await roll(sessions[2], { [ana.enrollmentId]: "ABSENT", [beto.enrollmentId]: "PRESENT" });
  expect(await db.notification.count({ where: { origin: "ABSENCE_ALERT", userId: ana.userId } })).toBe(2);
  expect((await db.enrollment.findUniqueOrThrow({ where: { id: ana.enrollmentId } })).attendanceAlertAt).toEqual(alertAt);

  // El alumno solo ve su renglón.
  const own = await (await anaApi.get(`groups/${groupId}/attendance-summary`)).json();
  expect(own.rows).toHaveLength(1);
  expect(own.rows[0].enrollmentId).toBe(ana.enrollmentId);
});

test("regla 7: justificante solo de faltas, con PDF/JPG/PNG validado por contenido; uno por falta", async () => {
  const absence = await attendanceOf(sessions[1], ana.enrollmentId);
  const present = await attendanceOf(sessions[0], ana.enrollmentId);
  expect((await (await justify(anaApi, present.id)).json()).code).toBe("JUSTIFICATION_ONLY_ABSENCE");
  const badFile = await justify(anaApi, absence.id, { name: "note.pdf", mimeType: "application/pdf", buffer: Buffer.from("no soy un pdf") });
  expect((await badFile.json()).code).toBe("FILE_TYPE_NOT_ALLOWED");
  // Beto no puede justificar la falta de Ana (OWN) ni el alumno de otro grupo verla.
  expect((await justify(betoApi, absence.id)).status()).toBe(404);

  const created = await justify(anaApi, absence.id, { name: "receta.pdf", mimeType: "application/pdf", buffer: PDF });
  expect(created.status(), await created.text()).toBe(201);
  const body = await created.json();
  expect(body).toMatchObject({ status: "PENDING", hasFile: true, fileName: "receta.pdf", date: "2026-09-02" });
  expect((await (await justify(anaApi, absence.id)).json()).code).toBe("JUSTIFICATION_EXISTS");

  // Bandeja: el profesor la ve; el alumno solo las suyas.
  const inbox = await (await prof.post("justifications/query", { data: { page: 1, limit: 10, filters: { status: "PENDING" } } })).json();
  expect(inbox.data.map((j: { id: string }) => j.id)).toContain(body.id);
  const betoInbox = await (await betoApi.post("justifications/query", { data: { page: 1, limit: 10, filters: {} } })).json();
  expect(betoInbox.total).toBe(0);
  // Archivo: dueño y profesor sí; otro alumno no.
  const file = await prof.get(`justifications/${body.id}/file`);
  expect(file.headers()["content-type"]).toBe("application/pdf");
  expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await anaApi.get(`justifications/${body.id}/file`)).status()).toBe(200);
  expect((await betoApi.get(`justifications/${body.id}/file`)).status()).toBe(404);
});

test("regla 6: aprobar convierte la falta en JUSTIFIED, recalcula y limpia la alerta; el pase no la pisa", async () => {
  const absence = await attendanceOf(sessions[1], ana.enrollmentId);
  const [pending] = await db.justification.findMany({ where: { attendanceId: absence.id } });
  expect((await anaApi.patch(`justifications/${pending.id}/resolve`, { data: { status: "APPROVED" } })).status()).toBe(403);

  const approved = await prof.patch(`justifications/${pending.id}/resolve`, { data: { status: "APPROVED", note: "Comprobante válido" } });
  expect(approved.status(), await approved.text()).toBe(200);
  expect((await attendanceOf(sessions[1], ana.enrollmentId)).status).toBe("JUSTIFIED");
  expect((await prof.patch(`justifications/${pending.id}/resolve`, { data: { status: "REJECTED" } })).status()).toBe(409);
  const audit = await lastAudit("JUSTIFICATION_APPROVED", profUserId);
  expect(audit?.previousState).toMatchObject({ status: "PENDING", attendance: "ABSENT" });
  expect(audit?.newState).toMatchObject({ status: "APPROVED", attendance: "JUSTIFIED" });
  // Ana: P, J, F → 66.67 % sigue bajo 80 (la alerta sigue vigente).
  expect(await summaryRow(prof, ana.enrollmentId)).toMatchObject({ justified: 1, absences: 1, percentage: 66.67, alert: true });
  expect(await db.notification.count({ where: { origin: "JUSTIFICATION_RESOLVED", userId: ana.userId } })).toBe(2);

  // Volver a pasar lista no modifica la justificada (queda bloqueada).
  const again = await roll(sessions[1], { [ana.enrollmentId]: "ABSENT", [beto.enrollmentId]: "PRESENT" });
  expect(await again.json()).toMatchObject({ skipped: 1 });
  expect((await attendanceOf(sessions[1], ana.enrollmentId)).status).toBe("JUSTIFIED");
});

test("rechazar deja la falta; se puede volver a solicitar y al aprobar se recupera el umbral", async () => {
  const absence = await attendanceOf(sessions[2], ana.enrollmentId);
  const first = await (await justify(anaApi, absence.id)).json();
  const rejected = await prof.patch(`justifications/${first.id}/resolve`, { data: { status: "REJECTED", note: "Sin comprobante" } });
  expect((await rejected.json()).status).toBe("REJECTED");
  expect((await attendanceOf(sessions[2], ana.enrollmentId)).status).toBe("ABSENT");

  const retry = await justify(anaApi, absence.id, { name: "constancia.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]) });
  expect(retry.status()).toBe(201);
  expect((await retry.json()).id).toBe(first.id);
  await control.patch(`justifications/${first.id}/resolve`, { data: { status: "APPROVED" } });
  // Ana: P, J, J → 100 %: la alerta se limpia (y queda en bitácora).
  expect(await summaryRow(prof, ana.enrollmentId)).toMatchObject({ percentage: 100, alert: false });
  expect((await db.enrollment.findUniqueOrThrow({ where: { id: ana.enrollmentId } })).attendanceAlertAt).toBeNull();
  expect(await db.auditLog.count({ where: { action: "ATTENDANCE_ALERT_CLEARED", entityId: ana.enrollmentId } })).toBe(1);
});

test("regla 9: anular una sesión la saca del porcentaje sin borrar registros; ya no admite pase", async () => {
  const extra = (await (await prof.get(`groups/${groupId}/sessions`)).json()).find((s: { time: string | null }) => s.time === "12:00");
  await roll(extra.id, { [ana.enrollmentId]: "PRESENT", [beto.enrollmentId]: "ABSENT" });
  expect(await summaryRow(prof, beto.enrollmentId)).toMatchObject({ sessions: 4, absences: 1, percentage: 75, alert: true });

  const annulled = await prof.delete(`attendance-sessions/${extra.id}`, { data: { reason: "Sesión duplicada por error" } });
  expect(await annulled.json()).toMatchObject({ annulled: true, deleteReason: "Sesión duplicada por error" });
  expect(await db.attendance.count({ where: { sessionId: extra.id } })).toBe(2);
  expect(await summaryRow(prof, beto.enrollmentId)).toMatchObject({ sessions: 3, absences: 0, percentage: 100, alert: false });
  expect((await roll(extra.id, { [ana.enrollmentId]: "PRESENT", [beto.enrollmentId]: "PRESENT" })).status()).toBe(409);
  expect((await prof.delete(`attendance-sessions/${extra.id}`, { data: { reason: "otra vez" } })).status()).toBe(409);
});

test("asistencia del alumno (OWN/AREA) y reporte attendance-by-group", async () => {
  const own = await (await anaApi.get(`students/${ana.studentId}/attendance`)).json();
  expect(own.groups).toHaveLength(1);
  expect(own.groups[0]).toMatchObject({ groupId, percentage: 100, sessions: 3 });
  expect(own.groups[0].records.map((r: { status: string }) => r.status)).toEqual(["JUSTIFIED", "JUSTIFIED", "PRESENT"]);
  const peek = await (await anaApi.get(`students/${beto.studentId}/attendance`)).json();
  expect(peek.groups).toHaveLength(0);
  expect((await (await prof.get(`students/${beto.studentId}/attendance`)).json()).groups).toHaveLength(1);

  const report = await (await control.get(`reports/attendance-by-group?termId=${termId}`)).json();
  const row = report.rows.find((r: { studentNumber: string; groupName: string }) => r.groupName === "A1" && r.name.includes("asana"));
  expect(row).toMatchObject({ sessions: 3, absences: 0, justified: 2, percentage: 100, alert: null });
  expect(report.columns.find((c: { key: string }) => c.key === "percentage").type).toBe("percent");
  const area = await (await prof.get(`reports/attendance-by-group?termId=${termId}`)).json();
  expect(area.rows.every((r: { groupName: string }) => r.groupName === "A1")).toBe(true);
});
