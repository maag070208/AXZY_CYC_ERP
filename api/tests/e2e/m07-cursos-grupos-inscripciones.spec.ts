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
 * Contrato de M07: cursos, grupos (cupo + horario) e inscripciones con sus
 * reglas (cupo, duplicado, empalme, alumno inactivo, concurrencia), baja
 * lógica, cambio de grupo atómico, alcance por profesor/alumno y la
 * cancelación de inscripciones al dar de baja al alumno (puerto de M05).
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}cadmin_${RUN}`, name: "E2E Admin Cursos", roleKey: "ADMIN" };
const CONTROL = { username: `${E2E_PREFIX}ccontrol_${RUN}`, name: "E2E Control Cursos", roleKey: "SCHOOL_CONTROL" };
const PUPIL = { username: `${E2E_PREFIX}cpupil_${RUN}`, name: "E2E Alumno Cursos", roleKey: "STUDENT" };

let admin: APIRequestContext;
let control: APIRequestContext;
let adminId: string;
let controlId: string;
let pupilUserId: string;
let termId: string;
let otherTermId: string;
let courseId: string;
let teacher: Awaited<ReturnType<typeof makeTeacher>>;
let otherTeacher: Awaited<ReturnType<typeof makeTeacher>>;

const MON_8 = [slot("MONDAY", "08:00", "10:00")];
let groupSeq = 0;

const groupInput = (overrides: Record<string, unknown> = {}) => ({
  courseId,
  termId,
  teacherId: teacher.teacher.id,
  name: `G${(groupSeq += 1)}`,
  capacity: 30,
  schedule: [slot("TUESDAY", "07:00", "08:00")],
  classroom: "A-1",
  ...overrides,
});

const newGroup = async (overrides: Record<string, unknown> = {}) => {
  const res = await control.post("groups", { data: groupInput(overrides) });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
};

const enroll = (groupId: string, studentId: string) => control.post(`groups/${groupId}/enroll`, { data: { studentId } });

test.beforeAll(async () => {
  adminId = (await createAuthUser({ ...ADMIN, password: E2E.password })).id;
  controlId = (await createAuthUser({ ...CONTROL, password: E2E.password })).id;
  pupilUserId = (await createAuthUser({ ...PUPIL, password: E2E.password })).id;
  admin = (await loginAs(ADMIN.username)).api;
  control = (await loginAs(CONTROL.username)).api;
  termId = (await makeTerm(RUN, "Ciclo")).id;
  otherTermId = (await makeTerm(RUN, "Otro", ["2027-01-10", "2027-06-30"])).id;
  courseId = (await makeCourse(RUN, "Matemáticas")).id;
  teacher = await makeTeacher(RUN, "cprof");
  otherTeacher = await makeTeacher(RUN, "cprof2");
});

test.afterAll(async () => {
  await admin?.dispose();
  await control?.dispose();
  await clearAcademicE2E();
  await clearStudentsE2E();
  await clearTeachersE2E();
  await db.term.deleteMany({ where: { id: { in: [termId, otherTermId].filter(Boolean) } } });
  await clearAuthE2E();
});

test.describe("courses", () => {
  test("alta con clave normalizada, duplicado 409 y bitácora", async () => {
    const code = `e2e-mat-${RUN}`;
    const res = await admin.post("courses", { data: { code, name: `E2E Álgebra ${RUN}`, description: "" } });
    expect(res.status()).toBe(201);
    const course = await res.json();
    expect(course).toMatchObject({ code: code.toUpperCase(), active: true, description: null, groupsCount: 0 });
    expect((await lastAudit("COURSE_CREATED", adminId))?.entityId).toBe(course.id);

    const dup = await admin.post("courses", { data: { code: code.toUpperCase(), name: "Otro" } });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).code).toBe("COURSE_CODE_TAKEN");

    const list = await admin.post("courses/query", { data: { page: 1, limit: 10, filters: { code: `MAT-${RUN}` } } });
    expect((await list.json()).data.map((c: { id: string }) => c.id)).toEqual([course.id]);
  });

  test("validación por campo y CONTROL_ESCOLAR sin courses.manage → 403", async () => {
    const bad = await admin.post("courses", { data: { code: "con espacios", name: "" } });
    expect(bad.status()).toBe(400);
    expect(Object.keys((await bad.json()).details.fieldErrors).sort()).toEqual(["code", "name"]);
    const denied = await control.post("courses", { data: { code: `E2E-X-${RUN}`, name: "x" } });
    expect(denied.status()).toBe(403);
  });

  test("curso inactivo no abre grupos; reactivarlo lo permite", async () => {
    const course = await makeCourse(RUN, "Inactivo");
    expect((await admin.delete(`courses/${course.id}`)).status()).toBe(200);
    const blocked = await control.post("groups", { data: groupInput({ courseId: course.id }) });
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).code).toBe("COURSE_INACTIVE");
    expect((await (await admin.delete(`courses/${course.id}`)).json()).code).toBe("COURSE_INACTIVE");
    expect((await admin.post(`courses/${course.id}/reactivate`)).status()).toBe(200);
    expect((await control.post("groups", { data: groupInput({ courseId: course.id }) })).status()).toBe(201);
  });
});

test.describe("grupos", () => {
  test("alta con horario ordenado, KPIs de cupo y bitácora", async () => {
    const group = await newGroup({
      capacity: 2,
      schedule: [slot("WEDNESDAY", "10:00", "11:00"), slot("MONDAY", "08:00", "09:00")],
    });
    expect(group).toMatchObject({ capacity: 2, enrolledCount: 0, available: 2, teacherId: teacher.teacher.id, active: true });
    expect(group.schedule.map((s: { day: string }) => s.day)).toEqual(["MONDAY", "WEDNESDAY"]);
    expect((await lastAudit("GROUP_CREATED", controlId))?.entityId).toBe(group.id);
  });

  test("horario inválido o empalmado consigo mismo → 400", async () => {
    const reversed = await control.post("groups", { data: groupInput({ schedule: [slot("MONDAY", "10:00", "09:00")] }) });
    expect(reversed.status()).toBe(400);
    const overlap = await control.post("groups", {
      data: groupInput({ schedule: [slot("MONDAY", "08:00", "10:00"), slot("MONDAY", "09:30", "11:00")] }),
    });
    expect(overlap.status()).toBe(400);
    const badTime = await control.post("groups", { data: groupInput({ schedule: [slot("MONDAY", "8:00", "25:00")] }) });
    expect(badTime.status()).toBe(400);
    const empty = await control.post("groups", { data: groupInput({ schedule: [], capacity: 0 }) });
    expect(Object.keys((await empty.json()).details.fieldErrors).sort()).toEqual(["capacity", "schedule"]);
  });

  test("nombre repetido en el mismo curso y ciclo → 409; profesor inactivo → 409", async () => {
    const group = await newGroup();
    const dup = await control.post("groups", { data: groupInput({ name: group.name.toLowerCase() }) });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).code).toBe("GROUP_NAME_TAKEN");
    // Otro ciclo: mismo nombre permitido.
    expect((await control.post("groups", { data: groupInput({ name: group.name, termId: otherTermId }) })).status()).toBe(201);

    await db.teacher.update({ where: { id: otherTeacher.teacher.id }, data: { status: "INACTIVE" } });
    const inactive = await control.post("groups", { data: groupInput({ teacherId: otherTeacher.teacher.id }) });
    expect((await inactive.json()).code).toBe("TEACHER_INACTIVE");
    await db.teacher.update({ where: { id: otherTeacher.teacher.id }, data: { status: "ACTIVE" } });
  });

  test("cupo menor que inscritos → 409; baja con inscritos → 409; sin inscritos se desactiva", async () => {
    const group = await newGroup({ capacity: 3 });
    const a = await makeStudent(RUN, "CupoA");
    const b = await makeStudent(RUN, "CupoB");
    expect((await enroll(group.id, a.id)).status()).toBe(201);
    expect((await enroll(group.id, b.id)).status()).toBe(201);
    const below = await control.patch(`groups/${group.id}`, { data: { capacity: 1 } });
    expect(below.status()).toBe(409);
    expect((await below.json()).code).toBe("CAPACITY_BELOW_ENROLLED");
    expect((await control.patch(`groups/${group.id}`, { data: { capacity: 2, classroom: "B-2" } })).status()).toBe(200);
    const busy = await control.delete(`groups/${group.id}`);
    expect((await busy.json()).code).toBe("GROUP_HAS_ENROLLMENTS");

    const empty = await newGroup();
    const off = await control.delete(`groups/${empty.id}`);
    expect(off.status()).toBe(200);
    expect((await off.json()).active).toBe(false);
    const closed = await (await control.get(`groups/${empty.id}`)).json();
    expect(closed.active).toBe(false);
  });
});

test.describe("inscripciones", () => {
  test("inscribe, audita y cuenta para el cupo; doble inscripción → 409 ALREADY_ENROLLED", async () => {
    const group = await newGroup({ capacity: 5 });
    const student = await makeStudent(RUN, "Alta");
    const res = await enroll(group.id, student.id);
    expect(res.status()).toBe(201);
    const enrollment = await res.json();
    expect(enrollment).toMatchObject({ studentId: student.id, groupId: group.id, status: "ENROLLED", finalGrade: null });
    expect((await lastAudit("ENROLLMENT_CREATED", controlId))?.entityId).toBe(enrollment.id);
    expect((await (await control.get(`groups/${group.id}`)).json()).enrolledCount).toBe(1);

    const again = await enroll(group.id, student.id);
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("ALREADY_ENROLLED");
  });

  test("grupo lleno → 409 GROUP_FULL", async () => {
    const group = await newGroup({ capacity: 1 });
    expect((await enroll(group.id, (await makeStudent(RUN, "Lleno1")).id)).status()).toBe(201);
    const full = await enroll(group.id, (await makeStudent(RUN, "Lleno2")).id);
    expect(full.status()).toBe(409);
    expect(await full.json()).toMatchObject({ code: "GROUP_FULL" });
  });

  test("empalme de horario en el mismo ciclo → 409 SCHEDULE_CONFLICT; otro ciclo no choca", async () => {
    const student = await makeStudent(RUN, "Empalme");
    const first = await newGroup({ schedule: MON_8 });
    expect((await enroll(first.id, student.id)).status()).toBe(201);

    const clash = await newGroup({ schedule: [slot("MONDAY", "09:00", "11:00")] });
    const res = await enroll(clash.id, student.id);
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("SCHEDULE_CONFLICT");
    expect(body.message).toContain(first.name);

    // Bloques contiguos no se empalman ([08:00, 10:00) y [10:00, 11:00)).
    const after = await newGroup({ schedule: [slot("MONDAY", "10:00", "11:00")] });
    expect((await enroll(after.id, student.id)).status()).toBe(201);
    const nextTerm = await newGroup({ termId: otherTermId, schedule: MON_8 });
    expect((await enroll(nextTerm.id, student.id)).status()).toBe(201);
  });

  test("alumno dado de baja → 409 STUDENT_INACTIVE", async () => {
    const student = await makeStudent(RUN, "Inactivo");
    await db.student.update({ where: { id: student.id }, data: { status: "WITHDRAWN" } });
    const res = await enroll((await newGroup()).id, student.id);
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe("STUDENT_INACTIVE");
  });

  test("concurrencia: dos inscripciones al último lugar → solo una pasa", async () => {
    const group = await newGroup({ capacity: 1 });
    const [a, b] = [await makeStudent(RUN, "Carrera1"), await makeStudent(RUN, "Carrera2")];
    const results = await Promise.all([enroll(group.id, a.id), enroll(group.id, b.id)]);
    const statuses = results.map((r) => r.status()).sort();
    expect(statuses).toEqual([201, 409]);
    const loser = results.find((r) => r.status() === 409)!;
    expect(["GROUP_FULL", "CONCURRENT_UPDATE"]).toContain((await loser.json()).code);
    expect(await db.enrollment.count({ where: { groupId: group.id, status: { not: "WITHDRAWN" } } })).toBe(1);
  });

  test("baja lógica de la inscripción; repetirla → 409; se puede volver a inscribir", async () => {
    const group = await newGroup();
    const student = await makeStudent(RUN, "BajaInsc");
    const enrollment = await (await enroll(group.id, student.id)).json();
    const res = await control.delete(`enrollments/${enrollment.id}`, { data: { reason: "Solicitud del alumno" } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "WITHDRAWN", withdrawalReason: "Solicitud del alumno" });
    expect((await lastAudit("ENROLLMENT_DELETED", controlId))?.entityId).toBe(enrollment.id);
    expect((await (await control.delete(`enrollments/${enrollment.id}`)).json()).code).toBe("ENROLLMENT_NOT_ACTIVE");
    expect((await enroll(group.id, student.id)).status()).toBe(201);
  });

  test("cambio de grupo atómico: origen en BAJA apuntando al destino; otro curso → 400", async () => {
    const from = await newGroup({ schedule: [slot("THURSDAY", "08:00", "09:00")] });
    const to = await newGroup({ schedule: [slot("THURSDAY", "08:30", "09:30")] });
    const student = await makeStudent(RUN, "Cambio");
    const enrollment = await (await enroll(from.id, student.id)).json();

    // El empalme con el propio grupo origen no cuenta: se va a liberar.
    const res = await control.post(`enrollments/${enrollment.id}/change-group`, { data: { toGroupId: to.id } });
    expect(res.status(), await res.text()).toBe(200);
    const moved = await res.json();
    expect(moved).toMatchObject({ groupId: to.id, status: "ENROLLED" });
    const origin = await db.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(origin).toMatchObject({ status: "WITHDRAWN", transferredToId: moved.id, withdrawalReason: "Cambio de grupo" });
    const log = await lastAudit("ENROLLMENT_GROUP_CHANGED", controlId);
    expect(log?.previousState).toMatchObject({ groupId: from.id });
    expect(log?.newState).toMatchObject({ groupId: to.id });

    const otherCourse = await newGroup({ courseId: (await makeCourse(RUN, "Física")).id });
    const invalid = await control.post(`enrollments/${moved.id}/change-group`, { data: { toGroupId: otherCourse.id } });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).code).toBe("GROUP_CHANGE_INVALID");
  });

  test("la baja del alumno (M05) cancela sus inscripciones vigentes", async () => {
    const student = await makeStudent(RUN, "BajaAlumno");
    const g1 = await newGroup({ schedule: [slot("FRIDAY", "08:00", "09:00")] });
    const g2 = await newGroup({ schedule: [slot("FRIDAY", "09:00", "10:00")] });
    await enroll(g1.id, student.id);
    await enroll(g2.id, student.id);
    const res = await control.post(`students/${student.id}/withdrawal`, { data: { reason: "Cambio de escuela" } });
    expect(res.status(), await res.text()).toBe(200);
    const rows = await db.enrollment.findMany({ where: { studentId: student.id } });
    expect(rows.map((r) => r.status)).toEqual(["WITHDRAWN", "WITHDRAWN"]);
    expect((await (await control.get(`groups/${g1.id}`)).json()).enrolledCount).toBe(0);
  });
});

test.describe("alcance", () => {
  test("el profesor ve solo sus grupos y a los alumnos de sus grupos (AREA)", async () => {
    const mine = await newGroup();
    const foreign = await newGroup({ teacherId: otherTeacher.teacher.id });
    const inMine = await makeStudent(RUN, "DeMiGrupo");
    const elsewhere = await makeStudent(RUN, "DeOtroGrupo");
    await enroll(mine.id, inMine.id);
    await enroll(foreign.id, elsewhere.id);

    const { api } = await loginAs(teacher.username);
    const groups = await (await api.post("groups/query", { data: { page: 1, limit: 200, filters: { termId } } })).json();
    const ids = groups.data.map((g: { id: string }) => g.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(foreign.id);
    expect((await api.get(`groups/${foreign.id}`)).status()).toBe(404);

    const students = await (
      await api.post("students/query", { data: { page: 1, limit: 200, filters: { name: RUN } } })
    ).json();
    const studentIds = students.data.map((s: { id: string }) => s.id);
    expect(studentIds).toContain(inMine.id);
    expect(studentIds).not.toContain(elsewhere.id);
    expect((await api.get(`students/${elsewhere.id}/kardex`)).status()).toBe(404);

    const roster = await (
      await api.post("enrollments/query", { data: { page: 1, limit: 50, filters: { groupId: foreign.id } } })
    ).json();
    expect(roster.total).toBe(0);
    expect((await api.post("groups", { data: groupInput() })).status()).toBe(403);
    expect((await api.post(`groups/${mine.id}/enroll`, { data: { studentId: elsewhere.id } })).status()).toBe(403);
    await api.dispose();
  });

  test("el alumno ve solo sus grupos e inscripciones (OWN)", async () => {
    const own = await makeStudent(RUN, "Portal", pupilUserId);
    const group = await newGroup();
    const other = await newGroup();
    await enroll(group.id, own.id);
    await enroll(other.id, (await makeStudent(RUN, "Ajeno")).id);

    const { api } = await loginAs(PUPIL.username);
    const groups = await (await api.post("groups/query", { data: { page: 1, limit: 50 } })).json();
    expect(groups.data.map((g: { id: string }) => g.id)).toEqual([group.id]);
    const enrollments = await (await api.post("enrollments/query", { data: { page: 1, limit: 50 } })).json();
    expect(enrollments.data.map((e: { studentId: string }) => e.studentId)).toEqual([own.id]);
    expect((await api.get(`groups/${other.id}`)).status()).toBe(404);
    expect((await api.post("courses/query", { data: { page: 1, limit: 5 } })).status()).toBe(403);
    await api.dispose();
  });
});
