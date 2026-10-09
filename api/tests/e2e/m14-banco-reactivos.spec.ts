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
  tema: "Motores",
  tipo: "OPCION_MULTIPLE",
  enunciado: "¿Cuántos tiempos tiene un motor Otto?",
  puntos: 2,
  dificultad: "MEDIA",
  options: [{ texto: "4", esCorrecta: true }, { texto: "2", esCorrecta: false }],
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
  courseClave = course.clave;
  foreignCourseId = (await makeCourse(RUN, "Ajeno")).id;
  const teacher = await makeTeacher(RUN, "qprof");
  profUserId = teacher.userId;
  await db.group.create({
    data: { courseId, termId, teacherId: teacher.teacher.id, nombre: "Q1", cupo: 10, horario: [{ dia: "LUNES", horaInicio: "07:00", horaFin: "08:00" }] },
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
  test("los cuatro tipos válidos; ABIERTA sin opciones; bitácora", async () => {
    const om = await prof.post("questions", { data: question() });
    expect(om.status(), await om.text()).toBe(201);
    expect(await om.json()).toMatchObject({ tipo: "OPCION_MULTIPLE", status: "ACTIVA", puntos: 2, locked: false, courseClave });
    expect((await lastAudit("QUESTION_CREATED", profUserId))?.entityId).toBe((await om.json()).id);
    const vf = await prof.post("questions", {
      data: question({ tipo: "VERDADERO_FALSO", options: [{ texto: "Verdadero", esCorrecta: true }, { texto: "Falso", esCorrecta: false }] }),
    });
    expect(vf.status()).toBe(201);
    const mr = await prof.post("questions", {
      data: question({ tipo: "MULTIPLE_RESPUESTA", options: [{ texto: "a", esCorrecta: true }, { texto: "b", esCorrecta: true }, { texto: "c", esCorrecta: false }] }),
    });
    expect(mr.status()).toBe(201);
    const ab = await prof.post("questions", { data: question({ tipo: "ABIERTA", options: [] }) });
    expect(ab.status()).toBe(201);
    expect((await ab.json()).options).toEqual([]);
  });

  test("violaciones → 400 con el código de la regla", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ options: [{ texto: "a", esCorrecta: true }, { texto: "b", esCorrecta: true }] }, "QUESTION_MULTIPLE_CORRECT"],
      [{ options: [{ texto: "a", esCorrecta: false }, { texto: "b", esCorrecta: false }] }, "QUESTION_OPTION_REQUIRED"],
      [{ tipo: "VERDADERO_FALSO", options: [{ texto: "V", esCorrecta: true }, { texto: "F", esCorrecta: false }, { texto: "?", esCorrecta: false }] }, "QUESTION_OPTION_COUNT_INVALID"],
      [{ tipo: "MULTIPLE_RESPUESTA", options: [{ texto: "a", esCorrecta: false }, { texto: "b", esCorrecta: false }] }, "QUESTION_OPTION_REQUIRED"],
      [{ tipo: "ABIERTA" }, "QUESTION_OPEN_NO_OPTIONS"],
    ];
    for (const [overrides, code] of cases) {
      const res = await prof.post("questions", { data: question(overrides) });
      expect(res.status(), code).toBe(400);
      expect((await res.json()).code).toBe(code);
    }
    const zero = await prof.post("questions", { data: question({ puntos: 0, enunciado: "" }) });
    expect(Object.keys((await zero.json()).details.fieldErrors).sort()).toEqual(["enunciado", "puntos"]);
  });
});

test.describe("alcance y edición", () => {
  test("el profesor solo crea y ve reactivos de los cursos de sus grupos; control solo lee", async () => {
    const foreign = await prof.post("questions", { data: question({ courseId: foreignCourseId }) });
    expect(foreign.status()).toBe(403);
    const adminQ = await (await admin.post("questions", { data: question({ courseId: foreignCourseId, enunciado: "Reactivo de otro curso" }) })).json();
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
    const created = await (await prof.post("questions", { data: question({ enunciado: "Para editar" }) })).json();
    const res = await prof.patch(`questions/${created.id}`, {
      data: { tipo: "MULTIPLE_RESPUESTA", options: [{ texto: "x", esCorrecta: true }, { texto: "y", esCorrecta: true }], puntos: 3 },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.json()).toMatchObject({ tipo: "MULTIPLE_RESPUESTA", puntos: 3 });
    const log = await lastAudit("QUESTION_UPDATED", profUserId);
    expect(log?.previousState).toMatchObject({ tipo: "OPCION_MULTIPLE", puntos: 2 });
    expect(log?.newState).toMatchObject({ tipo: "MULTIPLE_RESPUESTA", puntos: 3 });
    // Cambiar a ABIERTA sin mandar opciones las quita.
    expect((await (await prof.patch(`questions/${created.id}`, { data: { tipo: "ABIERTA" } })).json()).options).toEqual([]);

    const off = await prof.delete(`questions/${created.id}`);
    expect((await off.json()).status).toBe("INACTIVA");
    expect((await (await prof.delete(`questions/${created.id}`)).json()).code).toBe("QUESTION_ALREADY_INACTIVE");
    expect((await (await prof.post(`questions/${created.id}/reactivate`)).json()).status).toBe("ACTIVA");
    const filtered = await (await prof.post("questions/query", { data: { page: 1, limit: 50, filters: { tipo: "ABIERTA", status: "ACTIVA" } } })).json();
    expect(filtered.data.map((q: { id: string }) => q.id)).toContain(created.id);
  });
});

test.describe("importación CSV", () => {
  const csv = () =>
    [
      "curso,tema,tipo,enunciado,puntos,dificultad,opciones,correctas",
      `${courseClave},Frenos,opcion multiple,"¿Qué líquido usan los frenos? (DOT)",2,media,Agua|DOT 4|Aceite,2`,
      `${courseClave},Frenos,verdadero_falso,"El ABS evita el bloqueo de ruedas",1,facil,,1`,
      `${courseClave},Encendido,MULTIPLE_RESPUESTA,"Componentes del encendido",3,dificil,Bobina|Bujía|Radiador,1|2`,
      `${courseClave},Diagnóstico,ABIERTA,"Describe el diagnóstico de una falla P0300",4,,,`,
      `${courseClave},Mal,OPCION_MULTIPLE,"Dos correctas",1,,a|b,1|2`,
      `NOEXISTE-${RUN},X,ABIERTA,"Curso inexistente",1,,,`,
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
    const vf = await db.question.findFirst({ where: { courseId, enunciado: { contains: "ABS" } }, include: { options: { orderBy: { orden: "asc" } } } });
    expect(vf?.options.map((o) => [o.texto, o.esCorrecta])).toEqual([["Verdadero", true], ["Falso", false]]);
    expect((await lastAudit("QUESTIONS_IMPORTED", profUserId))?.metadata).toMatchObject({ created: 4, rejected: 3 });

    const again = await prof.post("questions/import", { multipart: csvFile(csv()), headers: { "Idempotency-Key": key } });
    expect((await again.json()).created).toBe(4);
    expect(await db.question.count({ where: { courseId } })).toBe(before + 4);
  });

  test("cabecera incompleta → 400 CSV_INVALID; sin archivo → 400", async () => {
    const bad = await prof.post("questions/import?preview=true", { multipart: csvFile("curso,tipo\nX,ABIERTA") });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).code).toBe("CSV_INVALID");
    const none = await prof.post("questions/import?preview=true", { data: {} });
    expect(none.status()).toBe(400);
  });
});
