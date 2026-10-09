import { test, expect, type APIRequestContext } from "@playwright/test";
import { assertSafeDatabase, newRunId } from "./support/env";
import { clearAcademicE2E, clearAuthE2E, clearStudentsE2E, clearTeachersE2E, db, lastAudit } from "./support/db";
import { loginAs } from "./support/http";
import { makeTeacher } from "./support/academic";
import { makePupil, openWindow, setupExamWorld } from "./support/online-exam";

/**
 * Contrato de M17: calificación automática (todo o nada en cerradas, abiertas
 * pendientes), revisión manual, criterio mejor/último, escritura del Grade en
 * la evaluación de M08 (en su escala), recalificación idempotente, resultados
 * y alcance del profesor.
 */
assertSafeDatabase();

const RUN = newRunId();
let world: Awaited<ReturnType<typeof setupExamWorld>>;
let prof: APIRequestContext;
let profUserId: string;

const makeExam = async (overrides: Record<string, unknown> = {}, maxScore = 100) => {
  const assessment = await db.assessment.create({
    data: { groupId: world.group.id, name: `E2E Online ${Math.random().toString(36).slice(2, 6)}`, type: "PARTIAL", weight: 10, maxScore },
  });
  const exam = await (
    await prof.post("online-exams", {
      data: { groupId: world.group.id, title: "E2E Calificación", durationMin: 30, maxAttempts: 3, ...openWindow(), passingScore: 6,
        assessmentId: assessment.id, ...overrides },
    })
  ).json();
  const { om, vf, mr, ab } = world.questions;
  await prof.post(`online-exams/${exam.id}/questions`, { data: { questions: [om, vf, mr, ab].map((q) => ({ questionId: q.id })) } });
  const published = await prof.post(`online-exams/${exam.id}/publish`);
  expect(published.status(), await published.text()).toBe(200);
  return { examId: exam.id as string, assessmentId: assessment.id };
};

/** Presenta un intento con las respuestas dadas por clave (om, vf, mr, ab) y lo envía. */
const take = async (api: APIRequestContext, examId: string, answers: { om?: number; vf?: number; mr?: number[]; ab?: string }) => {
  const attempt = await (await api.post(`online-exams/${examId}/start`)).json();
  const byType = (type: string) => attempt.questions.find((q: { type: string }) => q.type === type);
  const list = [];
  if (answers.om !== undefined) list.push({ questionId: byType("MULTIPLE_CHOICE").questionId, answer: world.questions.om.options[answers.om].id });
  if (answers.vf !== undefined) list.push({ questionId: byType("TRUE_FALSE").questionId, answer: world.questions.vf.options[answers.vf].id });
  if (answers.mr) list.push({ questionId: byType("MULTIPLE_ANSWER").questionId, answer: answers.mr.map((i) => world.questions.mr.options[i].id) });
  if (answers.ab !== undefined) list.push({ questionId: byType("OPEN").questionId, answer: answers.ab });
  const res = await api.post(`attempts/${attempt.attemptId}/submit`, { data: list.length ? { answers: list } : {} });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
};

const gradeOf = (assessmentId: string, enrollmentId: string) =>
  db.grade.findUnique({ where: { assessmentId_enrollmentId: { assessmentId, enrollmentId } } });

test.beforeAll(async () => {
  world = await setupExamWorld(RUN, "g");
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

test("califica cerradas todo o nada y deja la abierta pendiente; sin Grade hasta revisar", async () => {
  const { examId, assessmentId } = await makeExam();
  const pupil = await makePupil(RUN, "g1", world.group.id);
  const { api } = await loginAs(pupil.username);
  // OM correcta (2), VF incorrecta (0), MR parcial = 0, abierta contestada → pendiente.
  const result = await take(api, examId, { om: 0, vf: 0, mr: [0], ab: "Revisar compresión de cada cilindro" });
  expect(result.status).toBe("SUBMITTED");
  expect(result.result).toEqual({ score: 2, totalPuntos: 10, pendingCount: 1, aprobado: null });
  const marks = Object.fromEntries(result.questions.map((q: { type: string; isCorrect: boolean | null; pointsEarned: number | null }) => [q.type, [q.isCorrect, q.pointsEarned]]));
  expect(marks).toEqual({
    MULTIPLE_CHOICE: [true, 2],
    TRUE_FALSE: [false, 0],
    MULTIPLE_ANSWER: [false, 0],
    OPEN: [null, null],
  });
  // Al terminar el alumno ya ve cuáles eran las correctas (mostrarResultado).
  expect(JSON.stringify(result.questions)).toContain("isCorrect");
  expect((await lastAudit("ATTEMPT_GRADED"))?.entityId).toBe(result.attemptId);
  expect(await gradeOf(assessmentId, pupil.enrollmentId)).toBeNull();

  // Revisión: puntos > máximo → 400; pregunta cerrada → 400; válida → Grade en la escala de la evaluación.
  const abId = world.questions.ab.id;
  expect((await (await prof.patch(`attempts/${result.attemptId}/review`, { data: { questionId: abId, pointsEarned: 5 } })).json()).code).toBe("SCORE_OUT_OF_RANGE");
  expect((await (await prof.patch(`attempts/${result.attemptId}/review`, { data: { questionId: world.questions.om.id, pointsEarned: 1 } })).json()).code).toBe("REVIEW_ONLY_OPEN");
  const reviewed = await prof.patch(`attempts/${result.attemptId}/review`, { data: { questionId: abId, pointsEarned: 3, comment: "Faltó la prueba de chispa" } });
  expect(reviewed.status(), await reviewed.text()).toBe(200);
  // 5 / 10 puntos → 50 en una evaluación de 100.
  expect(await reviewed.json()).toMatchObject({ score: 5, pendingCount: 0, grade: { assessmentId, enrollmentId: pupil.enrollmentId, score: 50 } });
  expect(Number((await gradeOf(assessmentId, pupil.enrollmentId))?.score)).toBe(50);
  const log = await lastAudit("ATTEMPT_REVIEWED", profUserId);
  expect(log?.previousState).toMatchObject({ isCorrect: null, pointsEarned: null });
  expect(log?.newState).toMatchObject({ isCorrect: true, pointsEarned: 3 });
  expect((await lastAudit("GRADE_CAPTURED", profUserId))?.metadata).toMatchObject({ source: "online-exam", examId });

  // El alumno ve su comentario y ya no hay pendientes.
  const mine = await (await api.get(`attempts/${result.attemptId}`)).json();
  expect(mine.result).toMatchObject({ score: 5, pendingCount: 0, aprobado: false });
  expect(mine.questions.find((q: { type: string }) => q.type === "OPEN").comment).toBe("Faltó la prueba de chispa");
  await api.dispose();
});

test("criterio BEST: el Grade toma el mejor intento; LAST: el más reciente", async () => {
  const best = await makeExam({ title: "E2E Mejor", attemptCriterion: "BEST" }, 10);
  const last = await makeExam({ title: "E2E Último", attemptCriterion: "LAST" }, 10);
  const pupil = await makePupil(RUN, "g2", world.group.id);
  const { api } = await loginAs(pupil.username);
  // Sin abierta contestada (vale 0, sin pendiente): 6 puntos y luego 2.
  await take(api, best.examId, { om: 0, vf: 1, mr: [0, 1] });
  await take(api, best.examId, { om: 0 });
  expect(Number((await gradeOf(best.assessmentId, pupil.enrollmentId))?.score)).toBe(6);

  await take(api, last.examId, { om: 0, vf: 1, mr: [0, 1] });
  expect(Number((await gradeOf(last.assessmentId, pupil.enrollmentId))?.score)).toBe(6);
  await take(api, last.examId, { om: 0 });
  expect(Number((await gradeOf(last.assessmentId, pupil.enrollmentId))?.score)).toBe(2);
  await api.dispose();
});

test("showResult = false: el alumno no ve puntaje ni claves; resultados para el profesor", async () => {
  const { examId } = await makeExam({ title: "E2E Oculto", showResult: false, maxAttempts: 1 });
  const pupil = await makePupil(RUN, "g3", world.group.id);
  const { api } = await loginAs(pupil.username);
  const result = await take(api, examId, { om: 0, vf: 1, mr: [0, 1], ab: "" });
  expect(result.result).toBeNull();
  expect(JSON.stringify(result.questions)).not.toContain("isCorrect");
  const available = await (await api.get("online-exams/available")).json();
  expect(available.find((e: { examId: string }) => e.examId === examId).lastAttempt).toMatchObject({ score: null, status: "SUBMITTED" });
  await api.dispose();

  const res = await (await prof.get(`online-exams/${examId}/results`)).json();
  const row = res.rows.find((r: { studentId: string }) => r.studentId === pupil.studentId);
  expect(row).toMatchObject({ intentos: 1, calificacion: 6, aprobado: true, pendientes: 0 });
  expect(res.kpis).toMatchObject({ presentaron: 1, aprobados: 1, totalPuntos: 10 });
  const staffView = await (await prof.get(`attempts/${row.attempts[0].attemptId}`)).json();
  expect(staffView.result).toMatchObject({ score: 6, aprobado: true });
});

test("recalificar tras corregir la code reescribe el Grade; repetirlo no cambia nada", async () => {
  const { examId, assessmentId } = await makeExam({ title: "E2E Regrade" }, 10);
  const pupil = await makePupil(RUN, "g4", world.group.id);
  const { api } = await loginAs(pupil.username);
  const result = await take(api, examId, { om: 1, vf: 1, mr: [0, 1] }); // OM incorrecta: 4/10
  await api.dispose();
  expect(Number((await gradeOf(assessmentId, pupil.enrollmentId))?.score)).toBe(4);

  // La clave de la OM estaba mal: la opción 2 también es la buena (se corrige en BD, el reactivo está bloqueado).
  await db.questionOption.update({ where: { id: world.questions.om.options[0].id }, data: { isCorrect: false } });
  await db.questionOption.update({ where: { id: world.questions.om.options[1].id }, data: { isCorrect: true } });
  const regraded = await prof.post(`attempts/${result.attemptId}/regrade`);
  expect(await regraded.json()).toMatchObject({ score: 6, grade: { score: 6 } });
  expect((await lastAudit("ATTEMPT_REGRADED", profUserId))?.entityId).toBe(result.attemptId);
  const logs = await db.auditLog.count({ where: { action: "ATTEMPT_REGRADED", entityId: result.attemptId } });
  await prof.post(`attempts/${result.attemptId}/regrade`);
  expect(await db.auditLog.count({ where: { action: "ATTEMPT_REGRADED", entityId: result.attemptId } })).toBe(logs);
  await db.questionOption.update({ where: { id: world.questions.om.options[1].id }, data: { isCorrect: false } });
  await db.questionOption.update({ where: { id: world.questions.om.options[0].id }, data: { isCorrect: true } });

  // El reactivo ya respondido quedó bloqueado para edición.
  const locked = await prof.patch(`questions/${world.questions.om.id}`, { data: { text: "Otro text" } });
  expect((await locked.json()).code).toBe("QUESTION_IN_USE");
});

test("alcance: otro profesor no revisa (403); no se revisa un intento en curso (409)", async () => {
  const { examId } = await makeExam({ title: "E2E Alcance" });
  const pupil = await makePupil(RUN, "g5", world.group.id);
  const { api } = await loginAs(pupil.username);
  const open = await (await api.post(`online-exams/${examId}/start`)).json();
  await api.dispose();
  const inProgress = await prof.patch(`attempts/${open.attemptId}/review`, { data: { questionId: world.questions.ab.id, pointsEarned: 1 } });
  expect(inProgress.status()).toBe(409);
  expect((await inProgress.json()).code).toBe("ATTEMPT_OPEN");

  const other = await makeTeacher(RUN, "gother");
  const { api: stranger } = await loginAs(other.username);
  expect((await stranger.patch(`attempts/${open.attemptId}/review`, { data: { questionId: world.questions.ab.id, pointsEarned: 1 } })).status()).toBe(403);
  expect((await stranger.get(`online-exams/${examId}/results`)).status()).toBe(404);
  await stranger.dispose();
});
