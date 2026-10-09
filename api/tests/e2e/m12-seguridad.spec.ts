import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import { clearAuthE2E, createAuthUser, db, lastAudit } from "./support/db";
import { anon, bearer, loginAs } from "./support/http";

/**
 * Contrato de M12 (endurecimiento): cabeceras de seguridad, envelope de error
 * sin detalles internos y control de acceso de TODA la API — el barrido sale
 * del documento OpenAPI, así que un endpoint nuevo queda cubierto sin tocar
 * este spec.
 */
assertSafeDatabase();

const RUN = newRunId();
const PUPIL = { username: `${E2E_PREFIX}secpupil_${RUN}`, name: "E2E Alumno Seguridad", roleKey: "STUDENT" };
const ANY_ID = "00000000-0000-4000-8000-000000000000";

interface Operation {
  method: string;
  path: string;
}

let guest: APIRequestContext;
let pupil: APIRequestContext;
let pupilId: string;
const secured: Operation[] = [];
const open: Operation[] = [];

test.beforeAll(async () => {
  guest = await anon();
  pupilId = (await createAuthUser({ ...PUPIL, password: E2E.password })).id;
  pupil = (await loginAs(PUPIL.username)).api;

  const docs = await guest.get(`${new URL(E2E.apiUrl).origin}/docs/json`);
  expect(docs.status()).toBe(200);
  const spec = (await docs.json()) as { paths: Record<string, Record<string, { security?: unknown[] }>> };
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const item = { method: method.toUpperCase(), path: path.replace(/^\//, "").replace(/\{[^}]+\}/g, ANY_ID) };
      (operation.security?.length ? secured : open).push(item);
    }
  }
});

test.afterAll(async () => {
  await guest.dispose();
  await pupil.dispose();
  await clearAuthE2E();
  await db.$disconnect();
});

test("cabeceras de seguridad en cada respuesta y sin X-Powered-By", async () => {
  const headers = (await guest.get("health")).headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("los errores usan el envelope plano y no filtran detalles internos", async () => {
  const missing = await guest.get("no-existe");
  expect(missing.status()).toBe(404);
  const body = await missing.json();
  expect(body).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  expect(Object.keys(body).sort()).toEqual(expect.arrayContaining(["code", "error", "message"]));
  expect(JSON.stringify(body)).not.toMatch(/stack|node_modules|prisma|\.ts:/i);

  const malformed = await guest.post("auth/login", { headers: { "Content-Type": "application/json" }, data: "{no es json" });
  expect(malformed.status()).toBe(400);
  expect(JSON.stringify(await malformed.json())).not.toMatch(/stack|SyntaxError|node_modules/);
});

test("el documento OpenAPI declara qué es público: solo salud y acceso", () => {
  expect(open.map((o) => `${o.method} ${o.path}`).sort()).toEqual([
    "GET health",
    "GET health/ready",
    "POST auth/forgot-password",
    "POST auth/login",
    "POST auth/refresh",
    "POST auth/reset-password",
  ]);
  expect(secured.length).toBeGreaterThan(150);
});

test("barrido 401: ningún endpoint protegido responde sin token ni con uno inválido", async () => {
  const forged = await bearer("no.es.un-jwt");
  const leaks: string[] = [];
  for (const { method, path } of secured) {
    const without = await guest.fetch(path, { method });
    if (without.status() !== 401) leaks.push(`${method} ${path} sin token → ${without.status()}`);
    const invalid = await forged.fetch(path, { method });
    if (invalid.status() !== 401) leaks.push(`${method} ${path} token inválido → ${invalid.status()}`);
  }
  await forged.dispose();
  expect(leaks).toEqual([]);
});

test("barrido 403: una cuenta STUDENT no entra a la administración y queda en bitácora", async () => {
  const adminOnly: Array<[string, string]> = [
    ["POST", "users/query"],
    ["POST", "users"],
    ["GET", "permissions/admin"],
    ["PUT", "permissions/matrix"],
    ["POST", "audit/query"],
    ["PUT", "settings"],
    ["POST", "students"],
    ["POST", "teachers"],
    ["POST", "courses"],
    ["POST", "charges"],
    ["POST", "payments"],
    ["POST", "notification-templates/query"],
    ["POST", "migration/batches/query"],
    ["POST", "programs"],
    ["GET", "dashboard/executive"],
  ];
  const allowed: string[] = [];
  for (const [method, path] of adminOnly) {
    const res = await pupil.fetch(path, { method, data: {} });
    if (res.status() !== 403 || (await res.json()).code !== "INSUFFICIENT_PERMISSIONS") allowed.push(`${method} ${path} → ${res.status()}`);
  }
  expect(allowed).toEqual([]);
  await expect.poll(async () => (await lastAudit("ACCESS_DENIED", pupilId))?.action).toBe("ACCESS_DENIED");
});
