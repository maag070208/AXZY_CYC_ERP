import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import {
  activeRefreshTokens,
  clearAuthE2E,
  createAuthUser,
  createResetToken,
  db,
  deactivateUser,
  lastAudit,
  lockState,
} from "./support/db";

/**
 * E2E de contrato de M02 contra la API real: login, bloqueo, refresh rotado,
 * `/auth/me`, logout y recuperación de contraseña. Los usuarios se crean aquí
 * (prefijo `e2e_`) y se borran al terminar.
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}admin_${RUN}`, name: "E2E Admin", roleKey: "ADMIN" };
const LOCKED = { username: `${E2E_PREFIX}lock_${RUN}`, name: "E2E Bloqueo", roleKey: "ALUMNO" };
const TEACHER = { username: `${E2E_PREFIX}prof_${RUN}`, name: "E2E Profesor", roleKey: "PROFESOR" };
const RESET = { username: `${E2E_PREFIX}reset_${RUN}`, name: "E2E Recupera", roleKey: "ALUMNO" };
const GONE = { username: `${E2E_PREFIX}baja_${RUN}`, name: "E2E Baja", roleKey: "ALUMNO" };

let adminId: string;
let teacherId: string;
let resetId: string;

const loginAs = async (username: string) => {
  const ctx = await anon();
  const res = await ctx.post("auth/login", { data: { username, password: E2E.password } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  await ctx.dispose();
  return body as { token: string; refreshToken: string };
};

const bearer = (token: string) =>
  playwrightRequest.newContext({
    baseURL: E2E.baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

const anon = async (): Promise<APIRequestContext> =>
  playwrightRequest.newContext({ baseURL: E2E.baseURL });

test.beforeAll(async () => {
  adminId = (await createAuthUser({ ...ADMIN, password: E2E.password })).id;
  await createAuthUser({ ...LOCKED, password: E2E.password });
  teacherId = (await createAuthUser({ ...TEACHER, password: E2E.password })).id;
  await createAuthUser({ ...GONE, password: E2E.password });
  resetId = (await createAuthUser({ ...RESET, password: E2E.password })).id;
  await deactivateUser(GONE.username);
});

test.afterAll(async () => {
  await clearAuthE2E();
});

test.describe("POST /auth/login", () => {
  test("login feliz devuelve tokens y usuario con permisos", async () => {
    const ctx = await anon();
    const res = await ctx.post("auth/login", {
      data: { username: ADMIN.username, password: E2E.password },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user).toMatchObject({
      id: adminId,
      username: ADMIN.username,
      name: ADMIN.name,
      role: "ADMIN",
      roles: ["ADMIN"],
    });
    expect(body.user.permissions["users.view"]).toBe("ALL");
    expect(body.user.password ?? body.user.passwordHash).toBeUndefined();
    await ctx.dispose();
  });

  test("credenciales inválidas → 401 INVALID_CREDENTIALS", async () => {
    const ctx = await anon();
    const res = await ctx.post("auth/login", {
      data: { username: ADMIN.username, password: "incorrecta" },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).code).toBe("INVALID_CREDENTIALS");
    await ctx.dispose();
  });

  test("bloqueo temporal tras 5 intentos → 429 ACCOUNT_LOCKED", async () => {
    const ctx = await anon();
    for (let i = 1; i <= 4; i++) {
      const res = await ctx.post("auth/login", {
        data: { username: LOCKED.username, password: "incorrecta" },
      });
      expect(res.status()).toBe(401);
    }
    const fifth = await ctx.post("auth/login", {
      data: { username: LOCKED.username, password: "incorrecta" },
    });
    expect(fifth.status()).toBe(429);

    // Incluso con la contraseña correcta sigue bloqueada.
    const correct = await ctx.post("auth/login", {
      data: { username: LOCKED.username, password: E2E.password },
    });
    expect(correct.status()).toBe(429);

    const state = await lockState(LOCKED.username);
    expect(state?.failedAttempts).toBeGreaterThanOrEqual(5);
    expect(state?.lockedUntil).not.toBeNull();
    await ctx.dispose();
  });
});

test.describe("GET /auth/me", () => {
  test("sin token → 401", async () => {
    const ctx = await anon();
    expect((await ctx.get("auth/me")).status()).toBe(401);
    await ctx.dispose();
  });

  test("con token devuelve usuario, roles, permisos e idioma", async () => {
    const ctx = await anon();
    const login = await ctx.post("auth/login", {
      data: { username: ADMIN.username, password: E2E.password },
    });
    const { token } = await login.json();
    await ctx.dispose();

    const authed = await playwrightRequest.newContext({
      baseURL: E2E.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const res = await authed.get("auth/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ username: ADMIN.username, role: "ADMIN" });
    expect(body.roles).toContain("ADMIN");
    expect(body.permissions["audit.view"]).toBe("ALL");
    expect(["es", "en"]).toContain(body.language);
    await authed.dispose();
  });
});

test.describe("refresh rotado", () => {
  test("el refresh emite uno nuevo e invalida el anterior", async () => {
    const ctx = await anon();
    const login = await ctx.post("auth/login", {
      data: { username: ADMIN.username, password: E2E.password },
    });
    const { refreshToken } = await login.json();

    const rotated = await ctx.post("auth/refresh", { data: { refreshToken } });
    expect(rotated.status()).toBe(200);
    const fresh = await rotated.json();
    expect(fresh.token).toBeTruthy();
    expect(fresh.refreshToken).not.toBe(refreshToken);

    // Reusar el refresh viejo falla.
    const reused = await ctx.post("auth/refresh", { data: { refreshToken } });
    expect(reused.status()).toBe(401);
    expect((await reused.json()).code).toBe("INVALID_REFRESH_TOKEN");

    await ctx.dispose();
  });

  test("logout revoca el refresh vigente", async () => {
    const ctx = await anon();
    const login = await ctx.post("auth/login", {
      data: { username: ADMIN.username, password: E2E.password },
    });
    const { token, refreshToken } = await login.json();

    const authed = await playwrightRequest.newContext({
      baseURL: E2E.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const logout = await authed.post("auth/logout", { data: { refreshToken } });
    expect(logout.status()).toBe(204);
    await authed.dispose();

    const refreshed = await ctx.post("auth/refresh", { data: { refreshToken } });
    expect(refreshed.status()).toBe(401);
    await ctx.dispose();
  });

  test("solo queda un refresh vigente tras rotar", async () => {
    const ctx = await anon();
    const login = await ctx.post("auth/login", {
      data: { username: ADMIN.username, password: E2E.password },
    });
    const { refreshToken } = await login.json();
    const activeBefore = await activeRefreshTokens(adminId);
    await ctx.post("auth/refresh", { data: { refreshToken } });
    const activeAfter = await activeRefreshTokens(adminId);
    // El anterior se revoca y se crea uno nuevo: el total vigente no crece.
    expect(activeAfter).toBeLessThanOrEqual(activeBefore);
    await ctx.dispose();
  });
});

test.describe("recuperación de contraseña", () => {
  test("forgot-password responde 200 siempre (usuario inexistente incluido)", async () => {
    const ctx = await anon();
    const res = await ctx.post("auth/forgot-password", {
      data: { username: `${E2E_PREFIX}noexiste_${RUN}` },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
    await ctx.dispose();
  });

  test("forgot-password de un usuario real emite un token (hasheado) y lo audita", async () => {
    const before = await db.passwordResetToken.count({ where: { userId: resetId } });
    const ctx = await anon();
    const res = await ctx.post("auth/forgot-password", { data: { username: `${RESET.username}@e2e.local` } });
    expect(res.status()).toBe(200);
    await ctx.dispose();
    expect(await db.passwordResetToken.count({ where: { userId: resetId } })).toBe(before + 1);
    expect((await lastAudit("PASSWORD_RESET_REQUESTED", resetId))?.entityId).toBe(resetId);
  });

  test("reset-password feliz: cambia la contraseña, cierra sesiones y el token es de un uso", async () => {
    const session = await loginAs(RESET.username);
    const token = `e2e-reset-${RUN}`;
    await createResetToken(resetId, token);
    const next = `${E2E.password}-reset`;

    const ctx = await anon();
    const res = await ctx.post("auth/reset-password", { data: { token, password: next } });
    expect(res.status()).toBe(200);
    expect((await lastAudit("PASSWORD_RESET_COMPLETED", resetId))?.entityId).toBe(resetId);

    expect((await ctx.post("auth/refresh", { data: { refreshToken: session.refreshToken } })).status()).toBe(401);
    expect((await ctx.post("auth/login", { data: { username: RESET.username, password: E2E.password } })).status()).toBe(401);
    expect((await ctx.post("auth/login", { data: { username: RESET.username, password: next } })).status()).toBe(200);

    const reused = await ctx.post("auth/reset-password", { data: { token, password: `${next}-2` } });
    expect((await reused.json()).code).toBe("RESET_TOKEN_INVALID");
    await ctx.dispose();
  });

  test("reset-password con token vencido → 422 RESET_TOKEN_INVALID", async () => {
    const token = `e2e-expired-${RUN}`;
    await createResetToken(resetId, token, -1000);
    const ctx = await anon();
    const res = await ctx.post("auth/reset-password", { data: { token, password: `${E2E.password}-x` } });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe("RESET_TOKEN_INVALID");
    await ctx.dispose();
  });

  test("reset-password con token inválido → 422 RESET_TOKEN_INVALID", async () => {
    const ctx = await anon();
    const res = await ctx.post("auth/reset-password", {
      data: { token: "token-invalido", password: `${E2E.password}-nueva` },
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe("RESET_TOKEN_INVALID");
    await ctx.dispose();
  });

  test("reset-password con contraseña corta → 400 VALIDATION_ERROR", async () => {
    const ctx = await anon();
    const res = await ctx.post("auth/reset-password", {
      data: { token: "x", password: "corta" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
    await ctx.dispose();
  });
});

test.describe("autorización por endpoint", () => {
  test("cuenta dada de baja → 401 ACCOUNT_DEACTIVATED", async () => {
    const ctx = await anon();
    const res = await ctx.post("auth/login", {
      data: { username: GONE.username, password: E2E.password },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).code).toBe("ACCOUNT_DEACTIVATED");
    await ctx.dispose();
  });

  test("login por email también funciona", async () => {
    const ctx = await anon();
    const res = await ctx.post("auth/login", {
      data: { username: `${ADMIN.username}@e2e.local`, password: E2E.password },
    });
    expect(res.status()).toBe(200);
    await ctx.dispose();
  });

  test("un refresh token no sirve como access → 401 INVALID_TOKEN", async () => {
    const { refreshToken } = await loginAs(ADMIN.username);
    const ctx = await bearer(refreshToken);
    const res = await ctx.get("auth/me");
    expect(res.status()).toBe(401);
    expect((await res.json()).code).toBe("INVALID_TOKEN");
    await ctx.dispose();
  });

  test("token basura → 401 INVALID_TOKEN; header mal formado → 401", async () => {
    const ctx = await bearer("no-es-un-jwt");
    expect((await (await ctx.get("users")).json()).code).toBe("INVALID_TOKEN");
    await ctx.dispose();
    const raw = await playwrightRequest.newContext({
      baseURL: E2E.baseURL,
      extraHTTPHeaders: { Authorization: "Token abc" },
    });
    const res = await raw.get("users");
    expect(res.status()).toBe(401);
    expect((await res.json()).code).toBe("INVALID_AUTHORIZATION_HEADER");
    await raw.dispose();
  });

  test("PROFESOR sin users.view → 403 INSUFFICIENT_PERMISSIONS y queda en bitácora", async () => {
    const { token } = await loginAs(TEACHER.username);
    const ctx = await bearer(token);
    const res = await ctx.post("users/query", { data: { page: 1, limit: 10 } });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("INSUFFICIENT_PERMISSIONS");
    await ctx.dispose();

    // El registro se escribe en segundo plano.
    await expect
      .poll(async () => (await lastAudit("ACCESS_DENIED", teacherId))?.entityId ?? null)
      .toBe("users.view");
  });

  test("ADMIN con users.view → 200 en /users/query", async () => {
    const { token } = await loginAs(ADMIN.username);
    const ctx = await bearer(token);
    const res = await ctx.post("users/query", {
      data: { page: 1, limit: 5, filters: { username: ADMIN.username } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data[0].username).toBe(ADMIN.username);
    await ctx.dispose();
  });

  test("el login exitoso queda en bitácora (AUTH_LOGIN) sin secretos", async () => {
    await loginAs(ADMIN.username);
    const log = await lastAudit("AUTH_LOGIN", adminId);
    expect(log).not.toBeNull();
    const dump = JSON.stringify(log);
    expect(dump).not.toContain(E2E.password);
    expect(dump).not.toMatch(/passwordHash|refreshToken/);
  });
});

