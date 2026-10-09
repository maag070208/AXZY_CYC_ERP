import { scopeOf, type UserPermissions } from "./resolver";
import type { Scope } from "./types";

/**
 * Alcance por registro aplicado en la consulta (`AND`), nunca en el cliente.
 *
 * - `ALL`  → sin filtro.
 * - `OWN`  → lo vinculado a la persona (p. ej. el alumno con su `userId`).
 * - `AREA` → lo de su ámbito, que resuelve el módulo dueño del ámbito (M07
 *   registrará los alumnos de los grupos del profesor). Mientras nadie registre
 *   un resolvedor, `AREA` se comporta como `OWN` (fail-closed).
 * - `NONE` → nada.
 */
export type AreaResolver = (user: UserPermissions) => Promise<string[]>;

const areaResolvers = new Map<string, AreaResolver>();

/** Registra cómo se resuelve el ámbito `AREA` de un recurso (`students`, …). */
export const registerAreaResolver = (resource: string, resolver: AreaResolver): void => {
  areaResolvers.set(resource, resolver);
};

export interface ScopeFilterSpec<W> {
  resource: string;
  permission: string;
  /** Filtro de "lo propio" para la persona. */
  own: (user: UserPermissions) => W;
  /** Filtro por ids del ámbito (`AREA`). */
  byIds: (ids: string[]) => W;
  /** Combina filtros con OR. */
  or: (filters: W[]) => W;
  /** Filtro que no devuelve nada. */
  none: W;
}

/**
 * Filtro Prisma para el alcance de `permission` del usuario; `null` = `ALL`
 * (sin restricción). El servicio lo agrega con `AND` a su propio `where`.
 */
export const scopeWhere = async <W>(user: UserPermissions, spec: ScopeFilterSpec<W>): Promise<W | null> => {
  const scope: Scope = scopeOf(user, spec.permission);
  if (scope === "ALL") return null;
  if (scope === "NONE") return spec.none;
  if (scope === "OWN") return spec.own(user);
  const resolver = areaResolvers.get(spec.resource);
  const ids = resolver ? await resolver(user) : [];
  return spec.or([spec.own(user), spec.byIds(ids)]);
};
