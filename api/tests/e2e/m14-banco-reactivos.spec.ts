import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import { clearAcademicE2E, clearAuthE2E, clearStudentsE2E, clearTeachersE2E, createAuthUser, db, lastAudit } from "./support/db";
import { loginAs } from "./support/http";
import { makeCourse, makeTeacher, makeTerm } from "./support/academic";

/**
 * Contrato de M14: reactivos de los cuatro tipos con sus reglas de opciones,
 * alcance por curso del profesor, edición con bitácora, desactivación e
 * importación CSV con vista previa e idempotencia.
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}qadmin_${RUN}`, name: "E2E Admin Reactivos", roleKey: "ADMIN" };
const CONTROL = { username: `${E2E_PREFIX}qcontrol_${RUN}`, name: "E2E Control Reactivos", roleKey: "SCHOOL_CONTROL" };

let admin: APIRequestContext;
let prof: APIRequestContext;
let profUserId: string;
let courseId: string;
let courseClave: string;
let foreignCourseId: string;
let termId: string;

const question = (overrides: Record<string, unknown> = {}) => ({
  courseId,
  topic: "Motores",
  type: "MULTIPLE_CHOICE",
  text: "¿Cuántos tiempos tiene un motor Otto?",
  points: 2,
  difficulty: "MEDIUM",
  options: [{ text: "4", isCorrect: true }, { text: "2", isCorrect: false }],
  ...overrides,
});

const csvFile = (content: string) => ({ file: { name: "reactivos.csv", mimeType: "text/csv", buffer: Buffer.from(content, "utf-8") } });

test.beforeAll(async () => {
  await createAuthUser({ ...ADMIN, password: E2E.password });
  await createAuthUser({ ...CONTROL, password: E2E.password });
  admin = (await loginAs(ADMIN.username)).api;
  termId = (await makeTerm(RUN, "Reactivos")).id;
  const course = await makeCourse(RUN, "Reactivos");
  courseId = course.id;
  courseClave = course.code;
  foreignCourseId = (await makeCourse(RUN, "Ajeno")).id;
  const teacher = await makeTeacher(RUN, "qprof");
  profUserId = teacher.userId;
  await db.group.create({
    data: { courseId, termId, teacherId: teacher.teacher.id, name: "Q1", capacity: 10, schedule: [{ dia: "LUNES", horaInicio: "07:00", horaFin: "08:00" }] },
  });
  prof = (await loginAs(teacher.username)).api;
});

test.afterAll(async () => {
  await admin?.dispose();
  await prof?.dispose();
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: termId } });
  await clearAuthE2E();
});

test.describe("reglas de opciones", () => {
  test("los cuatro tipos válidos; OPEN sin opciones; bitácora", async () => {
    const om = await prof.post("questions", { data: question() });
    expect(om.status(), await om.text()).toBe(201);
    expect(await om.json()).toMatchObject({ type: "MULTIPLE_CHOICE", status: "ACTIVE", points: 2, locked: false, courseClave });
    expect((await lastAudit("QUESTION_CREATED", profUserId))?.entityId).toBe((await om.json()).id);
    const vf = await prof.post("questions", {
      data: question({ type: "TRUE_FALSE", options: [{ text: "Verdadero", isCorrect: true }, { text: "Falso", isCorrect: false }] }),
    });
    expect(vf.status()).toBe(201);
    const mr = await prof.post("questions", {
      data: question({ type: "MULTIPLE_ANSWER", options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: true }, { text: "c", isCorrect: false }] }),
    });
    expect(mr.status()).toBe(201);
    const ab = await prof.post("questions", { data: question({ type: "OPEN", options: [] }) });
    expect(ab.status()).toBe(201);
    expect((await ab.json()).options).toEqual([]);
  });

  test("violaciones → 400 con el código de la regla", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: true }] }, "QUESTION_MULTIPLE_CORRECT"],
      [{ options: [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }] }, "QUESTION_OPTION_REQUIRED"],
      [{ type: "TRUE_FALSE", options: [{ text: "V", isCorrect: true }, { text: "F", isCorrect: false }, { text: "?", isCorrect: false }] }, "QUESTION_OPTION_COUNT_INVALID"],
      [{ type: "MULTIPLE_ANSWER", options: [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }] }, "QUESTION_OPTION_REQUIRED"],
      [{ type: "OPEN" }, "QUESTION_OPEN_NO_OPTIONS"],
    ];
    for (const [overrides, code] of cases) {
      const res = await prof.post("questions", { data: question(overrides) });
      expect(res.status(), code).toBe(400);
      expect((await res.json()).code).toBe(code);
    }
    const zero = await prof.post("questions", { data: question({ points: 0, text: "" }) });
    expect(Object.keys((await zero.json()).details.fieldErrors).sort()).toEqual(["text", "points"]);
  });
});

test.describe("alcance y edición", () => {
  test("el profesor solo crea y ve reactivos de los cursos de sus grupos; control solo lee", async () => {
    const foreign = await prof.post("questions", { data: question({ courseId: foreignCourseId }) });
    expect(foreign.status()).toBe(403);
    const adminQ = await (await admin.post("questions", { data: question({ courseId: foreignCourseId, text: "Reactivo de otro curso" }) })).json();
    const list = await (await prof.post("questions/query", { data: { page: 1, limit: 100, filters: {} } })).json();
    const ids = list.data.map((q: { id: string }) => q.id);
    expect(ids).not.toContain(adminQ.id);
    expect(list.data.every((q: { courseId: string }) => q.courseId === courseId)).toBe(true);
    expect((await prof.get(`questions/${adminQ.id}`)).status()).toBe(404);

    const { api } = await loginAs(CONTROL.username);
    expect((await api.post("questions/query", { data: { page: 1, limit: 5, filters: { courseId: foreignCourseId } } })).status()).toBe(200);
    expect((await api.post("questions", { data: question() })).status()).toBe(403);
    await api.dispose();
  });

  test("editar cambia opciones y audita antes/después; desactivar y reactivar", async () => {
    const created = await (await prof.post("questions", { data: question({ text: "Para editar" }) })).json();
    const res = await prof.patch(`questions/${created.id}`, {
      data: { type: "MULTIPLE_ANSWER", options: [{ text: "x", isCorrect: true }, { text: "y", isCorrect: true }], points: 3 },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.json()).toMatchObject({ type: "MULTIPLE_ANSWER", points: 3 });
    const log = await lastAudit("QUESTION_UPDATED", profUserId);
    expect(log?.previousState).toMatchObject({ type: "MULTIPLE_CHOICE", points: 2 });
    expect(log?.newState).toMatchObject({ type: "MULTIPLE_ANSWER", points: 3 });
    // Cambiar a ABIERTA sin mandar opciones las quita.
    expect((await (await prof.patch(`questions/${created.id}`, { data: { type: "OPEN" } })).json()).options).toEqual([]);

    const off = await prof.delete(`questions/${created.id}`);
    expect((await off.json()).status).toBe("INACTIVE");
    expect((await (await prof.delete(`questions/${created.id}`)).json()).code).toBe("QUESTION_ALREADY_INACTIVE");
    expect((await (await prof.post(`questions/${created.id}/reactivate`)).json()).status).toBe("ACTIVE");
    const filtered = await (await prof.post("questions/query", { data: { page: 1, limit: 50, filters: { type: "OPEN", status: "ACTIVE" } } })).json();
    expect(filtered.data.map((q: { id: string }) => q.id)).toContain(created.id);
  });
});

test.describe("importación CSV", () => {
  const csv = () =>
    [
      "curso,topic,type,text,points,difficulty,opciones,correctas",
      `${courseClave},Frenos,opcion multiple,"¿Qué líquido usan los frenos? (DOT)",2,media,Agua|DOT 4|Aceite,2`,
      `${courseClave},Frenos,verdadero_falso,"El ABS evita el bloqueo de ruedas",1,facil,,1`,
      `${courseClave},Encendido,MULTIPLE_ANSWER,"Componentes del encendido",3,dificil,Bobina|Bujía|Radiador,1|2`,
      `${courseClave},Diagnóstico,OPEN,"Describe el diagnóstico de una falla P0300",4,,,`,
      `${courseClave},Mal,MULTIPLE_CHOICE,"Dos correctas",1,,a|b,1|2`,
      `NOEXISTE-${RUN},X,OPEN,"Curso inexistente",1,,,`,
      `${courseClave},X,DIBUJO,"Tipo inválido",1,,,`,
    ].join("\n");

  test("vista previa no guarda; aplicar exige Idempotency-Key y repetirla no duplica", async () => {
    const before = await db.question.count({ where: { courseId } });
    const preview = await prof.post("questions/import?preview=true", { multipart: csvFile(csv()) });
    expect(preview.status(), await preview.text()).toBe(200);
    const result = await preview.json();
    expect(result).toMatchObject({ preview: true, total: 7, valid: 4, created: 0 });
    expect(result.rejected.map((r: { row: number; code: string }) => [r.row, r.code])).toEqual([
      [6, "QUESTION_MULTIPLE_CORRECT"],
      [7, "COURSE_NOT_FOUND"],
      [8, "VALIDATION_ERROR"],
    ]);
    expect(await db.question.count({ where: { courseId } })).toBe(before);

    const noKey = await prof.post("questions/import", { multipart: csvFile(csv()) });
    expect((await noKey.json()).code).toBe("INVALID_IDEMPOTENCY_KEY");

    const key = `e2e-import-${RUN}`;
    const applied = await prof.post("questions/import", { multipart: csvFile(csv()), headers: { "Idempotency-Key": key } });
    expect(applied.status()).toBe(201);
    expect(await applied.json()).toMatchObject({ preview: false, created: 4 });
    expect(await db.question.count({ where: { courseId } })).toBe(before + 4);
    const vf = await db.question.findFirst({ where: { courseId, text: { contains: "ABS" } }, include: { options: { orderBy: { sortOrder: "asc" } } } });
    expect(vf?.options.map((o) => [o.text, o.isCorrect])).toEqual([["Verdadero", true], ["Falso", false]]);
    expect((await lastAudit("QUESTIONS_IMPORTED", profUserId))?.metadata).toMatchObject({ created: 4, rejected: 3 });

    const again = await prof.post("questions/import", { multipart: csvFile(csv()), headers: { "Idempotency-Key": key } });
    expect((await again.json()).created).toBe(4);
    expect(await db.question.count({ where: { courseId } })).toBe(before + 4);
  });

  test("cabecera incompleta → 400 CSV_INVALID; sin file → 400", async () => {
    const bad = await prof.post("questions/import?preview=true", { multipart: csvFile("curso,type\nX,OPEN") });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).code).toBe("CSV_INVALID");
    const none = await prof.post("questions/import?preview=true", { data: {} });
    expect(none.status()).toBe(400);
  });
});
