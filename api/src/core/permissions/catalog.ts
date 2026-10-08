import type { PrismaClient } from "@prisma/client";
import { SCOPES, type PermissionDef, type Scope } from "./types";

/**
 * Catálogo de permisos del sistema. La fuente única de verdad es la tabla
 * `permissions`: el código solo mantiene una cache en memoria que se llena
 * desde la BD (o desde los fixtures en la semilla). Sin catálogo cargado no
 * existe ningún permiso válido y todo queda cerrado (fail-closed).
 */

/** Fila cruda (Prisma o fixture) previa a la normalización. */
export interface CatalogRow {
  key?: unknown;
  module?: unknown;
  name?: unknown;
  scopes?: unknown;
  sensitive?: unknown;
  active?: unknown;
  sortOrder?: unknown;
}

const isScope = (v: unknown): v is Scope =>
  typeof v === "string" && (SCOPES as readonly string[]).includes(v);

/**
 * Normaliza filas a `PermissionDef`. **Puro.** Descarta las filas que no
 * cumplen el formato (sin clave/módulo/nombre o con `scopes` vacío o fuera del
 * enum). Los campos opcionales toman su default.
 */
export const catalogFromRows = (rows: ReadonlyArray<CatalogRow>): PermissionDef[] => {
  const out: PermissionDef[] = [];
  for (const row of rows) {
    if (!row) continue;
    const { key, module, name } = row;
    if (typeof key !== "string" || !key.trim()) continue;
    if (typeof module !== "string" || !module.trim()) continue;
    if (typeof name !== "string" || !name.trim()) continue;
    if (!Array.isArray(row.scopes) || row.scopes.length === 0) continue;
    if (!row.scopes.every(isScope)) continue;
    out.push({
      key,
      module,
      name,
      scopes: [...row.scopes],
      sensitive: row.sensitive === true,
      active: row.active !== false,
      sortOrder:
        typeof row.sortOrder === "number" && Number.isInteger(row.sortOrder) ? row.sortOrder : 0,
    });
  }
  return out;
};

let catalog: PermissionDef[] = [];
let activeKeys = new Set<string>();
const definitions = new Map<string, PermissionDef>();

/** Catálogo vigente (BD si ya se cargó; vacío si no). */
export const getCatalog = (): PermissionDef[] => catalog;

/** Reemplaza el catálogo vigente y recalcula claves activas e índice. */
export const setCatalog = (list: PermissionDef[]): void => {
  catalog = list;
  activeKeys = new Set(list.filter((p) => p.active).map((p) => p.key));
  definitions.clear();
  for (const permission of list) definitions.set(permission.key, permission);
};

/** Deja el catálogo vacío (fail-closed). */
export const resetCatalog = (): void => {
  setCatalog([]);
};

/** ¿Existe un permiso activo con esa clave? */
export const isPermission = (key: string): boolean => activeKeys.has(key);

/** Claves de los permisos activos. */
export const catalogKeys = (): string[] => [...activeKeys];

/** Definición de un permiso (activo o no), o `undefined` si no está en el catálogo. */
export const definitionOf = (key: string): PermissionDef | undefined => definitions.get(key);

/** Lee `permissions` y deja el catálogo en cache. */
export const loadCatalogFromDb = async (db: PrismaClient): Promise<void> => {
  const rows = await db.permission.findMany({
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });
  setCatalog(
    catalogFromRows(
      rows.map((row) => ({
        key: row.key,
        module: row.module,
        name: row.name,
        scopes: row.scopes,
        sensitive: row.sensitive,
        active: row.active,
        sortOrder: row.sortOrder,
      }))
    )
  );
};

/**
 * Siembra el catálogo de forma idempotente: inserta solo lo que falta
 * (`skipDuplicates`), nunca pisa filas existentes. Devuelve cuántas insertó.
 */
export const seedCatalog = async (
  db: PrismaClient,
  rows: ReadonlyArray<PermissionDef>
): Promise<number> => {
  const { count } = await db.permission.createMany({
    data: rows.map((row) => ({
      key: row.key,
      module: row.module,
      name: row.name,
      scopes: row.scopes,
      sensitive: row.sensitive,
      active: row.active,
      sortOrder: row.sortOrder,
    })),
    skipDuplicates: true,
  });
  return count;
};
