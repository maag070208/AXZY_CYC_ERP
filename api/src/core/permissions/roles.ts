import type { PrismaClient } from "@prisma/client";
import type { RoleDef } from "./types";

/**
 * Catálogo de roles del sistema. Viven en la tabla `roles` y se administran
 * desde la consola `/permissions` (permiso `roles.manage`). Igual que el
 * catálogo de permisos, el código solo mantiene una cache en memoria que se
 * llena desde la BD: sin roles cargados no hay rol válido (fail-closed).
 *
 * `staff` marca los roles con expediente de personal; `system` protege los
 * roles base de borrado/renombrado.
 */

/** Fila cruda (Prisma o fixture) previa a la normalización. */
export interface RoleRow {
  key?: unknown;
  name?: unknown;
  module?: unknown;
  staff?: unknown;
  system?: unknown;
  active?: unknown;
  sortOrder?: unknown;
}

/** Rol por defecto al crear una cuenta sin roles explícitos. */
export const DEFAULT_ROLE_KEY = "STUDENT";

/** Normaliza filas a `RoleDef`. **Puro.** Descarta filas inválidas. */
export const rolesFromRows = (rows: ReadonlyArray<RoleRow>): RoleDef[] => {
  const out: RoleDef[] = [];
  for (const row of rows) {
    if (!row) continue;
    const { key, name } = row;
    if (typeof key !== "string" || !key.trim()) continue;
    if (typeof name !== "string" || !name.trim()) continue;
    out.push({
      key,
      name,
      module: typeof row.module === "string" ? row.module : null,
      staff: row.staff === true,
      system: row.system === true,
      active: row.active !== false,
      sortOrder:
        typeof row.sortOrder === "number" && Number.isInteger(row.sortOrder) ? row.sortOrder : 0,
    });
  }
  return out;
};

let roles: RoleDef[] = [];
let activeKeys = new Set<string>();
const definitions = new Map<string, RoleDef>();

/** Roles vigentes (BD si ya se cargó; vacío si no). */
export const getRoles = (): RoleDef[] => roles;

/** Reemplaza la cache de roles y recalcula claves activas e índice. */
export const setRoles = (list: RoleDef[]): void => {
  roles = list;
  activeKeys = new Set(list.filter((r) => r.active).map((r) => r.key));
  definitions.clear();
  for (const role of list) definitions.set(role.key, role);
};

/** Deja la cache de roles vacía (fail-closed). */
export const resetRoles = (): void => {
  setRoles([]);
};

/** ¿Existe un rol activo con esa clave? */
export const isRole = (key: string): boolean => activeKeys.has(key);

/** Claves de los roles activos. */
export const roleKeys = (): string[] => [...activeKeys];

/** Definición de un rol (activo o no), o `undefined` si no existe. */
export const definitionOfRole = (key: string): RoleDef | undefined => definitions.get(key);

/** Claves de los roles activos con expediente de personal. */
export const staffRoleKeys = (): string[] => roles.filter((r) => r.active && r.staff).map((r) => r.key);

/** Lee `roles` y deja la cache cargada. */
export const loadRolesFromDb = async (db: PrismaClient): Promise<void> => {
  const rows = await db.role.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  setRoles(rolesFromRows(rows));
};
