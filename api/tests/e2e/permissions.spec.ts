import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import {
  E2E_ROLE_PREFIX,
  clearAccessE2E,
  clearAuthE2E,
  createAuthUser,
  db,
  lastAudit,
} from "./support/db";
import { login, loginAs } from "./support/http";

/**
 * Contrato de la consola de acceso (M02): roles dinámicos, matriz rol → permiso
 * → alcance (con anti-lockout) y políticas ABAC evaluadas después del RBAC.
 * Las políticas afectan a toda la API mientras existen: cada test borra la suya.
 */
assertSafeDatabase();

const RUN = newRunId();
const ROLE_KEY = `${E2E_ROLE_PREFIX}${RUN.toUpperCase()}`;
const ADMIN = { username: `${E2E_PREFIX}padmin_${RUN}`, name: "E2E Admin Acceso", roleKey: "ADMIN" };
const OTHER_ADMIN = { username: `${E2E_PREFIX}padmin2_${RUN}`, name: "E2E Otro Admin", roleKey: "ADMIN" };
const MEMBER = { username: `${E2E_PREFIX}pmember_${RUN}`, name: "E2E Miembro", roleKey: "STUDENT" };

let admin: APIRequestContext;
let adminId: string;
let otherAdminId: string;
let memberId: string;

test.beforeAll(async () => {
  adminId = (await createAuthUser({ ...ADMIN, password: E2E.password })).id;
  otherAdminId = (await createAuthUser({ ...OTHER_ADMIN, password: E2E.password })).id;
  memberId = (await createAuthUser({ ...MEMBER, password: E2E.password })).id;
  admin = (await loginAs(ADMIN.username)).api;
});

test.afterAll(async () => {
  // Si un test falló a medias, una política de prueba podría seguir en la cache
  // del servidor: se borra en la base y se pide la recarga antes de salir.
  await clearAccessE2E();
  await admin?.post("permissions/reload").catch(() => undefined);
  await admin?.dispose();
  await clearAuthE2E();
});

test.describe("roles", () => {
  test("crear rol duplicando otro copia su matriz; code y duplicado validados", async () => {
    const res = await admin.post("permissions/roles", {
      data: { key: ROLE_KEY, name: "E2E Rol", module: "Pruebas", copyFrom: "SCHOOL_CONTROL" },
    });
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ key: ROLE_KEY, system: false, active: true, userCount: 0 });
    const cells = await db.rolePermission.count({ where: { roleKey: ROLE_KEY, scope: { not: "NONE" } } });
    expect(cells).toBeGreaterThan(0);
    expect((await lastAudit("ROLE_CREATED", adminId))?.entityId).toBe(ROLE_KEY);

    const dup = await admin.post("permissions/roles", { data: { key: ROLE_KEY, name: "Otra vez" } });
    expect((await dup.json()).code).toBe("ROLE_KEY_TAKEN");
    const bad = await admin.post("permissions/roles", { data: { key: "minusculas", name: "x" } });
    expect((await bad.json()).code).toBe("INVALID_ROLE_KEY");
  });

  test("un rol de sistema no se renombra ni se borra", async () => {
    const rename = await admin.patch("permissions/roles/ADMIN", { data: { name: "Jefe" } });
    expect(rename.status()).toBe(409);
    expect((await rename.json()).code).toBe("ROLE_SYSTEM_PROTECTED");
    const remove = await admin.delete("permissions/roles/STUDENT");
    expect((await remove.json()).code).toBe("ROLE_SYSTEM_PROTECTED");
  });

  test("la matriz otorga un permiso y /auth/me lo refleja; quitarlo lo retira", async () => {
    // El miembro recibe el rol de prueba como rol adicional.
    const assign = await admin.put(`users/${memberId}/permissions`, { data: { roles: ["STUDENT", ROLE_KEY] } });
    expect(assign.status()).toBe(200);

    const grant = await admin.put("permissions/matrix", {
      data: { changes: [{ roleKey: ROLE_KEY, permissionKey: "audit.view", scope: "ALL" }] },
    });
    expect(grant.status()).toBe(200);
    expect((await lastAudit("ROLE_PERMISSIONS_UPDATED", adminId))?.entityId).toBe(`${ROLE_KEY}|audit.view`);

    const { api: member } = await loginAs(MEMBER.username);
    expect((await (await member.get("auth/me")).json()).permissions["audit.view"]).toBe("ALL");
    expect((await member.post("audit/query", { data: { page: 1, limit: 1 } })).status()).toBe(200);

    await admin.put("permissions/matrix", {
      data: { changes: [{ roleKey: ROLE_KEY, permissionKey: "audit.view", scope: "NONE" }] },
    });
    expect((await member.post("audit/query", { data: { page: 1, limit: 1 } })).status()).toBe(403);
    await member.dispose();
  });

  test("matriz: alcance fuera del catálogo → 400; anti-lockout de roles.manage → 409", async () => {
    const scope = await admin.put("permissions/matrix", {
      data: { changes: [{ roleKey: ROLE_KEY, permissionKey: "users.view", scope: "OWN" }] },
    });
    expect((await scope.json()).code).toBe("INVALID_SCOPE_FOR_PERMISSION");

    const lockout = await admin.put("permissions/matrix", {
      data: { changes: [{ roleKey: "ADMIN", permissionKey: "roles.manage", scope: "NONE" }] },
    });
    expect(lockout.status()).toBe(409);
    expect((await lockout.json()).code).toBe("ADMIN_PERMISSION_REQUIRED");
  });

  test("no se borra un rol con usuarios; sin usuarios sí", async () => {
    const busy = await admin.delete(`permissions/roles/${ROLE_KEY}`);
    expect(busy.status()).toBe(409);
    expect((await busy.json()).code).toBe("ROLE_HAS_USERS");

    await admin.put(`users/${memberId}/permissions`, { data: { roles: ["STUDENT"] } });
    const removed = await admin.delete(`permissions/roles/${ROLE_KEY}`);
    expect(removed.status()).toBe(204);
    expect((await lastAudit("ROLE_DELETED", adminId))?.entityId).toBe(ROLE_KEY);
  });

  test("sin roles.manage la consola responde 403", async () => {
    const { api } = await loginAs(MEMBER.username);
    expect((await api.get("permissions/admin")).status()).toBe(403);
    expect((await api.get("permissions/policies")).status()).toBe(403);
    await api.dispose();
  });
});

test.describe("excepciones por persona", () => {
  test("una excepción vigente gana sobre el rol; quitarla la retira", async () => {
    const set = await admin.put(`users/${memberId}/permissions`, {
      data: { exception: { permission: "audit.view", scope: "ALL", reason: "Auditoría externa" } },
    });
    expect(set.status()).toBe(200);
    const view = await set.json();
    const row = view.permissions.find((p: { permission: string }) => p.permission === "audit.view");
    expect(row).toMatchObject({ roleScope: "NONE", effective: "ALL" });
    expect(row.exception.expiresAt).not.toBeNull(); // vigencia por defecto

    const removed = await admin.delete(`users/${memberId}/permissions/audit.view`);
    const after = (await removed.json()).permissions.find((p: { permission: string }) => p.permission === "audit.view");
    expect(after).toMatchObject({ effective: "NONE", exception: null });
  });

  test("nadie altera sus propios permisos → 409", async () => {
    const res = await admin.put(`users/${adminId}/permissions`, {
      data: { exception: { permission: "audit.view", scope: "NONE" } },
    });
    expect((await res.json()).code).toBe("CANNOT_CHANGE_OWN_PERMISSIONS");
  });
});

test.describe("políticas ABAC", () => {
  const policyKey = (name: string) => `${E2E_PREFIX}${name}_${RUN}`;

  test("el registro de acciones expone campos; acción o campo desconocido → 400", async () => {
    const actions = await (await admin.get("permissions/policies/actions")).json();
    const deactivate = actions.find((a: { key: string }) => a.key === "users.deactivate");
    expect(deactivate.fields.map((f: { path: string }) => f.path)).toContain("target.roles");

    const unknownAction = await admin.post("permissions/policies", {
      data: { key: policyKey("x"), name: "x", action: "nada.hacer", effect: "DENY" },
    });
    expect((await unknownAction.json()).code).toBe("POLICY_ACTION_UNKNOWN");

    const unknownField = await admin.post("permissions/policies", {
      data: {
        key: policyKey("y"),
        name: "y",
        action: "users.deactivate",
        effect: "DENY",
        conditions: [{ field: "target.salario", operator: "gt", value: 1 }],
      },
    });
    expect((await unknownField.json()).code).toBe("POLICY_FIELD_UNKNOWN");
  });

  test("DENY: nadie da de baja a un ADMIN → 403 POLICY_DENIED auditado; borrarla lo permite", async () => {
    const created = await admin.post("permissions/policies", {
      data: {
        key: policyKey("no_baja_admin"),
        name: "No dar de baja administradores",
        action: "users.deactivate",
        effect: "DENY",
        priority: 10,
        conditions: [{ field: "target.roles", operator: "contains", value: "ADMIN" }],
      },
    });
    expect(created.status()).toBe(201);
    const policy = await created.json();
    expect((await lastAudit("POLICY_CREATED", adminId))?.entityId).toBe(policy.key);

    const denied = await admin.delete(`users/${otherAdminId}`);
    expect(denied.status()).toBe(403);
    expect((await denied.json()).code).toBe("POLICY_DENIED");
    await expect
      .poll(async () => (await lastAudit("ACCESS_DENIED", adminId))?.entityId ?? null)
      .toBe(policy.key);

    // Un ALUMNO sí se puede dar de baja: la condición no casa.
    const allowed = await admin.delete(`users/${memberId}`);
    expect(allowed.status()).toBe(200);
    await admin.post(`users/${memberId}/reactivate`);

    expect((await admin.delete(`permissions/policies/${policy.id}`)).status()).toBe(204);
    expect((await lastAudit("POLICY_DELETED", adminId))?.entityId).toBe(policy.key);
    const now = await admin.delete(`users/${otherAdminId}`);
    expect(now.status()).toBe(200);
    await admin.post(`users/${otherAdminId}/reactivate`);
  });

  test("la primera que casa por prioridad decide: ALLOW antes que DENY", async () => {
    const deny = await (
      await admin.post("permissions/policies", {
        data: {
          key: policyKey("deny_all_reset"),
          name: "Sin contraseñas temporales",
          action: "users.reset_password",
          effect: "DENY",
          priority: 50,
        },
      })
    ).json();
    const blocked = await admin.post(`users/${memberId}/reset-password`, { data: { password: `${E2E.password}-x` } });
    expect((await blocked.json()).code).toBe("POLICY_DENIED");

    const allow = await (
      await admin.post("permissions/policies", {
        data: {
          key: policyKey("allow_reset_alumno"),
          name: "Sí a alumnos",
          action: "users.reset_password",
          effect: "ALLOW",
          priority: 5,
          conditions: [{ field: "target.roles", operator: "in", value: ["STUDENT"] }],
        },
      })
    ).json();
    const ok = await admin.post(`users/${memberId}/reset-password`, { data: { password: `${E2E.password}-x` } });
    expect(ok.status()).toBe(200);
    // Para un ADMIN la ALLOW no casa y sigue la DENY.
    const other = await admin.post(`users/${otherAdminId}/reset-password`, { data: { password: `${E2E.password}-x` } });
    expect((await other.json()).code).toBe("POLICY_DENIED");

    // Desactivarla (PATCH) también la saca de la evaluación.
    const off = await admin.patch(`permissions/policies/${deny.id}`, { data: { active: false } });
    expect(off.status()).toBe(200);
    expect((await lastAudit("POLICY_UPDATED", adminId))?.entityId).toBe(deny.key);
    const free = await admin.post(`users/${otherAdminId}/reset-password`, { data: { password: `${E2E.password}-x` } });
    expect(free.status()).toBe(200);

    await admin.delete(`permissions/policies/${deny.id}`);
    await admin.delete(`permissions/policies/${allow.id}`);
  });

  test("las políticas pueden limitarse a un rol y referir al actor (@user.id)", async () => {
    // Solo para ADMIN: editar una cuenta ajena (target.id ≠ actor) → DENY.
    const policy = await (
      await admin.post("permissions/policies", {
        data: {
          key: policyKey("solo_propia"),
          name: "Solo la propia",
          action: "users.update",
          effect: "DENY",
          roles: ["ADMIN"],
          conditions: [{ field: "target.id", operator: "neq", value: "@user.id" }],
        },
      })
    ).json();
    expect(policy.roles).toEqual(["ADMIN"]);

    const other = await admin.patch(`users/${memberId}`, { data: { name: "E2E Ajeno" } });
    expect((await other.json()).code).toBe("POLICY_DENIED");
    const own = await admin.patch(`users/${adminId}`, { data: { name: "E2E Propio" } });
    expect(own.status()).toBe(200);

    await admin.delete(`permissions/policies/${policy.id}`);
    expect((await admin.patch(`users/${memberId}`, { data: { name: "E2E Ajeno" } })).status()).toBe(200);
  });

  test("code duplicada → 409 POLICY_KEY_TAKEN", async () => {
    const data = { key: policyKey("dup"), name: "Dup", action: "settings.update", effect: "ALLOW" };
    const first = await (await admin.post("permissions/policies", { data })).json();
    const again = await admin.post("permissions/policies", { data });
    expect((await again.json()).code).toBe("POLICY_KEY_TAKEN");
    await admin.delete(`permissions/policies/${first.id}`);
  });

  test("el login de un usuario de la consola sigue funcionando tras limpiar", async () => {
    // Sanidad: sin políticas de prueba, la sesión del miembro sigue viva.
    const session = await login(MEMBER.username, `${E2E.password}-x`);
    expect(session.token).toBeTruthy();
  });
});
