import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import {
  E2E_CATALOG_PREFIX,
  clearAuthE2E,
  clearCatalogsE2E,
  createAuthUser,
  db,
  lastAudit,
} from "./support/db";
import { loginAs } from "./support/http";

/**
 * Contrato de M11: parámetros generales (`/settings`) y catálogos base
 * (niveles, ciclos, motivos de baja, tipos de documento). Una prueba por regla
 * de negocio del README del módulo. Los registros llevan el prefijo `E2E` y los
 * parámetros tocados se restauran al terminar.
 */
assertSafeDatabase();

const RUN = newRunId();
const NAME = (label: string) => `${E2E_CATALOG_PREFIX} ${label} ${RUN}`;
const ADMIN = { username: `${E2E_PREFIX}cadmin_${RUN}`, name: "E2E Admin Config", roleKey: "ADMIN" };
const CONTROL = { username: `${E2E_PREFIX}ccontrol_${RUN}`, name: "E2E Control Config", roleKey: "SCHOOL_CONTROL" };
const TEACHER = { username: `${E2E_PREFIX}cprof_${RUN}`, name: "E2E Profesor Config", roleKey: "TEACHER" };

let admin: APIRequestContext;
let control: APIRequestContext;
let teacher: APIRequestContext;
let adminId: string;
let originalSettings: Array<{ key: string; value: unknown }>;
let originalActiveTerm: string | null;

test.beforeAll(async () => {
  adminId = (await createAuthUser({ ...ADMIN, password: E2E.password })).id;
  await createAuthUser({ ...CONTROL, password: E2E.password });
  await createAuthUser({ ...TEACHER, password: E2E.password });
  admin = (await loginAs(ADMIN.username)).api;
  control = (await loginAs(CONTROL.username)).api;
  teacher = (await loginAs(TEACHER.username)).api;
  originalSettings = await db.setting.findMany({ select: { key: true, value: true } });
  originalActiveTerm = (await db.term.findFirst({ where: { active: true } }))?.id ?? null;
});

test.afterAll(async () => {
  for (const { key, value } of originalSettings) {
    await db.setting.update({ where: { key }, data: { value: value as never } });
  }
  await clearCatalogsE2E();
  if (originalActiveTerm) {
    await db.term.update({ where: { id: originalActiveTerm }, data: { active: true } }).catch(() => undefined);
  }
  await Promise.all([admin?.dispose(), control?.dispose(), teacher?.dispose()]);
  await clearAuthE2E();
});

test.describe("parámetros generales", () => {
  test("GET /settings con config.view trae las claves sembradas por la migración", async () => {
    const res = await control.get("settings");
    expect(res.status()).toBe(200);
    const settings: Array<{ key: string; value: unknown }> = await res.json();
    const byKey = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    expect(Object.keys(byKey)).toEqual(
      expect.arrayContaining(["MIN_PASSING_GRADE", "ATTENDANCE_THRESHOLD", "LATE_FEE", "SCHOOL_NAME", "LANGUAGE"])
    );
    expect(typeof byKey.MIN_PASSING_GRADE).toBe("number");
    expect(byKey.LATE_FEE).toMatchObject({ enabled: expect.any(Boolean) });
  });

  test("sin config.view (PROFESOR) → 403", async () => {
    expect((await teacher.get("settings")).status()).toBe(403);
  });

  test("solo config.view (CONTROL_ESCOLAR) no escribe → 403", async () => {
    const res = await control.put("settings", { data: { MIN_PASSING_GRADE: 60 } });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("INSUFFICIENT_PERMISSIONS");
  });

  test("PUT /settings actualiza por code y audita SYS_CONFIG_UPDATED con antes/después", async () => {
    const before = (await db.setting.findUnique({ where: { key: "MIN_PASSING_GRADE" } }))?.value;
    const next = before === 75 ? 72 : 75;
    const res = await admin.put("settings", {
      data: { MIN_PASSING_GRADE: next, LATE_FEE: { enabled: true, dailyRate: 0.02, graceDays: 5 } },
    });
    expect(res.status()).toBe(200);
    const byKey = Object.fromEntries(
      ((await res.json()) as Array<{ key: string; value: unknown }>).map((s) => [s.key, s.value])
    );
    expect(byKey.MIN_PASSING_GRADE).toBe(next);
    expect(byKey.LATE_FEE).toEqual({ enabled: true, dailyRate: 0.02, graceDays: 5 });

    const log = await db.auditLog.findFirst({
      where: { action: "SYS_CONFIG_UPDATED", entityId: "MIN_PASSING_GRADE", userId: adminId },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.previousState).toEqual({ value: before });
    expect(log?.newState).toEqual({ value: next });
  });

  test("code desconocida o valor inválido → 400 sin escribir nada", async () => {
    const unknown = await admin.put("settings", { data: { NO_EXISTE: 1 } });
    expect(unknown.status()).toBe(400);
    expect((await unknown.json()).code).toBe("SETTING_UNKNOWN");

    const before = (await db.setting.findUnique({ where: { key: "ATTENDANCE_THRESHOLD" } }))?.value;
    const invalid = await admin.put("settings", { data: { ATTENDANCE_THRESHOLD: 85, MIN_PASSING_GRADE: 140 } });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).code).toBe("SETTING_INVALID");
    // Todo o nada: el primer parámetro (válido) tampoco se escribió.
    expect((await db.setting.findUnique({ where: { key: "ATTENDANCE_THRESHOLD" } }))?.value).toEqual(before);

    const empty = await admin.put("settings", { data: {} });
    expect((await empty.json()).code).toBe("SETTINGS_REQUIRED");
  });

  test("LANGUAGE cambia el idioma del sistema que reporta /auth/me", async () => {
    await admin.put("settings", { data: { LANGUAGE: "en" } });
    expect((await (await admin.get("auth/me")).json()).language).toBe("en");
    await admin.put("settings", { data: { LANGUAGE: "es" } });
    expect((await (await admin.get("auth/me")).json()).language).toBe("es");
  });
});

test.describe("niveles educativos", () => {
  test("CRUD con desactivación lógica; inactivos fuera de los selects", async () => {
    const created = await admin.post("levels", { data: { name: NAME("Bachillerato"), sortOrder: 3 } });
    expect(created.status()).toBe(201);
    const level = await created.json();
    expect(level).toMatchObject({ name: NAME("Bachillerato"), sortOrder: 3, active: true });
    expect((await lastAudit("LEVEL_CREATED", adminId))?.entityId).toBe(level.id);

    const updated = await admin.patch(`levels/${level.id}`, { data: { sortOrder: 4 } });
    expect((await updated.json()).sortOrder).toBe(4);
    expect((await lastAudit("LEVEL_UPDATED", adminId))?.entityId).toBe(level.id);

    const query = await control.post("levels/query", {
      data: { page: 1, limit: 10, filters: { name: RUN } },
    });
    expect(query.status()).toBe(200);
    expect((await query.json()).total).toBe(1);

    const off = await admin.delete(`levels/${level.id}`);
    expect((await off.json()).active).toBe(false);
    expect((await lastAudit("LEVEL_DEACTIVATED", adminId))?.entityId).toBe(level.id);
    expect((await (await admin.delete(`levels/${level.id}`)).json()).code).toBe("CATALOG_ITEM_ALREADY_INACTIVE");

    const options: Array<{ id: string }> = await (await control.get("levels")).json();
    expect(options.some((o) => o.id === level.id)).toBe(false);
    const all: Array<{ id: string }> = await (await control.get("levels?all=true")).json();
    expect(all.some((o) => o.id === level.id)).toBe(true);
  });

  test("name duplicado → 409 DUPLICATE_RECORD; sin name → 400", async () => {
    await admin.post("levels", { data: { name: NAME("Dup") } });
    const dup = await admin.post("levels", { data: { name: NAME("Dup") } });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).code).toBe("DUPLICATE_RECORD");

    const empty = await admin.post("levels", { data: { name: "  " } });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).code).toBe("VALIDATION_ERROR");
  });

  test("solo levels.view (CONTROL_ESCOLAR) no escribe → 403", async () => {
    const res = await control.post("levels", { data: { name: NAME("Prohibido") } });
    expect(res.status()).toBe(403);
  });

  test("filtro con valor inválido → 400 INVALID_FILTER", async () => {
    const res = await admin.post("levels/query", { data: { page: 1, limit: 5, filters: { active: "talvez" } } });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("INVALID_FILTER");
  });
});

test.describe("ciclos escolares", () => {
  test("fechas: inicio posterior a fin → 400 TERM_DATES_INVALID", async () => {
    const res = await admin.post("terms", {
      data: { name: NAME("Malo"), startDate: "2027-07-01", endDate: "2027-01-01" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("TERM_DATES_INVALID");
  });

  test("solo un ciclo active: activar uno desactiva el anterior y se audita", async () => {
    const a = await (
      await admin.post("terms", { data: { name: NAME("2026-A"), startDate: "2026-01-15", endDate: "2026-06-30" } })
    ).json();
    const b = await (
      await admin.post("terms", { data: { name: NAME("2026-B"), startDate: "2026-08-15", endDate: "2026-12-15" } })
    ).json();
    expect(a).toMatchObject({ startDate: "2026-01-15", endDate: "2026-06-30", active: false });

    expect((await admin.put(`terms/${a.id}/activate`)).status()).toBe(200);
    expect((await (await control.get("terms/active")).json()).id).toBe(a.id);

    const second = await admin.put(`terms/${b.id}/activate`);
    expect((await second.json()).active).toBe(true);
    expect(await db.term.count({ where: { active: true } })).toBe(1);
    expect((await db.term.findUnique({ where: { id: a.id } }))?.active).toBe(false);

    const log = await lastAudit("TERM_ACTIVATED", adminId);
    expect(log?.previousState).toMatchObject({ activeTermId: a.id });
    expect(log?.newState).toMatchObject({ activeTermId: b.id });

    const again = await admin.put(`terms/${b.id}/activate`);
    expect((await again.json()).code).toBe("TERM_ALREADY_ACTIVE");
  });

  test("terms.view (CONTROL_ESCOLAR) consulta; no activa → 403", async () => {
    const list = await control.post("terms/query", { data: { page: 1, limit: 5, filters: { name: RUN } } });
    expect(list.status()).toBe(200);
    const id = (await list.json()).data[0].id;
    expect((await control.put(`terms/${id}/activate`)).status()).toBe(403);
  });
});

test.describe("motivos de baja y tipos de documento", () => {
  test("motivos de baja: alta/edición con config.manage; lectura con config.view", async () => {
    const created = await admin.post("cancellation-reasons", { data: { name: NAME("Traslado") } });
    expect(created.status()).toBe(201);
    const reason = await created.json();
    expect((await lastAudit("CANCELLATION_REASON_CREATED", adminId))?.entityId).toBe(reason.id);

    const edited = await admin.patch(`cancellation-reasons/${reason.id}`, { data: { name: NAME("Traslado foráneo") } });
    expect((await edited.json()).name).toBe(NAME("Traslado foráneo"));

    expect((await control.post("cancellation-reasons/query", { data: { page: 1, limit: 5 } })).status()).toBe(200);
    expect((await control.post("cancellation-reasons", { data: { name: NAME("No") } })).status()).toBe(403);
    expect((await teacher.post("cancellation-reasons/query", { data: { page: 1, limit: 5 } })).status()).toBe(403);
  });

  test("tipos de documento: bandera required filtrable y reactivación por PATCH", async () => {
    const doc = await (
      await admin.post("document-types", { data: { name: NAME("Constancia"), required: true } })
    ).json();
    expect(doc).toMatchObject({ required: true, active: true });

    const required = await control.post("document-types/query", {
      data: { page: 1, limit: 50, filters: { required: true, name: RUN } },
    });
    expect((await required.json()).total).toBe(1);

    await admin.delete(`document-types/${doc.id}`);
    expect((await lastAudit("DOCUMENT_TYPE_DEACTIVATED", adminId))?.entityId).toBe(doc.id);
    const back = await admin.patch(`document-types/${doc.id}`, { data: { active: true } });
    expect((await back.json()).active).toBe(true);

    // Los tipos sembrados por la migración están disponibles para M06.
    const seeded: Array<{ name: string }> = await (await control.get("document-types")).json();
    expect(seeded.map((d) => d.name)).toEqual(expect.arrayContaining(["CURP", "Acta de nacimiento"]));
  });

  test("campos fuera de la whitelist → 400 VALIDATION_ERROR", async () => {
    const res = await admin.post("document-types", { data: { name: NAME("X"), id: "forzado" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });
});
