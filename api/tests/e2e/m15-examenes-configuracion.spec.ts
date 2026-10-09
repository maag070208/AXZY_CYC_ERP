import { test, expect, type APIRequestContext } from "@playwright/test";
import { assertSafeDatabase, newRunId } from "./support/env";
import { clearAcademicE2E, clearAuthE2E, clearStudentsE2E, clearTeachersE2E, db, lastAudit } from "./support/db";
import { loginAs } from "./support/http";
import { makeTeacher } from "./support/academic";
import { makePupil, makeQuestion, openWindow, setupExamWorld } from "./support/online-exam";

/**
 * Contrato de M15: borrador → publicado → cerrado; preguntas activas del curso
 * con puntos por examen; aprobatorio ≤ total; vínculo a una evaluación del
 * grupo; bloqueo con intentos; alcance del profesor y del alumno.
 */
assertSafeDatabase();

const RUN = newRunId();
let world: Awaited<ReturnType<typeof setupExamWorld>>;
let prof: APIRequestContext;
let profUserId: string;

const exam = (overrides: Record<string, unknown> = {}) => ({
  groupId: world.group.id,
  title: "E2E Parcial en línea",
  instructions: "Lee con atención",
  durationMin: 30,
  maxAttempts: 2,
  ...openWindow(),
  passingScore: 6,
  ...overrides,
});

const draftWithQuestions = async (overrides: Record<string, unknown> = {}) => {
  const created = await (await prof.post("online-exams", { data: exam(overrides) })).json();
  const { om, vf, mr, ab } = world.questions;
  const res = await prof.post(`online-exams/${created.id}/questions`, {
    data: { questions: [{ questionId: om.id }, { questionId: vf.id }, { questionId: mr.id }, { questionId: ab.id, points: 4 }] },
  });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
};

test.beforeAll(async () => {
  world = await setupExamWorld(RUN, "c");
  prof = (await loginAs(world.teacher.username)).api;
  profUserId = world.teacher.userId;
});

test.afterAll(async () => {
  await prof?.dispose();
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: world.term.id } });
  await clearAuthE2E();
});

test("alta en borrador con bitácora; ventana invertida → 400; grupo ajeno → 403", async () => {
  const res = await prof.post("online-exams", { data: exam() });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  expect(body).toMatchObject({ status: "DRAFT", totalPuntos: 0, preguntas: 0, attemptCriterion: "BEST", maxAttempts: 2 });
  expect((await lastAudit("EXAM_CREATED", profUserId))?.entityId).toBe(body.id);

  const inverted = await prof.post("online-exams", {
    data: exam({ opensAt: new Date(Date.now() + 7200_000).toISOString(), closesAt: new Date().toISOString() }),
  });
  expect(inverted.status()).toBe(400);

  const other = await makeTeacher(RUN, "cother");
  const { api } = await loginAs(other.username);
  expect((await api.post("online-exams", { data: exam() })).status()).toBe(403);
  expect((await api.get(`online-exams/${body.id}`)).status()).toBe(404);
  await api.dispose();
});

test("preguntas: points por omisión del reactivo, total; inactivas o de otro curso → 400", async () => {
  const detail = await draftWithQuestions();
  expect(detail.totalPuntos).toBe(10);
  expect(detail.questions.map((q: { points: number }) => q.points)).toEqual([2, 1, 3, 4]);
  expect((await lastAudit("EXAM_QUESTIONS_SET", profUserId))?.newState).toMatchObject({ total: 10 });

  const inactive = await makeQuestion(world.course.id, "OPEN", 1);
  await db.question.update({ where: { id: inactive.id }, data: { status: "INACTIVE" } });
  const bad = await prof.post(`online-exams/${detail.id}/questions`, { data: { questions: [{ questionId: inactive.id }] } });
  expect((await bad.json()).code).toBe("EXAM_QUESTION_INVALID");

  const removed = await prof.delete(`online-exams/${detail.id}/questions/${world.questions.ab.id}`);
  expect((await removed.json()).totalPuntos).toBe(6);
});

test("publicar: sin preguntas → 409; aprobatorio > total → 400; publicado con bitácora", async () => {
  const empty = await (await prof.post("online-exams", { data: exam() })).json();
  expect((await (await prof.post(`online-exams/${empty.id}/publish`)).json()).code).toBe("EXAM_NO_QUESTIONS");

  const tooHigh = await draftWithQuestions({ passingScore: 11 });
  const res = await prof.post(`online-exams/${tooHigh.id}/publish`);
  expect(res.status()).toBe(400);
  expect((await res.json()).code).toBe("EXAM_SCORE_INVALID");

  const ok = await draftWithQuestions();
  const published = await prof.post(`online-exams/${ok.id}/publish`);
  expect(published.status()).toBe(200);
  expect((await published.json()).status).toBe("PUBLISHED");
  expect((await lastAudit("EXAM_PUBLISHED", profUserId))?.entityId).toBe(ok.id);
  expect((await (await prof.post(`online-exams/${ok.id}/publish`)).json()).code).toBe("EXAM_ALREADY_PUBLISHED");
  expect((await (await prof.delete(`online-exams/${ok.id}`)).json()).code).toBe("EXAM_DRAFT_ONLY");
  expect((await prof.delete(`online-exams/${empty.id}`)).status()).toBe(204);
});

test("evaluación vinculada: debe ser del mismo grupo y una sola por examen", async () => {
  const assessment = await db.assessment.create({
    data: { groupId: world.group.id, name: "E2E Parcial online", type: "PARTIAL", weight: 30, maxScore: 100 },
  });
  const foreignGroup = await db.group.create({
    data: { courseId: world.course.id, termId: world.term.id, name: "Ajeno", capacity: 5, schedule: [{ dia: "LUNES", horaInicio: "07:00", horaFin: "08:00" }] },
  });
  const foreignAssessment = await db.assessment.create({
    data: { groupId: foreignGroup.id, name: "E2E Ajena", type: "PARTIAL", weight: 10, maxScore: 100 },
  });
  const bad = await prof.post("online-exams", { data: exam({ assessmentId: foreignAssessment.id }) });
  expect((await bad.json()).code).toBe("EXAM_ASSESSMENT_INVALID");
  const linked = await prof.post("online-exams", { data: exam({ assessmentId: assessment.id }) });
  expect(await linked.json()).toMatchObject({ assessmentId: assessment.id, assessmentNombre: "E2E Parcial online" });
  const taken = await prof.post("online-exams", { data: exam({ assessmentId: assessment.id }) });
  expect((await taken.json()).code).toBe("EXAM_ASSESSMENT_TAKEN");
});

test("con intentos: preguntas y reglas bloqueadas; se puede ampliar el cierre; cerrar", async () => {
  const detail = await draftWithQuestions();
  await prof.post(`online-exams/${detail.id}/publish`);
  const pupil = await makePupil(RUN, "cpupil", world.group.id);
  const { api } = await loginAs(pupil.username);
  expect((await api.post(`online-exams/${detail.id}/start`)).status()).toBe(201);
  // El alumno ve el publicado, nunca los borradores.
  const visible = await (await api.post("online-exams/query", { data: { page: 1, limit: 50 } })).json();
  expect(visible.data.every((e: { status: string }) => e.status !== "DRAFT")).toBe(true);
  expect(visible.data.map((e: { id: string }) => e.id)).toContain(detail.id);
  await api.dispose();

  const locked = await prof.post(`online-exams/${detail.id}/questions`, { data: { questions: [{ questionId: world.questions.om.id }] } });
  expect(locked.status()).toBe(409);
  expect((await locked.json()).code).toBe("EXAM_PUBLISHED_LOCKED");
  expect((await (await prof.patch(`online-exams/${detail.id}`, { data: { durationMin: 90 } })).json()).code).toBe("EXAM_PUBLISHED_LOCKED");
  const extended = await prof.patch(`online-exams/${detail.id}`, { data: { closesAt: new Date(Date.now() + 5 * 3600_000).toISOString() } });
  expect(extended.status(), await extended.text()).toBe(200);

  const closed = await prof.post(`online-exams/${detail.id}/close`);
  expect(closed.status()).toBe(200);
  expect((await closed.json()).status).toBe("CLOSED");
  const attempt = await db.examAttempt.findFirstOrThrow({ where: { examId: detail.id } });
  expect(attempt.status).toBe("EXPIRED");
  expect((await lastAudit("EXAM_CLOSED", profUserId))?.metadata).toMatchObject({ closedOpenAttempts: 1 });
  expect((await (await prof.patch(`online-exams/${detail.id}`, { data: { title: "x" } })).json()).code).toBe("EXAM_NOT_EDITABLE");
});
