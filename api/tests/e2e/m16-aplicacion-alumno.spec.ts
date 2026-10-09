import { test, expect, type APIRequestContext } from "@playwright/test";
import { assertSafeDatabase, newRunId } from "./support/env";
import { clearAcademicE2E, clearAuthE2E, clearStudentsE2E, clearTeachersE2E, db, lastAudit } from "./support/db";
import { loginAs } from "./support/http";
import { makePupil, openWindow, setupExamWorld, type Pupil } from "./support/online-exam";

/**
 * Contrato de M16: inicio validado (inscripción, ventana, intentos), reanudar
 * sin duplicar, autosave idempotente y validado, envío, inmutabilidad,
 * expiración por el servidor, eventos de pestaña y privacidad del intento.
 */
assertSafeDatabase();

const RUN = newRunId();
let world: Awaited<ReturnType<typeof setupExamWorld>>;
let prof: APIRequestContext;
let pupil: Pupil;
let pupilApi: APIRequestContext;

const publishedExam = async (overrides: Record<string, unknown> = {}) => {
  const exam = await (
    await prof.post("online-exams", {
      data: { groupId: world.group.id, titulo: "E2E Examen M16", duracionMin: 20, intentosMax: 1, ...openWindow(), puntajeAprobatorio: 5, ...overrides },
    })
  ).json();
  const { om, vf, mr, ab } = world.questions;
  await prof.post(`online-exams/${exam.id}/questions`, {
    data: { questions: [om, vf, mr, ab].map((q) => ({ questionId: q.id })) },
  });
  const res = await prof.post(`online-exams/${exam.id}/publish`);
  expect(res.status(), await res.text()).toBe(200);
  return exam.id as string;
};

test.beforeAll(async () => {
  world = await setupExamWorld(RUN, "a");
  prof = (await loginAs(world.teacher.username)).api;
  pupil = await makePupil(RUN, "apupil", world.group.id);
  pupilApi = (await loginAs(pupil.username)).api;
});

test.afterAll(async () => {
  await prof?.dispose();
  await pupilApi?.dispose();
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: world.term.id } });
  await clearAuthE2E();
});

test("inicio: sin claves de respuesta, tiempo del servidor y reanudación sin duplicar", async () => {
  const examId = await publishedExam();
  const available = await (await pupilApi.get("online-exams/available")).json();
  expect(available.find((e: { examId: string }) => e.examId === examId)).toMatchObject({ canStart: true, intentosUsados: 0, state: "OPEN" });

  const res = await pupilApi.post(`online-exams/${examId}/start`);
  expect(res.status(), await res.text()).toBe(201);
  const attempt = await res.json();
  expect(attempt).toMatchObject({ status: "EN_CURSO", numero: 1, result: null });
  expect(attempt.remainingSeconds).toBeGreaterThan(19 * 60);
  expect(attempt.remainingSeconds).toBeLessThanOrEqual(20 * 60);
  expect(attempt.questions).toHaveLength(4);
  expect(JSON.stringify(attempt.questions)).not.toContain("esCorrecta");
  expect((await lastAudit("ATTEMPT_STARTED", pupil.userId))?.entityId).toBe(attempt.attemptId);

  const [a, b] = await Promise.all([pupilApi.post(`online-exams/${examId}/start`), pupilApi.post(`online-exams/${examId}/start`)]);
  expect([a.status(), b.status()]).toEqual([200, 200]);
  expect((await a.json()).attemptId).toBe(attempt.attemptId);
  expect(await db.examAttempt.count({ where: { examId } })).toBe(1);
});

test("autosave: upsert sin duplicar; opción ajena → 400 INVALID_ANSWER; pregunta ajena → 400", async () => {
  const examId = await publishedExam({ titulo: "E2E Autosave" });
  const attempt = await (await pupilApi.post(`online-exams/${examId}/start`)).json();
  const om = attempt.questions.find((q: { tipo: string }) => q.tipo === "OPCION_MULTIPLE");
  const ab = attempt.questions.find((q: { tipo: string }) => q.tipo === "ABIERTA");
  for (let i = 0; i < 2; i++) {
    const saved = await pupilApi.put(`attempts/${attempt.attemptId}/answers`, {
      data: { answers: [{ questionId: om.questionId, respuesta: om.options[1].id }, { questionId: ab.questionId, respuesta: "Borrador" }] },
    });
    expect(saved.status()).toBe(200);
    expect((await saved.json()).saved).toBe(2);
  }
  expect(await db.attemptAnswer.count({ where: { attemptId: attempt.attemptId } })).toBe(2);
  const reread = await (await pupilApi.get(`attempts/${attempt.attemptId}`)).json();
  expect(reread.questions.find((q: { questionId: string }) => q.questionId === ab.questionId).respuesta).toBe("Borrador");

  const wrongOption = await pupilApi.put(`attempts/${attempt.attemptId}/answers`, {
    data: { answers: [{ questionId: om.questionId, respuesta: world.questions.vf.options[0].id }] },
  });
  expect((await wrongOption.json()).code).toBe("INVALID_ANSWER");
  const foreign = await pupilApi.put(`attempts/${attempt.attemptId}/answers`, {
    data: { answers: [{ questionId: "00000000-0000-0000-0000-000000000000", respuesta: "x" }] },
  });
  expect((await foreign.json()).code).toBe("INVALID_REFERENCE");
});

test("envío: cierra el intento; después no admite cambios ni otro intento si ya no quedan", async () => {
  const examId = await publishedExam({ titulo: "E2E Envío" });
  const attempt = await (await pupilApi.post(`online-exams/${examId}/start`)).json();
  const submitted = await pupilApi.post(`attempts/${attempt.attemptId}/submit`, { data: {} });
  expect(submitted.status()).toBe(200);
  expect((await submitted.json()).status).toBe("ENVIADO");
  expect((await lastAudit("ATTEMPT_SUBMITTED", pupil.userId))?.entityId).toBe(attempt.attemptId);

  const late = await pupilApi.put(`attempts/${attempt.attemptId}/answers`, {
    data: { answers: [{ questionId: attempt.questions[0].questionId, respuesta: null }] },
  });
  expect(late.status()).toBe(409);
  expect((await late.json()).code).toBe("ATTEMPT_CLOSED");
  expect((await (await pupilApi.post(`attempts/${attempt.attemptId}/submit`, { data: {} })).json()).code).toBe("ATTEMPT_CLOSED");
  const again = await pupilApi.post(`online-exams/${examId}/start`);
  expect(again.status()).toBe(409);
  expect(await again.json()).toMatchObject({ code: "EXAM_NOT_AVAILABLE", details: { reason: "NO_ATTEMPTS" } });
});

test("ventana e inscripción: antes de abrir → NOT_OPEN; alumno de otro grupo → NOT_ENROLLED", async () => {
  const future = await (
    await prof.post("online-exams", {
      data: {
        groupId: world.group.id, titulo: "E2E Futuro", duracionMin: 10, puntajeAprobatorio: 1,
        fechaApertura: new Date(Date.now() + 3600_000).toISOString(), fechaCierre: new Date(Date.now() + 7200_000).toISOString(),
      },
    })
  ).json();
  await prof.post(`online-exams/${future.id}/questions`, { data: { questions: [{ questionId: world.questions.om.id }] } });
  await prof.post(`online-exams/${future.id}/publish`);
  const notOpen = await pupilApi.post(`online-exams/${future.id}/start`);
  expect(await notOpen.json()).toMatchObject({ code: "EXAM_NOT_AVAILABLE", details: { reason: "NOT_OPEN" } });

  const examId = await publishedExam({ titulo: "E2E Ajeno" });
  const outsider = await makePupil(RUN, "aoutsider", world.group.id);
  await db.enrollment.update({ where: { id: outsider.enrollmentId }, data: { status: "BAJA" } });
  const { api } = await loginAs(outsider.username);
  const res = await api.post(`online-exams/${examId}/start`);
  expect(await res.json()).toMatchObject({ code: "EXAM_NOT_AVAILABLE", details: { reason: "NOT_ENROLLED" } });
  await api.dispose();
});

test("expiración decidida por el servidor; el cierre del examen acota la duración", async () => {
  const examId = await publishedExam({
    titulo: "E2E Expira", duracionMin: 120, fechaApertura: new Date(Date.now() - 60_000).toISOString(),
    fechaCierre: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  const attempt = await (await pupilApi.post(`online-exams/${examId}/start`)).json();
  expect(attempt.remainingSeconds).toBeLessThanOrEqual(10 * 60);

  await db.examAttempt.update({ where: { id: attempt.attemptId }, data: { endsAt: new Date(Date.now() - 1000) } });
  const expired = await (await pupilApi.get(`attempts/${attempt.attemptId}`)).json();
  expect(expired).toMatchObject({ status: "EXPIRADO", remainingSeconds: 0 });
  expect(expired.result).toMatchObject({ score: 0, totalPuntos: 10 });
  expect((await lastAudit("ATTEMPT_EXPIRED"))?.entityId).toBe(attempt.attemptId);
});

test("eventos de pestaña y privacidad: otro alumno no ve el intento", async () => {
  const examId = await publishedExam({ titulo: "E2E Foco" });
  const attempt = await (await pupilApi.post(`online-exams/${examId}/start`)).json();
  await pupilApi.post(`attempts/${attempt.attemptId}/events`, { data: { type: "TAB_BLUR" } });
  const second = await (await pupilApi.post(`attempts/${attempt.attemptId}/events`, { data: { type: "TAB_BLUR" } })).json();
  expect(second.focusLosses).toBe(2);
  expect((await (await pupilApi.post(`attempts/${attempt.attemptId}/events`, { data: { type: "COPY" } })).json()).code).toBe("VALIDATION_ERROR");

  const other = await makePupil(RUN, "aother", world.group.id);
  const { api } = await loginAs(other.username);
  expect((await api.get(`attempts/${attempt.attemptId}`)).status()).toBe(404);
  expect((await api.put(`attempts/${attempt.attemptId}/answers`, { data: { answers: [{ questionId: attempt.questions[0].questionId, respuesta: null }] } })).status()).toBe(404);
  await api.dispose();
  expect((await prof.post(`online-exams/${examId}/start`)).status()).toBe(403);
});
