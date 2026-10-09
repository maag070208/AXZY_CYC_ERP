import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import { clearAuthE2E, createAuthUser, db, lastAudit } from "./support/db";
import { anon, login, loginAs } from "./support/http";

/**
 * Contrato de usuarios (M02): CRUD, multi-rol, baja/reactivación, desbloqueo,
 * contraseña temporal y bitácora de cada escritura. Todo lo creado lleva el
 * prefijo `e2e_` y se borra al terminar.
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}uadmin_${RUN}`, name: "E2E Admin Usuarios", roleKey: "ADMIN" };
const CONTROL = { username: `${E2E_PREFIX}ucontrol_${RUN}`, name: "E2E Control", roleKey: "CONTROL_ESCOLAR" };

let admin: APIRequestContext;
let adminId: string;

const newUser = (suffix: string, roles: string[] = ["ALUMNO"]) => ({
  username: `${E2E_PREFIX}${suffix}_${RUN}`,
  email: `${E2E_PREFIX}${suffix}_${RUN}@e2e.local`,
  name: `E2E ${suffix}`,
  password: E2E.password,
  roles,
});

test.beforeAll(async () => {
  adminId = (await createAuthUser({ ...ADMIN, password: E2E.password })).id;
  await createAuthUser({ ...CONTROL, password: E2E.password });
  admin = (await loginAs(ADMIN.username)).api;
});

test.afterAll(async () => {
  await admin?.dispose();
  await clearAuthE2E();
});

test.describe("alta y consulta", () => {
  test("POST /users crea con multi-rol, obliga a cambiar contraseña y audita", async () => {
    const input = newUser("alta", ["PROFESOR", "CONTROL_ESCOLAR"]);
    const res = await admin.post("users", { data: input });
    expect(res.status()).toBe(201);
    const user = await res.json();
    expect(user).toMatchObject({
      username: input.username,
      email: input.email,
      active: true,
      mustChangePassword: true,
      locked: false,
    });
    expect([...user.roles].sort()).toEqual(["CONTROL_ESCOLAR", "PROFESOR"]);
    expect(user.password ?? user.passwordHash).toBeUndefined();

    const log = await lastAudit("USER_CREATED", adminId);
    expect(log?.entityId).toBe(user.id);
    expect(JSON.stringify(log)).not.toContain(E2E.password);

    const detail = await admin.get(`users/${user.id}`);
    expect(detail.status()).toBe(200);
    expect((await detail.json()).username).toBe(input.username);
  });

  test("username o email duplicado → 409", async () => {
    const input = newUser("dup");
    expect((await admin.post("users", { data: input })).status()).toBe(201);

    const again = await admin.post("users", { data: { ...input, email: `otro_${RUN}@e2e.local` } });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("USERNAME_TAKEN");

    const sameEmail = await admin.post("users", { data: { ...input, username: `${input.username}_b` } });
    expect(sameEmail.status()).toBe(409);
    expect((await sameEmail.json()).code).toBe("EMAIL_TAKEN");
  });

  test("validación: contraseña corta, email inválido y sin roles → 400 por campo", async () => {
    const res = await admin.post("users", {
      data: { ...newUser("inval"), password: "corta", email: "no-es-email", roles: [] },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(body.details.fieldErrors).sort()).toEqual(["email", "password", "roles"]);
  });

  test("rol inexistente → 400 INVALID_ROLE", async () => {
    const res = await admin.post("users", { data: newUser("rolx", ["NO_EXISTE"]) });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("INVALID_ROLE");
  });

  test("/users/query filtra por rol y por estatus", async () => {
    const input = newUser("filtro", ["PROFESOR"]);
    await admin.post("users", { data: input });
    const res = await admin.post("users/query", {
      data: { page: 1, limit: 50, filters: { username: `filtro_${RUN}`, role: "PROFESOR", active: true } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data[0].username).toBe(input.username);

    const none = await admin.post("users/query", {
      data: { page: 1, limit: 50, filters: { username: `filtro_${RUN}`, role: "ALUMNO" } },
    });
    expect((await none.json()).total).toBe(0);
  });

  test("CONTROL_ESCOLAR sin users.create → 403", async () => {
    const { api } = await loginAs(CONTROL.username);
    const res = await api.post("users", { data: newUser("noperm") });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("INSUFFICIENT_PERMISSIONS");
    await api.dispose();
  });
});

test.describe("edición", () => {
  test("PATCH /users/:id cambia datos y reemplaza roles; audita antes/después", async () => {
    const created = await (await admin.post("users", { data: newUser("edit") })).json();
    const res = await admin.patch(`users/${created.id}`, {
      data: { name: "E2E Editado", phone: "5550001111", roles: ["PROFESOR"] },
    });
    expect(res.status()).toBe(200);
    const user = await res.json();
    expect(user).toMatchObject({ name: "E2E Editado", phone: "5550001111", roles: ["PROFESOR"] });

    const log = await lastAudit("USER_UPDATED", adminId);
    expect(log?.entityId).toBe(created.id);
    expect(log?.previousState).toMatchObject({ name: created.name, roles: ["ALUMNO"] });
    expect(log?.newState).toMatchObject({ name: "E2E Editado", roles: ["PROFESOR"] });
  });

  test("nadie cambia sus propios roles → 409 CANNOT_CHANGE_OWN_PERMISSIONS", async () => {
    const res = await admin.patch(`users/${adminId}`, { data: { roles: ["ALUMNO"] } });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe("CANNOT_CHANGE_OWN_PERMISSIONS");
  });

  test("usuario inexistente → 404 USER_NOT_FOUND", async () => {
    const res = await admin.patch("users/00000000-0000-0000-0000-000000000000", { data: { name: "x" } });
    expect(res.status()).toBe(404);
    expect((await res.json()).code).toBe("USER_NOT_FOUND");
  });
});

test.describe("baja, reactivación y desbloqueo", () => {
  test("baja lógica: cierra sesiones, bloquea el login; reactivar lo devuelve", async () => {
    const input = newUser("baja");
    const created = await (await admin.post("users", { data: input })).json();
    const session = await login(input.username);

    const res = await admin.delete(`users/${created.id}`, { data: { reason: "Egresado" } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ active: false, deactivationReason: "Egresado" });

    const ctx = await anon();
    const refresh = await ctx.post("auth/refresh", { data: { refreshToken: session.refreshToken } });
    expect(refresh.status()).toBe(401);
    const denied = await ctx.post("auth/login", { data: { username: input.username, password: E2E.password } });
    expect((await denied.json()).code).toBe("ACCOUNT_DEACTIVATED");

    const twice = await admin.delete(`users/${created.id}`);
    expect((await twice.json()).code).toBe("USER_ALREADY_DEACTIVATED");

    const back = await admin.post(`users/${created.id}/reactivate`);
    expect(back.status()).toBe(200);
    expect(await back.json()).toMatchObject({ active: true, deactivationReason: null });
    expect((await lastAudit("USER_REACTIVATED", adminId))?.entityId).toBe(created.id);
    expect((await ctx.post("auth/login", { data: { username: input.username, password: E2E.password } })).status()).toBe(200);
    await ctx.dispose();
  });

  test("no puedes darte de baja a ti mismo → 400", async () => {
    const res = await admin.delete(`users/${adminId}`);
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("CANNOT_DEACTIVATE_SELF");
  });

  test("desbloquear limpia el lockout de intentos fallidos", async () => {
    const input = newUser("lock");
    const created = await (await admin.post("users", { data: input })).json();
    const ctx = await anon();
    for (let i = 0; i < 5; i++) {
      await ctx.post("auth/login", { data: { username: input.username, password: "incorrecta" } });
    }
    const listed = await (await admin.get(`users/${created.id}`)).json();
    expect(listed.locked).toBe(true);

    const res = await admin.post(`users/${created.id}/unlock`);
    expect(res.status()).toBe(200);
    expect((await res.json()).locked).toBe(false);
    expect((await ctx.post("auth/login", { data: { username: input.username, password: E2E.password } })).status()).toBe(200);

    const again = await admin.post(`users/${created.id}/unlock`);
    expect((await again.json()).code).toBe("USER_NOT_LOCKED");
    await ctx.dispose();
  });
});

test.describe("contraseña temporal y cambio de contraseña", () => {
  test("el admin asigna una temporal: cierra sesiones y obliga a cambiarla", async () => {
    const input = newUser("temp");
    const created = await (await admin.post("users", { data: input })).json();
    // La primera contraseña ya obliga a cambiarla; se simula que la persona ya lo hizo.
    await db.user.update({ where: { id: created.id }, data: { mustChangePassword: false } });
    const before = await login(input.username);

    const temporary = `${E2E.password}-temp`;
    const res = await admin.post(`users/${created.id}/reset-password`, { data: { password: temporary } });
    expect(res.status()).toBe(200);
    expect((await res.json()).mustChangePassword).toBe(true);
    const log = await lastAudit("USER_PASSWORD_RESET", adminId);
    expect(log?.entityId).toBe(created.id);
    expect(JSON.stringify(log)).not.toContain(temporary);

    const ctx = await anon();
    expect((await ctx.post("auth/refresh", { data: { refreshToken: before.refreshToken } })).status()).toBe(401);
    expect((await ctx.post("auth/login", { data: { username: input.username, password: E2E.password } })).status()).toBe(401);
    await ctx.dispose();

    const { api, session } = await loginAs(input.username, temporary);
    expect(session.user.mustChangePassword).toBe(true);

    // Cambio propio: exige la actual, no permite repetirla y emite tokens nuevos.
    const wrong = await api.post("auth/change-password", {
      data: { currentPassword: "no-es-esta", newPassword: `${E2E.password}-nueva` },
    });
    expect((await wrong.json()).code).toBe("CURRENT_PASSWORD_INVALID");
    const reused = await api.post("auth/change-password", {
      data: { currentPassword: temporary, newPassword: temporary },
    });
    expect((await reused.json()).code).toBe("PASSWORD_REUSED");

    const changed = await api.post("auth/change-password", {
      data: { currentPassword: temporary, newPassword: `${E2E.password}-nueva` },
    });
    expect(changed.status()).toBe(200);
    expect((await changed.json()).token).toBeTruthy();
    await api.dispose();

    const fresh = await login(input.username, `${E2E.password}-nueva`);
    expect(fresh.user.mustChangePassword).toBe(false);
  });
});
