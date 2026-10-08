import type { PrismaClient } from "@prisma/client";
import { catalogKeys, loadCatalogFromDb } from "./catalog";
import { loadRolesFromDb } from "./roles";
import { SCOPES, type PermissionDef, type Scope } from "./types";

/**
 * Matriz rol → permiso → alcance en memoria.
 *
 * La fuente en runtime es la tabla `role_permissions`: se siembra insert-missing
 * (sin pisar ediciones) y se carga en esta cache. La cache arranca **vacía**:
 * sin datos no hay permisos y el resolvedor devuelve NONE (fail-closed).
 */

export type RoleMatrix = Record<string, Partial<Record<string, Scope>>>;

/** Fila tal como la devuelve `role_permissions` (clave sin tipar). */
export interface MatrixRow {
  roleKey: string;
  permissionKey: string;
  scope: string;
}

const isScope = (v: string): v is Scope => (SCOPES as readonly string[]).includes(v);

let cache: RoleMatrix = {};

/** Matriz vigente (BD si ya se cargó; vacía si no). */
export const getMatrix = (): RoleMatrix => cache;

/** Reemplaza la matriz vigente (la carga desde BD usa esto). */
export const setMatrix = (matrix: RoleMatrix): void => {
  cache = matrix;
};

/** Deja la matriz vacía (fail-closed). */
export const resetMatrix = (): void => {
  cache = {};
};

/** Descarta la matriz cargada hasta la próxima carga. */
export const invalidateMatrix = (): void => {
  setMatrix({});
};

/**
 * Construye la matriz desde filas de `role_permissions`. **Puro.** Ignora las
 * claves que no estén en el catálogo **activo** y las filas con alcance NONE
 * (la ausencia de fila ya significa NONE).
 */
export const matrixFromRows = (
  rows: ReadonlyArray<MatrixRow>,
  catalog?: ReadonlyArray<PermissionDef>
): RoleMatrix => {
  const activeKeys = catalog
    ? new Set(catalog.filter((p) => p.active).map((p) => p.key))
    : new Set(catalogKeys());
  const matrix: RoleMatrix = {};
  for (const row of rows) {
    if (!activeKeys.has(row.permissionKey)) continue;
    if (row.scope === "NONE" || !isScope(row.scope)) continue;
    (matrix[row.roleKey] ??= {})[row.permissionKey] = row.scope;
  }
  return matrix;
};

/** Lee `role_permissions` (solo roles y permisos activos) y deja la matriz en cache. */
export const loadMatrixFromDb = async (db: PrismaClient): Promise<void> => {
  const rows = await db.rolePermission.findMany({
    where: { role: { active: true }, permission: { active: true } },
    select: { roleKey: true, permissionKey: true, scope: true },
  });
  setMatrix(matrixFromRows(rows));
};

/**
 * Carga catálogo, roles y matriz desde la BD. Se usa tras cada escritura y en
 * el arranque. Un rol inactivo desaparece de la matriz: sus permisos no
 * resuelven (fail-closed).
 */
export const loadPermissionsFromDb = async (db: PrismaClient): Promise<void> => {
  await Promise.all([loadCatalogFromDb(db), loadRolesFromDb(db)]);
  await loadMatrixFromDb(db);
};
