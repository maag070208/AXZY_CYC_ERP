import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import {
  clearAcademicE2E,
  clearAuthE2E,
  clearFinanceE2E,
  clearNotificationsE2E,
  clearStudentsE2E,
  clearTeachersE2E,
  createAuthUser,
  db,
  lastAudit,
} from "./support/db";
import { loginAs } from "./support/http";
import { makePupil, openWindow, setupExamWorld, type Pupil } from "./support/online-exam";

/**
 * Contrato de M19: plantillas (CRUD, clave+canal única, variables), envío
 * manual idempotente con validación de variables y destinatario, outbox
 * drenado por el worker, reencolado, baja (opt-out) con avisos obligatorios
 * exentos, bandeja interna propia y disparadores de M09/M15 por el puerto.
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}nadmin_${RUN}`, name: "E2E Admin Avisos", roleKey: "ADMIN" };
const CONTROL = { username: `${E2E_PREFIX}ncontrol_${RUN}`, name: "E2E Control Avisos", roleKey: "SCHOOL_CONTROL" };
const CLAVE = `E2E_AVISO_${RUN}`.toUpperCase().slice(0, 60);
const MAIL = `e2e.tutor.${RUN}@e2e.local`.toLowerCase();

let admin: APIRequestContext;
let adminId: string;
let control: APIRequestContext;
let world: Awaited<ReturnType<typeof setupExamWorld>>;
let pupil: Pupil;
let pupilApi: APIRequestContext;
let templateId: string;

const key = (label: string) => `e2e-${label}-${RUN}`.replace(/[^A-Za-z0-9_-]/g, "");
const notificationsFor = (where: Record<string, unknown>) => db.notification.findMany({ where, orderBy: { createdAt: "asc" } });

test.beforeAll(async () => {
  adminId = (await createAuthUser({ ...ADMIN, password: E2E.password })).id;
  await createAuthUser({ ...CONTROL, password: E2E.password });
  admin = (await loginAs(ADMIN.username)).api;
  control = (await loginAs(CONTROL.username)).api;
  world = await setupExamWorld(RUN, "Avi");
  pupil = await makePupil(RUN, "avialumno", world.group.id);
  pupilApi = (await loginAs(pupil.username)).api;
});

test.afterAll(async () => {
  for (const api of [admin, control, pupilApi]) await api?.dispose();
  await clearNotificationsE2E();
  await clearFinanceE2E();
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: world?.term.id } });
  await clearAuthE2E();
});

test("plantillas: alta con variables detectadas, code+channel única, subject required en correo y bitácora", async () => {
  const created = await admin.post("notification-templates", {
    data: { code: CLAVE, name: "E2E Aviso", channel: "EMAIL", subject: "Aviso {{curso}}", body: "Hola {{name}}, revisa {{curso}}.", variables: ["name"] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const template = await created.json();
  templateId = template.id;
  expect(template.variables).toEqual(["name", "curso"]);
  expect((await lastAudit("NOTIFICATION_TEMPLATE_CREATED", adminId))?.entityId).toBe(templateId);

  const dup = await admin.post("notification-templates", { data: { code: CLAVE, name: "Otra", channel: "EMAIL", subject: "x", body: "y" } });
  expect(dup.status()).toBe(409);
  expect((await dup.json()).code).toBe("TEMPLATE_DUPLICATE");
  const noSubject = await admin.post("notification-templates", { data: { code: `${CLAVE}_B`.slice(0, 60), name: "Sin subject", channel: "EMAIL", body: "y" } });
  expect(noSubject.status()).toBe(400);
  // Misma clave en otro canal sí se permite (una plantilla por canal).
  const internal = await admin.post("notification-templates", { data: { code: CLAVE, name: "E2E Aviso interno", channel: "IN_APP", body: "Revisa {{curso}}" } });
  expect(internal.status()).toBe(201);

  const edited = await admin.patch(`notification-templates/${templateId}`, { data: { body: "Hola {{name}}: revisa {{curso}} antes del {{date}}." } });
  expect((await edited.json()).variables).toEqual(["name", "curso", "date"]);
  expect((await lastAudit("NOTIFICATION_TEMPLATE_UPDATED", adminId))?.previousState).toMatchObject({ body: "Hola {{name}}, revisa {{curso}}." });
});

test("permisos: control escolar consulta pero no administra; el alumno no entra a la consola", async () => {
  expect((await control.post("notification-templates/query", { data: { page: 1, limit: 10, filters: {} } })).status()).toBe(200);
  expect((await control.post("notification-templates", { data: { code: "E2E_X", name: "x", channel: "IN_APP", body: "x" } })).status()).toBe(403);
  expect((await control.post("notifications/send", { data: { channel: "EMAIL", recipient: MAIL, subject: "x", body: "y" } })).status()).toBe(403);
  expect((await pupilApi.post("notifications/query", { data: { page: 1, limit: 10, filters: {} } })).status()).toBe(403);
});

test("envío manual: variables faltantes y recipient inválido → 400; Idempotency-Key no duplica", async () => {
  const missing = await admin.post("notifications/send", { data: { channel: "EMAIL", recipient: MAIL, templateClave: CLAVE, payload: { name: "Ana" } } });
  expect(missing.status()).toBe(400);
  const body = await missing.json();
  expect(body.code).toBe("NOTIFICATION_VARIABLES_MISSING");
  expect(body.details.variables).toEqual(["curso", "date"]);
  const badMail = await admin.post("notifications/send", { data: { channel: "EMAIL", recipient: "no-es-correo", templateClave: CLAVE, payload: {} } });
  expect((await badMail.json()).code).toBe("NOTIFICATION_RECIPIENT_INVALID");

  const data = { channel: "EMAIL", recipient: MAIL.toUpperCase(), templateClave: CLAVE, payload: { name: "Ana", curso: "Química", date: "15 oct" } };
  const first = await admin.post("notifications/send", { data, headers: { "Idempotency-Key": key("send") } });
  expect(first.status(), await first.text()).toBe(201);
  const sent = await first.json();
  expect(sent).toMatchObject({ status: "QUEUED", recipient: MAIL, subject: "Aviso Química", body: "Hola Ana: revisa Química antes del 15 oct.", origin: "MANUAL" });
  const again = await admin.post("notifications/send", { data, headers: { "Idempotency-Key": key("send") } });
  expect((await again.json()).id).toBe(sent.id);
  expect(await db.notification.count({ where: { recipient: MAIL, origin: "MANUAL" } })).toBe(1);
  expect((await lastAudit("NOTIFICATION_QUEUED", adminId))?.entityId).toBe(sent.id);
});

test("outbox: el worker envía lo encolado (modo simulado sin proveedor) y solo reencola fallidas", async () => {
  // El worker del servidor también drena cada 15 s: se verifica el resultado, no quién lo procesó.
  const drained = await admin.post("notifications/drain");
  expect(drained.status()).toBe(200);
  expect(await drained.json()).toMatchObject({ processed: expect.any(Number), sent: expect.any(Number) });
  const [row] = await notificationsFor({ recipient: MAIL, origin: "MANUAL" });
  expect(row).toMatchObject({ status: "SENT", attempts: 1, dryRun: true });
  expect(row.sentAt).not.toBeNull();

  const notRetryable = await admin.post(`notifications/${row.id}/retry`);
  expect(notRetryable.status()).toBe(409);
  await db.notification.update({ where: { id: row.id }, data: { status: "FAILED", error: "SMTP_TIMEOUT", attempts: 5 } });
  const retried = await admin.post(`notifications/${row.id}/retry`);
  expect(await retried.json()).toMatchObject({ status: "QUEUED", attempts: 0, error: null });
  expect((await lastAudit("NOTIFICATION_RETRIED", adminId))?.previousState).toMatchObject({ status: "FAILED", error: "SMTP_TIMEOUT" });

  const history = await (await control.post("notifications/query", { data: { page: 1, limit: 10, filters: { recipient: MAIL } } })).json();
  expect(history.data.map((n: { id: string }) => n.id)).toContain(row.id);
});

test("baja (opt-out): el aviso queda SKIPPED; una plantilla obligatoria se envía igual", async () => {
  const optOut = await admin.put("notification-preferences", { data: { channel: "EMAIL", recipient: MAIL, optOut: true, reason: "Pidió no recibir avisos" } });
  expect(optOut.status(), await optOut.text()).toBe(200);
  const skipped = await (await admin.post("notifications/send", { data: { channel: "EMAIL", recipient: MAIL, subject: "Libre", body: "Mensaje libre" } })).json();
  expect(skipped).toMatchObject({ status: "SKIPPED", error: "OPT_OUT" });

  const mandatory = await admin.post("notification-templates", {
    data: { code: `${CLAVE}_OB`.slice(0, 60), name: "E2E Obligatoria", channel: "EMAIL", subject: "Estado de cuenta", body: "Tu saldo es {{saldo}}", required: true },
  });
  expect(mandatory.status()).toBe(201);
  const forced = await (await admin.post("notifications/send", { data: { channel: "EMAIL", recipient: MAIL, templateClave: `${CLAVE}_OB`.slice(0, 60), payload: { saldo: "$100.00" } } })).json();
  expect(forced.status).toBe("QUEUED");

  await admin.put("notification-preferences", { data: { channel: "EMAIL", recipient: MAIL, optOut: false } });
  expect((await lastAudit("NOTIFICATION_OPTOUT_REMOVED", adminId))?.newState).toMatchObject({ recipient: MAIL, optOut: false });
});

test("bandeja interna: se entrega al encolar, solo la ve su dueño y se marca leída", async () => {
  const sent = await (await admin.post("notifications/send", { data: { channel: "IN_APP", recipient: pupil.username, templateClave: CLAVE, payload: { curso: "Química" } } })).json();
  expect(sent).toMatchObject({ status: "SENT", userId: pupil.userId, recipient: `user:${pupil.userId}`, body: "Revisa Química" });

  const inbox = await (await pupilApi.get("notifications/mine")).json();
  expect(inbox.unread).toBeGreaterThanOrEqual(1);
  expect(inbox.data.map((n: { id: string }) => n.id)).toContain(sent.id);
  const others = await (await control.get("notifications/mine")).json();
  expect(others.data.map((n: { id: string }) => n.id)).not.toContain(sent.id);

  expect((await pupilApi.post("notifications/mine/read", { data: { ids: [sent.id] } })).status()).toBe(200);
  // Marcar desde otra cuenta no toca la ajena.
  expect((await (await control.post("notifications/mine/read", { data: { all: true } })).json())).toBeTruthy();
  const after = await (await pupilApi.get("notifications/mine")).json();
  expect(after.data.find((n: { id: string }) => n.id === sent.id).readAt).not.toBeNull();
  expect((await pupilApi.post("notifications/mine/read", { data: {} })).status()).toBe(400);
});

test("plantilla inactiva: el envío manual responde 409 y el disparador la omite", async () => {
  expect((await admin.delete(`notification-templates/${templateId}`)).status()).toBe(200);
  expect((await admin.delete(`notification-templates/${templateId}`)).status()).toBe(409);
  const res = await admin.post("notifications/send", { data: { channel: "EMAIL", recipient: MAIL, templateClave: CLAVE, payload: { name: "A", curso: "B", date: "C" } } });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe("TEMPLATE_INACTIVE");
  expect((await (await admin.post(`notification-templates/${templateId}/reactivate`)).json()).active).toBe(true);
});

test("disparadores: examen publicado (M15), pago recibido y pago por vencer (M09) por el puerto", async () => {
  // M15: al publicar, cada inscrito recibe aviso interno y por correo.
  const { api: prof } = await loginAs(world.teacher.username);
  const exam = await (await prof.post("online-exams", { data: { groupId: world.group.id, title: "E2E Parcial Avisos", durationMin: 10, ...openWindow(), passingScore: 1 } })).json();
  await prof.post(`online-exams/${exam.id}/questions`, { data: { questions: [{ questionId: world.questions.om.id }] } });
  expect((await prof.post(`online-exams/${exam.id}/publish`)).status()).toBe(200);
  await prof.dispose();
  const published = await notificationsFor({ origin: "EXAMEN_PUBLICADO", userId: pupil.userId });
  expect(published.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
  expect(published.find((n) => n.channel === "IN_APP")?.body).toContain("E2E Parcial Avisos");

  // M09: el pago deja un recibo por correo (obligatorio) y aviso interno.
  const concept = await (await admin.post("fee-concepts", { data: { name: `E2E Avisos ${RUN}`, amount: 1000, type: "TUITION" } })).json();
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const charge = await (await admin.post("charges", { data: { studentId: pupil.studentId, conceptId: concept.id, dueDate: soon } })).json();
  const payment = await (await admin.post("payments", { data: { chargeId: charge.id, amount: 400, method: "CASH" } })).json();
  const receipts = await notificationsFor({ origin: "PAGO_RECIBIDO", userId: pupil.userId });
  expect(receipts).toHaveLength(2);
  expect(receipts.find((n) => n.channel === "EMAIL")?.body).toContain(payment.receiptNumber);
  expect(receipts.find((n) => n.channel === "EMAIL")?.body).toContain("$600.00");

  // Pago por vencer: idempotente por cargo y vencimiento (el barrido puede repetirse).
  expect((await admin.post("charges/reminders", { data: { days: 3 } })).status()).toBe(200);
  await admin.post("charges/reminders", { data: { days: 3 } });
  const reminders = await notificationsFor({ origin: "PAGO_POR_VENCER", userId: pupil.userId });
  expect(reminders).toHaveLength(2);
  expect(reminders[0].body).toContain("$600.00");
});
