import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import {
  clearAcademicE2E,
  clearAuthE2E,
  clearStudentsE2E,
  clearTeachersE2E,
  createAuthUser,
  db,
  lastAudit,
} from "./support/db";
import { loginAs } from "./support/http";
import { makeCourse, makeStudent, makeTeacher, makeTerm, slot } from "./support/academic";

/**
 * Contrato de M08: instrumentos con ponderación, captura en lote con rango y
 * bitácora de valor anterior/nuevo, libro con proyección, cierre del grupo
 * (final + estatus + kardex), exportación y alcance del profesor/alumno.
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}gadmin_${RUN}`, name: "E2E Admin Calificaciones", roleKey: "ADMIN" };
const CONTROL = { username: `${E2E_PREFIX}gcontrol_${RUN}`, name: "E2E Control Calif", roleKey: "CONTROL_ESCOLAR" };
const PUPIL = { username: `${E2E_PREFIX}gpupil_${RUN}`, name: "E2E Alumno Calif", roleKey: "ALUMNO" };

let control: APIRequestContext;
let prof: APIRequestContext;
let pupilUserId: string;
let profUserId: string;
let termId: string;
let courseId: string;
let teacher: Awaited<ReturnType<typeof makeTeacher>>;
let otherTeacher: Awaited<ReturnType<typeof makeTeacher>>;
let originalThreshold: unknown;
let seq = 0;

/** Grupo del profesor con `n` alumnos inscritos. */
const groupWith = async (labels: string[], teacherId = teacher.teacher.id, userIds: (string | undefined)[] = []) => {
  const res = await control.post("groups", {
    data: { courseId, termId, teacherId, nombre: `C${(seq += 1)}`, cupo: 30, horario: [slot("SABADO", `0${seq % 9}:00`, `0${seq % 9}:30`)] },
  });
  expect(res.status(), await res.text()).toBe(201);
  const group = await res.json();
  const enrollments: Array<{ id: string; studentId: string }> = [];
  for (const [i, label] of labels.entries()) {
    const student = await makeStudent(RUN, label, userIds[i]);
    const e = await control.post(`groups/${group.id}/enroll`, { data: { studentId: student.id } });
    expect(e.status(), await e.text()).toBe(201);
    enrollments.push(await e.json());
  }
  return { group, enrollments };
};

const assessment = async (api: APIRequestContext, groupId: string, data: Record<string, unknown>) => {
  const res = await api.post("assessments", { data: { groupId, tipo: "PARCIAL", ...data } });
  return res;
};

const capture = (api: APIRequestContext, assessmentId: string, grades: unknown[]) =>
  api.post(`assessments/${assessmentId}/grades`, { data: { grades } });

test.beforeAll(async () => {
  await createAuthUser({ ...ADMIN, password: E2E.password });
  await createAuthUser({ ...CONTROL, password: E2E.password });
  pupilUserId = (await createAuthUser({ ...PUPIL, password: E2E.password })).id;
  control = (await loginAs(CONTROL.username)).api;
  termId = (await makeTerm(RUN, "Calif")).id;
  courseId = (await makeCourse(RUN, "Historia")).id;
  teacher = await makeTeacher(RUN, "gprof");
  otherTeacher = await makeTeacher(RUN, "gprof2");
  profUserId = teacher.userId;
  prof = (await loginAs(teacher.username)).api;
  const setting = await db.setting.findUnique({ where: { key: "MIN_PASSING_GRADE" } });
  originalThreshold = setting?.value ?? null;
  await db.setting.upsert({
    where: { key: "MIN_PASSING_GRADE" },
    create: { key: "MIN_PASSING_GRADE", value: 70 },
    update: { value: 70 },
  });
});

test.afterAll(async () => {
  await prof?.dispose();
  await control?.dispose();
  if (originalThreshold !== null && originalThreshold !== undefined) {
    await db.setting.update({ where: { key: "MIN_PASSING_GRADE" }, data: { value: originalThreshold as number } });
  }
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: termId } });
  await clearAuthE2E();
});

test.describe("instrumentos", () => {
  test("el profesor crea instrumentos en su grupo; la suma no pasa de 100", async () => {
    const { group } = await groupWith([]);
    const p1 = await assessment(prof, group.id, { nombre: "Parcial 1", ponderacion: 60, fecha: "2026-09-15" });
    expect(p1.status(), await p1.text()).toBe(201);
    expect(await p1.json()).toMatchObject({ ponderacion: 60, maxScore: 100, active: true, capturadas: 0 });
    expect((await lastAudit("ASSESSMENT_CREATED", profUserId))?.entityId).toBe((await p1.json()).id);

    const over = await assessment(prof, group.id, { nombre: "Final", tipo: "FINAL", ponderacion: 40.01 });
    expect(over.status()).toBe(409);
    expect(await over.json()).toMatchObject({ code: "WEIGHTS_EXCEED_100" });
    expect((await assessment(prof, group.id, { nombre: "Final", tipo: "FINAL", ponderacion: 40 })).status()).toBe(201);
  });

  test("ponderación ≤ 0, > 2 decimales o tipo inválido → 400", async () => {
    const { group } = await groupWith([]);
    const res = await assessment(prof, group.id, { nombre: "", ponderacion: 0, tipo: "QUIZ", maxScore: 10.123 });
    expect(res.status()).toBe(400);
    expect(Object.keys((await res.json()).details.fieldErrors).sort()).toEqual(["maxScore", "nombre", "ponderacion", "tipo"]);
  });

  test("fuera de su ámbito → 403; CONTROL_ESCOLAR no administra instrumentos", async () => {
    const { group } = await groupWith([], otherTeacher.teacher.id);
    const res = await assessment(prof, group.id, { nombre: "Ajeno", ponderacion: 10 });
    expect(res.status()).toBe(403);
    expect((await assessment(control, group.id, { nombre: "Control", ponderacion: 10 })).status()).toBe(403);
  });

  test("editar ponderación respeta el 100 y desactivar libera el porcentaje", async () => {
    const { group } = await groupWith([]);
    const a = await (await assessment(prof, group.id, { nombre: "A", ponderacion: 50 })).json();
    const b = await (await assessment(prof, group.id, { nombre: "B", ponderacion: 50 })).json();
    expect((await (await prof.patch(`assessments/${a.id}`, { data: { ponderacion: 60 } })).json()).code).toBe("WEIGHTS_EXCEED_100");
    const off = await prof.delete(`assessments/${b.id}`);
    expect((await off.json()).active).toBe(false);
    const edited = await prof.patch(`assessments/${a.id}`, { data: { ponderacion: 100, nombre: "Único" } });
    expect(await edited.json()).toMatchObject({ ponderacion: 100, nombre: "Único" });
    const log = await lastAudit("ASSESSMENT_UPDATED", profUserId);
    expect(log?.previousState).toMatchObject({ ponderacion: 50 });
    expect(log?.newState).toMatchObject({ ponderacion: 100 });
  });
});

test.describe("captura", () => {
  test("captura en lote, recaptura con valor anterior/nuevo y vaciado en bitácora", async () => {
    const { group, enrollments } = await groupWith(["Cap1", "Cap2"]);
    const exam = await (await assessment(prof, group.id, { nombre: "P1", ponderacion: 100, maxScore: 10 })).json();
    const res = await capture(prof, exam.id, [
      { enrollmentId: enrollments[0].id, score: 8.5, observaciones: "Buen desempeño" },
      { enrollmentId: enrollments[1].id, score: 6 },
    ]);
    expect(res.status(), await res.text()).toBe(200);
    const saved = await res.json();
    expect(saved).toHaveLength(2);
    expect(saved.find((g: { enrollmentId: string }) => g.enrollmentId === enrollments[0].id)).toMatchObject({
      score: 8.5,
      observaciones: "Buen desempeño",
      capturedBy: profUserId,
    });
    expect((await lastAudit("GRADE_CAPTURED", profUserId))?.newState).toBeTruthy();

    await capture(prof, exam.id, [{ enrollmentId: enrollments[1].id, score: 7.25 }]);
    const updated = await lastAudit("GRADE_UPDATED", profUserId);
    expect(updated?.previousState).toMatchObject({ score: 6 });
    expect(updated?.newState).toMatchObject({ score: 7.25 });

    await capture(prof, exam.id, [{ enrollmentId: enrollments[1].id, score: null }]);
    const cleared = await lastAudit("GRADE_CLEARED", profUserId);
    expect(cleared?.previousState).toMatchObject({ score: 7.25 });
    expect(cleared?.newState).toMatchObject({ score: null });
    expect(await db.grade.count({ where: { assessmentId: exam.id } })).toBe(2);
  });

  test("fuera de rango → 400 SCORE_OUT_OF_RANGE; nada se guarda", async () => {
    const { group, enrollments } = await groupWith(["Rango"]);
    const exam = await (await assessment(prof, group.id, { nombre: "P1", ponderacion: 100, maxScore: 10 })).json();
    const res = await capture(prof, exam.id, [{ enrollmentId: enrollments[0].id, score: 10.5 }]);
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ code: "SCORE_OUT_OF_RANGE" });
    expect(await db.grade.count({ where: { assessmentId: exam.id } })).toBe(0);
    const negative = await capture(prof, exam.id, [{ enrollmentId: enrollments[0].id, score: -1 }]);
    expect(negative.status()).toBe(400);
  });

  test("inscripción de otro grupo → 400; dada de baja → 409 NOT_ENROLLED; duplicada en el lote → 400", async () => {
    const { group, enrollments } = await groupWith(["Otro1", "Otro2"]);
    const { enrollments: foreign } = await groupWith(["Ajeno"]);
    const exam = await (await assessment(prof, group.id, { nombre: "P1", ponderacion: 100 })).json();
    const wrong = await capture(prof, exam.id, [{ enrollmentId: foreign[0].id, score: 90 }]);
    expect((await wrong.json()).code).toBe("ENROLLMENT_NOT_IN_GROUP");

    await control.delete(`enrollments/${enrollments[1].id}`);
    const dropped = await capture(prof, exam.id, [{ enrollmentId: enrollments[1].id, score: 90 }]);
    expect(dropped.status()).toBe(409);
    expect((await dropped.json()).code).toBe("NOT_ENROLLED");

    const dup = await capture(prof, exam.id, [
      { enrollmentId: enrollments[0].id, score: 90 },
      { enrollmentId: enrollments[0].id, score: 80 },
    ]);
    expect(dup.status()).toBe(400);
  });

  test("el profesor no captura en grupos ajenos → 403", async () => {
    const { group, enrollments } = await groupWith(["Ajeno2"], otherTeacher.teacher.id);
    const { api } = await loginAs(otherTeacher.username);
    const exam = await (await assessment(api, group.id, { nombre: "P1", ponderacion: 100 })).json();
    await api.dispose();
    const res = await capture(prof, exam.id, [{ enrollmentId: enrollments[0].id, score: 90 }]);
    expect(res.status()).toBe(403);
    expect((await prof.get(`groups/${group.id}/gradebook`)).status()).toBe(404);
  });
});

test.describe("libro, cierre y kardex", () => {
  test("proyección ponderada, cierre con umbral, kardex y grupo bloqueado", async () => {
    const { group, enrollments } = await groupWith(["Aprueba", "Reprueba", "Portal"], undefined, [
      undefined,
      undefined,
      pupilUserId,
    ]);
    const p1 = await (await assessment(prof, group.id, { nombre: "Parcial", ponderacion: 30, maxScore: 10 })).json();
    const fin = await (await assessment(prof, group.id, { nombre: "Final", tipo: "FINAL", ponderacion: 60 })).json();

    // Ponderaciones al 90 %: no hay final todavía y no se puede cerrar.
    const notReady = await prof.post(`groups/${group.id}/close`);
    expect(notReady.status()).toBe(409);
    expect(await notReady.json()).toMatchObject({ code: "WEIGHTS_NOT_100" });
    const tarea = await (await assessment(prof, group.id, { nombre: "Tareas", tipo: "TAREA", ponderacion: 10 })).json();

    await capture(prof, p1.id, [
      { enrollmentId: enrollments[0].id, score: 9 },
      { enrollmentId: enrollments[1].id, score: 5 },
      { enrollmentId: enrollments[2].id, score: 7 },
    ]);
    await capture(prof, fin.id, [
      { enrollmentId: enrollments[0].id, score: 85 },
      { enrollmentId: enrollments[1].id, score: 70 },
      { enrollmentId: enrollments[2].id, score: 69.99 },
    ]);
    const incomplete = await prof.post(`groups/${group.id}/close`);
    expect(await incomplete.json()).toMatchObject({ code: "GRADES_INCOMPLETE" });

    await capture(prof, tarea.id, [
      { enrollmentId: enrollments[0].id, score: 100 },
      { enrollmentId: enrollments[1].id, score: 50 },
      { enrollmentId: enrollments[2].id, score: 100 },
    ]);
    const book = await (await prof.get(`groups/${group.id}/gradebook`)).json();
    expect(book).toMatchObject({ weightsTotal: 100, approvalThreshold: 70, complete: true });
    const row = (id: string) => book.students.find((s: { enrollmentId: string }) => s.enrollmentId === id);
    // 9/10·30 + 85·0.6 + 100·0.1 = 27 + 51 + 10 = 88
    expect(row(enrollments[0].id)).toMatchObject({ final: 88, result: "ACREDITADO", missing: 0 });
    // 5/10·30 + 70·0.6 + 50·0.1 = 15 + 42 + 5 = 62
    expect(row(enrollments[1].id)).toMatchObject({ final: 62, result: "REPROBADO" });
    // 21 + 41.994 + 10 = 72.994 → 72.99
    expect(row(enrollments[2].id)).toMatchObject({ final: 72.99, result: "ACREDITADO" });

    // El alumno solo ve su renglón.
    const { api: pupil } = await loginAs(PUPIL.username);
    const mine = await (await pupil.get(`groups/${group.id}/gradebook`)).json();
    expect(mine.students.map((s: { enrollmentId: string }) => s.enrollmentId)).toEqual([enrollments[2].id]);
    const myGrades = await (await pupil.post("grades/query", { data: { page: 1, limit: 50, filters: { groupId: group.id } } })).json();
    expect(myGrades.total).toBe(3);
    expect(new Set(myGrades.data.map((g: { enrollmentId: string }) => g.enrollmentId))).toEqual(new Set([enrollments[2].id]));
    expect((await capture(pupil, p1.id, [{ enrollmentId: enrollments[2].id, score: 10 }])).status()).toBe(403);

    const closed = await prof.post(`groups/${group.id}/close`);
    expect(closed.status(), await closed.text()).toBe(200);
    const after = await closed.json();
    expect(after.group.closedAt).toBeTruthy();
    const statuses = await db.enrollment.findMany({ where: { groupId: group.id }, orderBy: { createdAt: "asc" } });
    expect(statuses.map((e) => [e.status, Number(e.finalGrade)])).toEqual([
      ["ACREDITADO", 88],
      ["REPROBADO", 62],
      ["ACREDITADO", 72.99],
    ]);
    const log = await lastAudit("GROUP_CLOSED", profUserId);
    expect(log?.metadata).toMatchObject({ alumnos: 3, acreditados: 2, reprobados: 1, umbral: 70 });

    // Kardex (M06) del alumno: renglón con la final y el estatus.
    const kardex = await (await pupil.get(`students/${enrollments[2].studentId}/kardex`)).json();
    const entry = kardex.entries.find((e: { grupo: string }) => e.grupo === group.nombre);
    expect(entry).toMatchObject({ calificacionFinal: 72.99, estatus: "ACREDITADO", ponderaciones: [30, 60, 10] });
    expect(entry.calificaciones).toEqual([70, 69.99, 100]);
    await pupil.dispose();

    // Cerrado: ni captura, ni instrumentos, ni inscripciones, ni segundo cierre.
    expect((await (await capture(prof, p1.id, [{ enrollmentId: enrollments[1].id, score: 10 }])).json()).code).toBe("GROUP_CLOSED");
    expect((await (await assessment(prof, group.id, { nombre: "Extra", ponderacion: 1 })).json()).code).toBe("GROUP_CLOSED");
    const late = await makeStudent(RUN, "Tarde");
    expect((await (await control.post(`groups/${group.id}/enroll`, { data: { studentId: late.id } })).json()).code).toBe("GROUP_CLOSED");
    expect((await (await prof.post(`groups/${group.id}/close`)).json()).code).toBe("GROUP_CLOSED");
  });

  test("sin instrumentos no se cierra; exportación .xlsx del libro", async () => {
    const { group, enrollments } = await groupWith(["Export"]);
    expect((await (await prof.post(`groups/${group.id}/close`)).json()).code).toBe("ASSESSMENTS_REQUIRED");
    const exam = await (await assessment(prof, group.id, { nombre: "Único", ponderacion: 100 })).json();
    await capture(prof, exam.id, [{ enrollmentId: enrollments[0].id, score: 95 }]);
    const res = await prof.get(`grades/export?groupId=${group.id}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");
    expect(res.headers()["content-disposition"]).toContain("calificaciones-");
    expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
    expect((await lastAudit("GRADES_EXPORTED", profUserId))?.entityId).toBe(group.id);
    expect((await prof.get("grades/export")).status()).toBe(400);
  });
});
