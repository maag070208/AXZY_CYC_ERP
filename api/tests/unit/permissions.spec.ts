import { test, expect } from "@playwright/test";
import {
  catalogFromRows,
  catalogKeys,
  definitionOf,
  isPermission,
  loadPermissionsFixture,
  loadRolePermissionsFixture,
  matrixFromRows,
  maxScope,
  permissionsOf,
  resetCatalog,
  resetMatrix,
  rolesOf,
  scopeAllows,
  scopeOf,
  setCatalog,
  setMatrix,
  withinScope,
  type Scope,
} from "../../src/core/permissions";

/**
 * El catálogo y la matriz viven en la BD (fixtures en pruebas): estas pruebas
 * los inyectan con `setCatalog`/`setMatrix` y verifican fail-closed con la cache
 * vacía.
 */

const user = (
  role: string,
  extra: Partial<{ id: string; roles: string[]; areaId: string | null }> = {}
) => ({
  id: extra.id ?? "user-1",
  role,
  roles: extra.roles,
  areaId: extra.areaId ?? null,
});

const loadFixtures = (): void => {
  setCatalog(catalogFromRows(loadPermissionsFixture()));
  setMatrix(matrixFromRows(loadRolePermissionsFixture()));
};

test.beforeEach(() => {
  resetCatalog();
  resetMatrix();
});

test.describe("catálogo en memoria", () => {
  test("arranca vacío y deja todo cerrado (fail-closed)", () => {
    expect(catalogKeys()).toEqual([]);
    expect(isPermission("users.view")).toBe(false);
    expect(scopeOf(user("ADMIN"), "users.view")).toBe("NONE");
    expect(permissionsOf(user("ADMIN"))).toEqual({});
  });

  test("catalogFromRows normaliza y descarta filas inválidas", () => {
    const defs = catalogFromRows([
      { key: "users.view", module: "Usuarios", name: "Ver", scopes: ["ALL"], sensitive: true, sortOrder: 3 },
      { key: "", module: "M", name: "N", scopes: ["ALL"] },
      { key: "x.y", module: "M", name: "N", scopes: [] },
      { key: "z.w", module: "M", name: "N", scopes: ["NOPE"] },
      { key: "q.r", module: "M", name: "N", scopes: ["NONE", "ALL"], sortOrder: 2.5 },
    ]);
    expect(defs.map((d) => d.key)).toEqual(["users.view", "q.r"]);
    expect(defs[0]).toEqual({
      key: "users.view",
      module: "Usuarios",
      name: "Ver",
      scopes: ["ALL"],
      sensitive: true,
      active: true,
      sortOrder: 3,
    });
    expect(defs[1].sortOrder).toBe(0);
  });

  test("isPermission solo reconoce permisos activos", () => {
    setCatalog(
      catalogFromRows([
        { key: "a.active", module: "M", name: "N", scopes: ["ALL"], active: true },
        { key: "a.inactive", module: "M", name: "N", scopes: ["ALL"], active: false },
      ])
    );
    expect(isPermission("a.active")).toBe(true);
    expect(isPermission("a.inactive")).toBe(false);
    expect(definitionOf("a.inactive")?.key).toBe("a.inactive");
    expect(definitionOf("no.existe")).toBeUndefined();
  });
});

test.describe("matriz en memoria", () => {
  test("matrixFromRows ignora claves fuera del catálogo activo y los NONE", () => {
    setCatalog(
      catalogFromRows([
        { key: "users.view", module: "M", name: "N", scopes: ["ALL"] },
        { key: "users.edit", module: "M", name: "N", scopes: ["ALL"], active: false },
      ])
    );
    const matrix = matrixFromRows([
      { roleKey: "ADMIN", permissionKey: "users.view", scope: "ALL" },
      { roleKey: "ADMIN", permissionKey: "users.edit", scope: "ALL" },
      { roleKey: "ALUMNO", permissionKey: "users.view", scope: "NONE" },
      { roleKey: "ALUMNO", permissionKey: "no.existe", scope: "ALL" },
    ]);
    expect(matrix.ADMIN).toEqual({ "users.view": "ALL" });
    expect(matrix.ALUMNO).toBeUndefined();
  });
});

test.describe("resolvedor con fixtures reales", () => {
  test.beforeEach(loadFixtures);

  test("ADMIN tiene todos los permisos en ALL", () => {
    const admin = permissionsOf(user("ADMIN"));
    expect(Object.keys(admin).sort()).toEqual(catalogKeys().sort());
    expect(Object.values(admin).every((scope) => scope === "ALL")).toBe(true);
  });

  test("CONTROL_ESCOLAR opera alumnos y expediente; solo lee configuración", () => {
    const perms = permissionsOf(user("CONTROL_ESCOLAR"));
    for (const key of ["students.create", "students.movements", "documents.validate", "kardex.export", "teachers.edit"]) {
      expect(perms[key], key).toBe("ALL");
    }
    expect(perms["config.view"]).toBe("ALL");
    expect(scopeOf(user("CONTROL_ESCOLAR"), "teachers.create")).toBe("NONE");
    expect(scopeOf(user("CONTROL_ESCOLAR"), "config.manage")).toBe("NONE");
    expect(scopeOf(user("CONTROL_ESCOLAR"), "audit.view")).toBe("NONE");
    expect(scopeOf(user("CONTROL_ESCOLAR"), "users.view")).toBe("NONE");
  });

  test("PROFESOR y ALUMNO solo ven lo de su ámbito, sin administración", () => {
    expect(permissionsOf(user("PROFESOR"))).toEqual({
      "students.view": "AREA",
      "teachers.view": "OWN",
      "teachers.edit": "OWN",
      "documents.view": "AREA",
      "kardex.view": "AREA",
      "kardex.export": "AREA",
      "terms.view": "ALL",
      "courses.view": "AREA",
      "groups.view": "AREA",
      "enrollments.view": "AREA",
      "assessments.view": "AREA",
      "assessments.manage": "AREA",
      "grades.view": "AREA",
      "grades.capture": "AREA",
      "grades.export": "AREA",
    });
    expect(permissionsOf(user("ALUMNO"))).toEqual({
      "students.view": "OWN",
      "documents.view": "OWN",
      "kardex.view": "OWN",
      "kardex.export": "OWN",
      "groups.view": "OWN",
      "enrollments.view": "OWN",
      "assessments.view": "OWN",
      "grades.view": "OWN",
    });
  });

  test("el alcance mayor gana al combinar roles", () => {
    const multi = user("ALUMNO", { roles: ["ALUMNO", "ADMIN"] });
    expect(scopeOf(multi, "roles.manage")).toBe("ALL");
  });

  test("una excepción vigente gana sobre el rol", () => {
    const u = {
      ...user("ALUMNO"),
      exceptions: [{ permission: "users.view", scope: "ALL" as Scope }],
    };
    expect(scopeOf(u, "users.view")).toBe("ALL");
  });

  test("una excepción vencida se ignora", () => {
    const u = {
      ...user("ADMIN"),
      exceptions: [
        { permission: "users.view", scope: "NONE" as Scope, expiresAt: new Date(Date.now() - 1000) },
      ],
    };
    expect(scopeOf(u, "users.view")).toBe("ALL");
  });

  test("maxScope y rolesOf", () => {
    expect(maxScope("OWN", "AREA")).toBe("AREA");
    expect(maxScope("ALL", "OWN")).toBe("ALL");
    expect(rolesOf(user("ALUMNO", { roles: ["ALUMNO", "PROFESOR"] }))).toEqual(["ALUMNO", "PROFESOR"]);
  });
});

test.describe("alcance por registro", () => {
  test("NONE/ALL y OWN", () => {
    const u = user("PROFESOR", { id: "u1" });
    expect(withinScope(u, "NONE", { ownerId: "u1" })).toBe(false);
    expect(withinScope(u, "ALL", { ownerId: "x" })).toBe(true);
    expect(withinScope(u, "OWN", { ownerId: "u1" })).toBe(true);
    expect(withinScope(u, "OWN", { ownerId: "x" })).toBe(false);
    expect(scopeAllows(u, "users.view", { ownerId: "u1" })).toBe(false);
  });

  test("AREA incluye lo propio y su área (o cae a OWN sin área)", () => {
    const withArea = user("PROFESOR", { id: "u1", areaId: "a1" });
    expect(withinScope(withArea, "AREA", { ownerId: "x", areaId: "a1" })).toBe(true);
    expect(withinScope(withArea, "AREA", { ownerId: "x", areaId: "a2" })).toBe(false);
    const noArea = user("PROFESOR", { id: "u1", areaId: null });
    expect(withinScope(noArea, "AREA", { ownerId: "u1" })).toBe(true);
    expect(withinScope(noArea, "AREA", { ownerId: "x", areaId: "a1" })).toBe(false);
  });
});
