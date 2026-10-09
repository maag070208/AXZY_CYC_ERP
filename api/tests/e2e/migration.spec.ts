import { expect, test } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import { loginAs } from "./support/http";
import { createAuthUser, db, lastAudit } from "./support/db";
import { makeCurp } from "./support/people";

/**
 * Contrato de M20 (migración de históricos): el `preview` no escribe, la
 * ejecución exige Idempotency-Key y respaldo reciente, revalidar el checksum,
 * las claves naturales evitan duplicar al reejecutar y todo queda auditado.
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}adm_${RUN}`, name: "E2E Admin Migración", roleKey: "ADMIN" };
const CONTROL = { username: `${E2E_PREFIX}ctl_${RUN}`, name: "E2E Control Migración", roleKey: "SCHOOL_CONTROL" };
const STUDENT_CURP = makeCurp("2000-01-01", "M");
const BAD_CURP = "XAXX010101HDFXXX01";
const TEACHER_EMAIL = `e2e_${RUN}_mig@e2e.local`;
const STUDENT_FILE = `e2e_students_${RUN}.csv`;
const TEACHER_FILE = `e2e_teachers_${RUN}.csv`;
const KEY = `e2e_mig_${RUN}`;

const STUDENT_CSV = [
  "name,apellido_paterno,curp,fecha_nacimiento",
  `E2E Migrada ${RUN},Historico,${STUDENT_CURP},2000-01-01`,
  `E2E Inválida ${RUN},Historico,${BAD_CURP},2000-01-01`,
].join("\n");

const TEACHER_CSV = ["name,surnames,email", `E2E Profe ${RUN},Migrado,${TEACHER_EMAIL}`].join("\n");

type Api = Awaited<ReturnType<typeof loginAs>>["api"];

const upload = (api: Api, path: string, entity: string, filename: string, csv: string, extra: Record<string, string> = {}, headers: Record<string, string> = {}) =>
  api.post(path, {
    headers,
    multipart: {
      entity,
      ...extra,
      file: { name: filename, mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") },
    },
  });

const registerBackup = (admin: Api, value: string) =>
  admin.put("settings", { data: { MIGRATION_LAST_BACKUP_AT: value } });

let admin: Api;
let control: Api;

test.beforeAll(async () => {
  await createAuthUser({ ...ADMIN, password: E2E.password });
  await createAuthUser({ ...CONTROL, password: E2E.password });
  admin = (await loginAs(ADMIN.username)).api;
  control = (await loginAs(CONTROL.username)).api;
});

test.afterAll(async () => {
  await admin.dispose();
  await control.dispose();
});

test.describe.serial("migración de históricos", () => {
  test("el preview reporta sin escribir y registra el lote DRY_RUN", async () => {
    const res = await upload(admin, "migration/preview", "Student", STUDENT_FILE, STUDENT_CSV);
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ mode: "DRY_RUN", status: "COMPLETED" });
    expect(body.totals).toEqual({ read: 2, valid: 1, rejected: 1 });
    expect(body.rejected[0]).toMatchObject({ row: 3, reason: "INVALID_CURP" });

    // No escribió el dataset…
    expect(await db.student.findUnique({ where: { curp: STUDENT_CURP } })).toBeNull();
    // …pero sí dejó rastro del lote y de la fila rechazada.
    const batch = await db.migrationBatch.findUnique({ where: { id: body.batchId } });
    expect(batch?.mode).toBe("DRY_RUN");
    expect(await db.migrationRow.count({ where: { batchId: body.batchId, status: "REJECTED" } })).toBe(1);
  });

  test("la ejecución exige Idempotency-Key", async () => {
    await registerBackup(admin, new Date().toISOString());
    const res = await upload(admin, "migration/execute", "Student", STUDENT_FILE, STUDENT_CSV);
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("INVALID_IDEMPOTENCY_KEY");
  });

  test("la ejecución exige un respaldo reciente", async () => {
    await registerBackup(admin, "");
    const res = await upload(admin, "migration/execute", "Student", STUDENT_FILE, STUDENT_CSV, {}, { "Idempotency-Key": KEY });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe("BACKUP_REQUIRED");
  });

  test("ejecuta e inserta; reejecutar con la misma clave no duplica y con otra actualiza", async () => {
    await registerBackup(admin, new Date().toISOString());
    const first = await upload(admin, "migration/execute", "Student", STUDENT_FILE, STUDENT_CSV, {}, { "Idempotency-Key": KEY });
    expect(first.status(), await first.text()).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.totals).toMatchObject({ read: 2, inserted: 1, rejected: 1 });

    const created = await db.student.findUnique({ where: { curp: STUDENT_CURP } });
    expect(created).not.toBeNull();
    expect(created?.studentNumber).toMatch(/^\d{4}-\d{4}$/);

    // Misma clave → mismo lote, sin volver a aplicar.
    const replay = await upload(admin, "migration/execute", "Student", STUDENT_FILE, STUDENT_CSV, {}, { "Idempotency-Key": KEY });
    expect(replay.status()).toBe(201);
    expect((await replay.json()).batchId).toBe(firstBody.batchId);
    expect(await db.student.count({ where: { curp: STUDENT_CURP } })).toBe(1);

    // Clave nueva → reejecuta: la clave natural actualiza en vez de duplicar.
    const again = await upload(admin, "migration/execute", "Student", STUDENT_FILE, STUDENT_CSV, {}, { "Idempotency-Key": `${KEY}_2` });
    expect((await again.json()).totals).toMatchObject({ inserted: 0, updated: 1 });
    expect(await db.student.count({ where: { curp: STUDENT_CURP } })).toBe(1);

    const audit = await lastAudit("MIGRATION_BATCH_EXECUTED", undefined);
    expect(audit).not.toBeNull();
  });

  test("revalida el checksum del archivo en la confirmación", async () => {
    await registerBackup(admin, new Date().toISOString());
    const res = await upload(admin, "migration/execute", "Student", STUDENT_FILE, STUDENT_CSV, { checksum: "0".repeat(64) }, { "Idempotency-Key": `${KEY}_3` });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe("CHECKSUM_MISMATCH");
  });

  test("importa profesores con su cuenta TEACHER y su clave natural email", async () => {
    await registerBackup(admin, new Date().toISOString());
    const first = await upload(admin, "migration/execute", "Teacher", TEACHER_FILE, TEACHER_CSV, {}, { "Idempotency-Key": `${KEY}_t` });
    expect(first.status(), await first.text()).toBe(201);
    expect((await first.json()).totals).toMatchObject({ inserted: 1, rejected: 0 });

    const teacher = await db.teacher.findUnique({ where: { email: TEACHER_EMAIL }, include: { user: { include: { roles: true } } } });
    expect(teacher?.userId).toBeTruthy();
    expect(teacher?.user?.roles.map((r) => r.roleKey)).toContain("TEACHER");

    const again = await upload(admin, "migration/execute", "Teacher", TEACHER_FILE, TEACHER_CSV, {}, { "Idempotency-Key": `${KEY}_t2` });
    expect((await again.json()).totals).toMatchObject({ inserted: 0, updated: 1 });
    expect(await db.teacher.count({ where: { email: TEACHER_EMAIL } })).toBe(1);
  });

  test("el catálogo de lotes filtra y el detalle incluye las filas rechazadas", async () => {
    const res = await admin.post("migration/batches/query", { data: { page: 1, limit: 200, filters: { entity: "Student" } } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    const batch = body.data.find((b: { file: string }) => b.file === STUDENT_FILE);
    expect(batch).toBeTruthy();

    const detail = await admin.get(`migration/batches/${batch.id}`);
    expect(detail.status()).toBe(200);
    expect((await detail.json()).rows[0]).toMatchObject({ reason: "INVALID_CURP" });
  });

  test("sin `migration.execute` responde 403", async () => {
    const res = await upload(control, "migration/preview", "Student", STUDENT_FILE, STUDENT_CSV);
    expect(res.status()).toBe(403);
  });
});
