import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import {
  clearAuthE2E,
  clearStudentsE2E,
  createAuthUser,
  db,
  lastAudit,
} from "./support/db";
import { anon, loginAs } from "./support/http";
import { makeCurp, yearsAgo } from "./support/people";

/**
 * Contrato de M03 (alumnos) y M05 (bajas y reingresos): alta con matrícula
 * generada, CURP, duplicados, tutores, alcance por registro, exportación y el
 * historial de movimientos. Los alumnos llevan `nombres` con prefijo `E2E`.
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}sadmin_${RUN}`, name: "E2E Admin Alumnos", roleKey: "ADMIN" };
const CONTROL = { username: `${E2E_PREFIX}scontrol_${RUN}`, name: "E2E Control Alumnos", roleKey: "SCHOOL_CONTROL" };
const TEACHER = { username: `${E2E_PREFIX}sprof_${RUN}`, name: "E2E Profesor Alumnos", roleKey: "TEACHER" };
const PUPIL = { username: `${E2E_PREFIX}spupil_${RUN}`, name: "E2E Alumno Portal", roleKey: "STUDENT" };

let admin: APIRequestContext;
let control: APIRequestContext;
let adminId: string;
let pupilUserId: string;

const tutor = (overrides: Record<string, unknown> = {}) => ({
  name: "E2E Tutora",
  relationship: "Madre",
  phone: "5512345678",
  email: "tutora@e2e.local",
  isPaymentResponsible: true,
  ...overrides,
});

const minor = (label: string, overrides: Record<string, unknown> = {}) => {
  const birth = yearsAgo(15);
  return {
    firstNames: `E2E ${label} ${RUN}`,
    paternalSurname: "Prueba",
    maternalSurname: "Contrato",
    curp: makeCurp(birth),
    birthDate: birth,
    gender: "M",
    email: `${label.toLowerCase()}_${RUN}@e2e.local`,
    phone: "5511112222",
    guardians: [tutor()],
    ...overrides,
  };
};

test.beforeAll(async () => {
  adminId = (await createAuthUser({ ...ADMIN, password: E2E.password })).id;
  await createAuthUser({ ...CONTROL, password: E2E.password });
  await createAuthUser({ ...TEACHER, password: E2E.password });
  pupilUserId = (await createAuthUser({ ...PUPIL, password: E2E.password })).id;
  admin = (await loginAs(ADMIN.username)).api;
  control = (await loginAs(CONTROL.username)).api;
});

test.afterAll(async () => {
  await Promise.all([admin?.dispose(), control?.dispose()]);
  await clearStudentsE2E();
  await clearAuthE2E();
});

test.describe("alta", () => {
  test("genera la matrícula AAAA-NNNN del año de ingreso, guarda tutores y audita", async () => {
    const input = { ...minor("Alta"), enrollmentDate: "2026-08-03" };
    const res = await control.post("students", { data: input });
    expect(res.status()).toBe(201);
    const student = await res.json();
    expect(student.studentNumber).toMatch(/^2026-\d{4,}$/);
    expect(student).toMatchObject({
      status: "ACTIVE",
      curp: input.curp,
      birthDate: input.birthDate,
      enrollmentDate: "2026-08-03",
      fullName: `${input.firstNames} Prueba Contrato`,
    });
    expect(student.guardians).toHaveLength(1);
    expect(student.guardians[0]).toMatchObject({ name: "E2E Tutora", isPaymentResponsible: true });

    const log = await db.auditLog.findFirst({ where: { action: "STUDENT_CREATED", entityId: student.id } });
    expect(log?.newState).toMatchObject({ studentNumber: student.studentNumber });
  });

  test("dos altas seguidas reciben consecutivos distintos", async () => {
    const [a, b] = await Promise.all([
      control.post("students", { data: minor("ConsecA") }),
      control.post("students", { data: minor("ConsecB") }),
    ]);
    expect(a.status()).toBe(201);
    expect(b.status()).toBe(201);
    const [ma, mb] = [(await a.json()).studentNumber, (await b.json()).studentNumber];
    expect(ma).not.toBe(mb);
  });

  test("enrollmentDate por defecto es hoy", async () => {
    const student = await (await control.post("students", { data: minor("Hoy") })).json();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
    expect(student.enrollmentDate).toBe(today);
  });

  test("CURP inválida → 400 con detalle por campo; repetida → 409 DUPLICATE_CURP", async () => {
    const bad = await control.post("students", { data: minor("CurpMala", { curp: "XXXX000000HDFXXX00" }) });
    expect(bad.status()).toBe(400);
    const body = await bad.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details.fieldErrors.curp[0]).toMatch(/CURP/);

    const first = minor("CurpDup");
    expect((await control.post("students", { data: first })).status()).toBe(201);
    const dup = await control.post("students", { data: minor("CurpDup2", { curp: first.curp }) });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).code).toBe("DUPLICATE_CURP");
  });

  test("mismo nombre y nacimiento → 409 DUPLICATE_STUDENT; con confirmación pasa", async () => {
    const first = minor("Homonimo");
    expect((await control.post("students", { data: first })).status()).toBe(201);
    const twin = { ...first, curp: makeCurp(first.birthDate, "M") };
    const res = await control.post("students", { data: twin });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("DUPLICATE_STUDENT");
    expect(body.details.matches).toHaveLength(1);

    const confirmed = await control.post("students", { data: { ...twin, confirmDuplicate: true } });
    expect(confirmed.status()).toBe(201);
  });

  test("menor sin tutor → 400 GUARDIAN_REQUIRED; mayor de edad sin tutor sí", async () => {
    const noTutor = await control.post("students", { data: minor("SinTutor", { guardians: [] }) });
    expect((await noTutor.json()).code).toBe("GUARDIAN_REQUIRED");

    const birth = yearsAgo(20);
    const adult = await control.post("students", {
      data: minor("Adulto", { birthDate: birth, curp: makeCurp(birth), guardians: [] }),
    });
    expect(adult.status()).toBe(201);
  });

  test("dos responsables de pago → 400; nacimiento futuro → 400", async () => {
    const two = await control.post("students", {
      data: minor("DosPagan", { guardians: [tutor(), tutor({ name: "E2E Tutor 2", relationship: "Padre" })] }),
    });
    expect((await two.json()).code).toBe("MULTIPLE_PAYMENT_RESPONSIBLES");

    const future = "2099-01-01";
    const res = await control.post("students", { data: minor("Futuro", { birthDate: future, curp: makeCurp("1999-01-01") }) });
    expect(res.status()).toBe(400);
  });
});

test.describe("consulta, edición y alcance", () => {
  test("/students/query busca por palabras del nombre, matrícula y estatus", async () => {
    const created = await (await control.post("students", { data: minor("Buscable") })).json();
    const byName = await control.post("students/query", {
      data: { page: 1, limit: 10, filters: { name: `buscable ${RUN} prueba` } },
    });
    expect((await byName.json()).data.map((s: { id: string }) => s.id)).toEqual([created.id]);

    const byStudentNumber = await control.post("students/query", {
      data: { page: 1, limit: 10, filters: { studentNumber: created.studentNumber, status: "ACTIVE" } },
    });
    expect((await byStudentNumber.json()).total).toBe(1);

    const badStatus = await control.post("students/query", { data: { filters: { status: "PERDIDO" } } });
    expect((await badStatus.json()).code).toBe("INVALID_FILTER");
  });

  test("PATCH cambia datos y reemplaza tutores; la matrícula no se toca y se audita", async () => {
    const created = await (await control.post("students", { data: minor("Editar") })).json();
    const res = await control.patch(`students/${created.id}`, {
      data: {
        phone: "5599998888",
        guardians: [tutor({ name: "E2E Abuela", relationship: "Abuela" })],
        studentNumber: "1999-0001",
      },
    });
    // `matricula` no es editable: la whitelist lo rechaza.
    expect(res.status()).toBe(400);

    const ok = await control.patch(`students/${created.id}`, {
      data: { phone: "5599998888", guardians: [tutor({ name: "E2E Abuela", relationship: "Abuela" })] },
    });
    expect(ok.status()).toBe(200);
    const student = await ok.json();
    expect(student.studentNumber).toBe(created.studentNumber);
    expect(student.phone).toBe("5599998888");
    expect(student.guardians.map((g: { name: string }) => g.name)).toEqual(["E2E Abuela"]);

    const log = await db.auditLog.findFirst({
      where: { action: "STUDENT_UPDATED", entityId: created.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.previousState).toMatchObject({ phone: "5511112222" });
    expect(log?.newState).toMatchObject({ phone: "5599998888" });
  });

  test("ALUMNO (OWN) solo ve su propio registro; PROFESOR (AREA, sin grupos aún) no ve nada", async () => {
    const mine = await (await control.post("students", { data: minor("Propio", { userId: pupilUserId }) })).json();
    const other = await (await control.post("students", { data: minor("Ajeno") })).json();

    const { api: pupil } = await loginAs(PUPIL.username);
    const list = await (await pupil.post("students/query", { data: { page: 1, limit: 50 } })).json();
    expect(list.data.map((s: { id: string }) => s.id)).toEqual([mine.id]);
    expect((await pupil.get(`students/${mine.id}`)).status()).toBe(200);
    expect((await pupil.get(`students/${other.id}`)).status()).toBe(404);
    expect((await pupil.post("students", { data: minor("NoPuede") })).status()).toBe(403);
    await pupil.dispose();

    const { api: teacher } = await loginAs(TEACHER.username);
    expect((await (await teacher.post("students/query", { data: {} })).json()).total).toBe(0);
    await teacher.dispose();
  });

  test("una cuenta solo se vincula a un alumno", async () => {
    const res = await control.post("students", { data: minor("OtraVez", { userId: pupilUserId }) });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe("USER_ALREADY_LINKED");
  });

  test("exporta a Excel con los filtros vigentes", async () => {
    const res = await control.post("students/export", { data: { filters: { name: RUN } } });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");
    const bytes = await res.body();
    expect(bytes.subarray(0, 2).toString()).toBe("PK"); // zip de OOXML
    expect((await lastAudit("STUDENTS_EXPORTED"))?.metadata).toMatchObject({ rows: expect.any(Number) });
  });

  test("sin token → 401; sin students.view → 403", async () => {
    const guest = await anon();
    expect((await guest.post("students/query", { data: {} })).status()).toBe(401);
    await guest.dispose();
    const { api: teacher } = await loginAs(TEACHER.username);
    expect((await teacher.post("students", { data: minor("X") })).status()).toBe(403);
    await teacher.dispose();
  });
});

test.describe("bajas y reingresos (M05)", () => {
  test("baja con motivo del catálogo → BAJA + movimiento + bitácora; repetirla → 409", async () => {
    const student = await (await control.post("students", { data: minor("Baja") })).json();
    const reason = await db.cancellationReason.findFirst({ where: { active: true } });

    const res = await control.post(`students/${student.id}/withdrawal`, {
      data: { reason: "Cambio de ciudad", reasonId: reason!.id, notes: "Se muda a Monterrey" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "WITHDRAWN", cancelledEnrollments: 0 });
    expect(body.movement).toMatchObject({ type: "WITHDRAWAL", reason: "Cambio de ciudad", reasonId: reason!.id });

    const log = await db.auditLog.findFirst({ where: { action: "STUDENT_DEACTIVATED", entityId: student.id } });
    expect(log?.previousState).toEqual({ status: "ACTIVE" });
    expect(log?.metadata).toMatchObject({ movementId: body.movement.id });

    const again = await control.post(`students/${student.id}/withdrawal`, { data: { reason: "Otra vez" } });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("STUDENT_INACTIVE");
  });

  test("reingreso conserva la matrícula; el historial queda en orden y es de solo lectura", async () => {
    const student = await (await control.post("students", { data: minor("Reingreso") })).json();
    await control.post(`students/${student.id}/withdrawal`, { data: { reason: "Motivos económicos", date: "2026-01-15" } });
    const back = await control.post(`students/${student.id}/reentry`, { data: { reason: "Regulariza pagos" } });
    expect(back.status()).toBe(200);
    expect((await back.json()).status).toBe("ACTIVE");

    const detail = await (await control.get(`students/${student.id}`)).json();
    expect(detail).toMatchObject({ studentNumber: student.studentNumber, status: "ACTIVE" });

    const history = await (await control.get(`students/${student.id}/movements`)).json();
    expect(history.map((m: { type: string }) => m.type)).toEqual(["REENTRY", "WITHDRAWAL"]);
    expect(history[1]).toMatchObject({ date: "2026-01-15", authorName: CONTROL.name });

    const twice = await control.post(`students/${student.id}/reentry`, { data: { reason: "Ya activo" } });
    expect((await twice.json()).code).toBe("STUDENT_ALREADY_ACTIVE");
    expect((await lastAudit("STUDENT_REACTIVATED"))?.entityId).toBe(student.id);
  });

  test("motivo obligatorio, fecha futura y motivo de catálogo inactivo → 400", async () => {
    const student = await (await control.post("students", { data: minor("Validar") })).json();
    expect((await (await control.post(`students/${student.id}/withdrawal`, { data: {} })).json()).code).toBe("VALIDATION_ERROR");
    const future = await control.post(`students/${student.id}/withdrawal`, { data: { reason: "Futuro", date: "2099-01-01" } });
    expect((await future.json()).code).toBe("FUTURE_DATE");
    const ghost = await control.post(`students/${student.id}/withdrawal`, {
      data: { reason: "Fantasma", reasonId: "00000000-0000-0000-0000-000000000000" },
    });
    expect((await ghost.json()).code).toBe("REASON_NOT_AVAILABLE");
  });

  test("DELETE /students/:id es la baja lógica de M03 (pide motivo y deja movimiento)", async () => {
    const student = await (await admin.post("students", { data: minor("Delete") })).json();
    const res = await admin.delete(`students/${student.id}`, { data: { reason: "Duplicado en captura" } });
    expect(res.status()).toBe(200);
    expect(await db.student.findUnique({ where: { id: student.id }, select: { status: true } })).toEqual({ status: "WITHDRAWN" });
    expect(await db.studentMovement.count({ where: { studentId: student.id, type: "WITHDRAWAL" } })).toBe(1);
    expect((await lastAudit("STUDENT_DEACTIVATED", adminId))?.entityId).toBe(student.id);
  });

  test("ALUMNO no registra movimientos → 403", async () => {
    const { api: pupil } = await loginAs(PUPIL.username);
    const own = await db.student.findFirst({ where: { userId: pupilUserId } });
    expect((await pupil.post(`students/${own!.id}/withdrawal`, { data: { reason: "Me voy" } })).status()).toBe(403);
    await pupil.dispose();
  });
});
