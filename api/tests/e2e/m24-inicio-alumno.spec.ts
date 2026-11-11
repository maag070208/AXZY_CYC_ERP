import { test, expect, type APIRequestContext } from "@playwright/test";
import { assertSafeDatabase, newRunId } from "./support/env";
import { clearAcademicE2E, clearAuthE2E, clearStudentsE2E, clearTeachersE2E, db } from "./support/db";
import { loginAs } from "./support/http";
import { makePupil, openWindow, setupExamWorld, type Pupil } from "./support/online-exam";

/**
 * Contrato del Inicio del alumno (M21): una sola respuesta con su ciclo, el
 * horario tal como está guardado, los exámenes por presentar, los cargos con
 * saldo, el expediente y los avisos. Y lo importante: **solo lo suyo**.
 */
assertSafeDatabase();

const RUN = newRunId();
let world: Awaited<ReturnType<typeof setupExamWorld>>;
let prof: APIRequestContext;
let pupil: Pupil;
let pupilApi: APIRequestContext;
let mate: Pupil;
let mateApi: APIRequestContext;
let examId: string;
let conceptId: string;
let overdueChargeId: string;
let requiredDocTypeId: string;

/** Dos cargos: uno vencido y uno por vencer. */
const makeCharges = async () => {
  const concept = await db.feeConcept.create({
    data: { name: `E2E Concepto ${RUN}`, amount: 1000, type: "TUITION" },
  });
  conceptId = concept.id;
  const overdue = await db.charge.create({
    data: {
      studentId: pupil.studentId,
      conceptId: concept.id,
      termId: world.term.id,
      description: "E2E Colegiatura vencida",
      amount: 1000,
      dueDate: new Date("2026-09-05T00:00:00.000Z"),
    },
  });
  overdueChargeId = overdue.id;
  await db.charge.create({
    data: {
      studentId: pupil.studentId,
      conceptId: concept.id,
      termId: world.term.id,
      description: "E2E Colegiatura por vencer",
      amount: 500,
      dueDate: new Date("2099-12-05T00:00:00.000Z"),
    },
  });
  // Cargo del compañero: no debe aparecer en el tablero del alumno.
  await db.charge.create({
    data: {
      studentId: mate.studentId,
      conceptId: concept.id,
      termId: world.term.id,
      description: "E2E Cargo del compañero",
      amount: 777,
      dueDate: new Date("2026-09-05T00:00:00.000Z"),
    },
  });
};

test.beforeAll(async () => {
  world = await setupExamWorld(RUN, "d");
  prof = (await loginAs(world.teacher.username)).api;
  pupil = await makePupil(RUN, "dpupil", world.group.id);
  mate = await makePupil(RUN, "dmate", world.group.id);
  pupilApi = (await loginAs(pupil.username)).api;
  mateApi = (await loginAs(mate.username)).api;

  // Examen publicado y abierto ahora para el grupo del alumno.
  const exam = await (
    await prof.post("online-exams", {
      data: { groupId: world.group.id, title: "E2E Examen del tablero", durationMin: 20, maxAttempts: 1, ...openWindow(), passingScore: 5 },
    })
  ).json();
  examId = exam.id;
  // Los cuatro reactivos del mundo de prueba: el total (10) debe cubrir el puntaje aprobatorio.
  const { om, vf, mr, ab } = world.questions;
  await prof.post(`online-exams/${examId}/questions`, {
    data: { questions: [om, vf, mr, ab].map((question) => ({ questionId: question.id })) },
  });
  expect((await prof.post(`online-exams/${examId}/publish`)).status()).toBe(200);

  await makeCharges();

  // Documento obligatorio sin entregar + un aviso interno sin leer.
  const docType = await db.documentType.create({
    data: { name: `E2E Acta ${RUN}`, required: true, active: true },
  });
  requiredDocTypeId = docType.id;
  await db.notification.create({
    data: {
      recipient: pupil.username,
      channel: "IN_APP",
      userId: pupil.userId,
      origin: "MANUAL",
      subject: "E2E Aviso del tablero",
      body: "Nos vemos el lunes",
      status: "SENT",
      sentAt: new Date(),
    },
  });
});

test.afterAll(async () => {
  await prof?.dispose();
  await pupilApi?.dispose();
  await mateApi?.dispose();
  await db.notification.deleteMany({ where: { userId: { in: [pupil.userId, mate.userId] } } });
  await db.charge.deleteMany({ where: { conceptId } });
  await db.feeConcept.deleteMany({ where: { id: conceptId } });
  await db.documentType.deleteMany({ where: { id: requiredDocTypeId } });
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: world.term.id } });
  await clearAuthE2E();
});

test("el alumno ve su perfil, sus grupos y el horario guardado", async () => {
  const res = await pupilApi.get("dashboard/student");
  expect(res.status(), await res.text()).toBe(200);
  const board = await res.json();

  expect(board.student).toMatchObject({ studentNumber: expect.any(String), status: "ACTIVE" });
  expect(board.student.id).toBe(pupil.studentId);
  expect(board.groups).toHaveLength(1);
  expect(board.groups[0]).toMatchObject({
    groupId: world.group.id,
    groupName: world.group.name,
    schedule: [{ day: "SUNDAY", startTime: "07:00", endTime: "08:00" }],
  });
  expect(board.student.name).toContain("E2E");
});

test("los exámenes por presentar salen con su ventana y si puede iniciar", async () => {
  const board = await (await pupilApi.get("dashboard/student")).json();
  expect(board.exams.toTake).toBe(1);
  expect(board.exams.open).toBe(1);
  expect(board.exams.next).toMatchObject({ examId, state: "OPEN", canStart: true, attemptsUsed: 0 });
  expect(new Date(board.exams.next.closesAt).getTime()).toBeGreaterThan(Date.now());
});

test("los pagos llegan con saldo, mora y solo los cargos propios", async () => {
  const board = await (await pupilApi.get("dashboard/student")).json();
  const pending = board.payments.pending as Array<Record<string, unknown>>;

  expect(board.payments.balance).toBe(1500);
  expect(board.payments.overdue).toBe(1000);
  // Ordenados por vencimiento y sin los cargos del compañero.
  expect(pending.map((row) => row.id)).toEqual([overdueChargeId, expect.any(String)]);
  expect(pending.map((row) => row.balance)).toEqual([1000, 500]);
  expect(pending[0]).toMatchObject({ concept: `E2E Concepto ${RUN}`, overdue: true, paid: 0, total: 1000 });
  // El estado de cuenta trae más campos; el alumno no los recibe.
  expect(Object.keys(pending[0]).sort()).toEqual(
    ["balance", "concept", "description", "dueDate", "id", "overdue", "paid", "total"].sort()
  );
  expect(JSON.stringify(board)).not.toContain("E2E Cargo del compañero");
});

test("el expediente lista lo que falta y los avisos lo no leído", async () => {
  const board = await (await pupilApi.get("dashboard/student")).json();
  expect(board.documents.missing.map((doc: { id: string }) => doc.id)).toContain(requiredDocTypeId);
  expect(board.documents.requiredCount).toBeGreaterThanOrEqual(1);
  expect(board.notifications.unread).toBeGreaterThanOrEqual(1);
  expect(board.notifications.latest[0]).toMatchObject({ subject: "E2E Aviso del tablero", read: false });
});

test("el tablero es personal: el compañero no ve lo ajeno", async () => {
  const board = await (await mateApi.get("dashboard/student")).json();
  expect(board.student.id).toBe(mate.studentId);
  expect(board.payments.balance).toBe(777);
  const pending = JSON.stringify(board.payments.pending);
  expect(pending).not.toContain("E2E Colegiatura vencida");
  expect(pending).not.toContain(overdueChargeId);
  // El mismo examen sí lo ven los dos: van en el mismo grupo.
  expect(board.exams.toTake).toBe(1);
});

test("una cuenta sin expediente de alumno no tiene tablero", async () => {
  const res = await prof.get("dashboard/student");
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe("NOT_A_STUDENT");
});

test("sin sesión el tablero no se expone", async () => {
  const { request } = await import("@playwright/test");
  const anonymous = await request.newContext({ baseURL: `${process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api/v1"}/` });
  expect((await anonymous.get("dashboard/student")).status()).toBe(401);
  await anonymous.dispose();
});
