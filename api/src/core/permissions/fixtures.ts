import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { resolveSeedDataDir } from "../utils/seed-data-dir";
import {
  catalogFromRows,
  seedCatalog,
  type CatalogRow,
  type PermissionDef,
} from "./catalog";
import { rolesFromRows, type RoleDef, type RoleRow } from "./roles";
import { loadPermissionsFromDb } from "./matrix";
import { SCOPES, type Scope } from "./types";

/**
 * Fixtures del catálogo de roles, del catálogo de permisos y de la matriz
 * rol → permiso → alcance. Replican `prisma/seed-data/roles.json`,
 * `permissions.json` y `role_permissions.json`. Se resuelven en runtime para no
 * tocar el disco al importar el módulo.
 */

const dataDir = (): string => resolveSeedDataDir(path.join(__dirname, "..", ".."));

const readFixture = (name: string): unknown => {
  const file = path.join(dataDir(), `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
};

const isScope = (v: unknown): v is Scope =>
  typeof v === "string" && (SCOPES as readonly string[]).includes(v);

/** Catálogo de roles normalizado desde `roles.json`. */
export const loadRolesFixture = (): RoleDef[] => {
  const raw = readFixture("roles");
  const rows = Array.isArray(raw) ? (raw as RoleRow[]) : [];
  const roles = rolesFromRows(rows);
  const discarded = rows.length - roles.length;
  if (discarded > 0) logger.warn(`roles.json: ${discarded} invalid row(s) discarded`);
  return roles;
};

/** Catálogo de permisos normalizado desde `permissions.json`. */
export const loadPermissionsFixture = (): PermissionDef[] => {
  const raw = readFixture("permissions");
  const rows = Array.isArray(raw) ? (raw as CatalogRow[]) : [];
  const catalog = catalogFromRows(rows);
  const discarded = rows.length - catalog.length;
  if (discarded > 0) logger.warn(`permissions.json: ${discarded} invalid row(s) discarded`);
  return catalog;
};

export interface RolePermissionFixtureRow {
  roleKey: string;
  permissionKey: string;
  scope: Scope;
}

/** Matriz normalizada desde `role_permissions.json`, descartando filas inválidas. */
export const loadRolePermissionsFixture = (): RolePermissionFixtureRow[] => {
  const raw = readFixture("role_permissions");
  if (!Array.isArray(raw)) return [];
  const rows: RolePermissionFixtureRow[] = [];
  for (const row of raw as Array<Record<string, unknown>>) {
    const roleKey = row?.roleKey;
    const permissionKey = row?.permissionKey;
    const scope = row?.scope;
    if (typeof roleKey !== "string" || typeof permissionKey !== "string" || !isScope(scope)) {
      logger.warn(`role_permissions.json: invalid row ${JSON.stringify(row)}`);
      continue;
    }
    rows.push({ roleKey, permissionKey, scope });
  }
  return rows;
};

/**
 * Siembra roles, catálogo y matriz desde los fixtures (insert-missing) y deja
 * las caches cargadas. Idempotente: nunca pisa filas existentes.
 */
export const seedPermissionsFromFixtures = async (db: PrismaClient): Promise<void> => {
  // Los roles van primero: la matriz tiene FK a `roles.key`.
  await db.role.createMany({
    data: loadRolesFixture(),
    skipDuplicates: true,
  });
  await seedCatalog(db, loadPermissionsFixture());
  await db.rolePermission.createMany({
    data: loadRolePermissionsFixture().map((row) => ({
      roleKey: row.roleKey,
      permissionKey: row.permissionKey,
      scope: row.scope,
    })),
    skipDuplicates: true,
  });
  await loadPermissionsFromDb(db);
};
