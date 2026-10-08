import { catalogKeys, isPermission } from "./catalog";
import { getMatrix } from "./matrix";
import type { Scope } from "./types";

/**
 * Excepción de permiso de un usuario. Reemplaza lo que dice su rol.
 * Una excepción vencida se ignora.
 */
export interface PermissionException {
  permission: string;
  scope: Scope;
  expiresAt?: Date | null;
}

export interface UserPermissions {
  id: string;
  /** Rol principal. */
  role: string;
  /** Roles adicionales (multi-rol). Los permisos efectivos son la unión. */
  roles?: readonly string[];
  /** Ámbito del usuario para el alcance AREA (M02 no lo usa todavía). */
  areaId?: string | null;
  /** Excepciones por persona. */
  exceptions?: ReadonlyArray<PermissionException>;
}

/** Orden de alcances de menor a mayor, para combinar varios roles. */
const SCOPE_RANK: Record<Scope, number> = {
  NONE: 0,
  OWN: 1,
  AREA: 2,
  ALL: 3,
};

/** El alcance mayor de dos (los roles se suman, nunca se restan). */
export const maxScope = (a: Scope, b: Scope): Scope => (SCOPE_RANK[b] > SCOPE_RANK[a] ? b : a);

/** Roles del usuario: el principal + los adicionales (sin duplicados). */
export const rolesOf = (user: UserPermissions): string[] => {
  const extra = user.roles ?? [];
  return [...new Set([user.role, ...extra])];
};

const current = (exception: PermissionException, now: number): boolean =>
  !exception.expiresAt || exception.expiresAt.getTime() > now;

/**
 * Permiso efectivo = excepción vigente > unión de roles > NONE. Con varios
 * roles, el alcance es el mayor de todos.
 *
 * Un permiso que no está en el catálogo **activo** no significa nada: devuelve
 * NONE aunque la matriz traiga una fila vieja (fail-closed).
 */
export const scopeOf = (user: UserPermissions, permission: string): Scope => {
  const now = Date.now();
  const exception = user.exceptions?.find(
    (e) => e.permission === permission && current(e, now)
  );
  if (exception) return exception.scope;
  if (!isPermission(permission)) return "NONE";
  const matrix = getMatrix();
  let scope: Scope = "NONE";
  for (const role of rolesOf(user)) {
    scope = maxScope(scope, matrix[role]?.[permission] ?? "NONE");
  }
  return scope;
};

/** ¿El usuario tiene el permiso con cualquier alcance distinto de NONE? */
export const canAnyScope = (user: UserPermissions, permission: string): boolean =>
  scopeOf(user, permission) !== "NONE";

/** Todos los permisos efectivos del usuario, omitiendo los NONE. */
export const permissionsOf = (user: UserPermissions): Record<string, Scope> => {
  const result: Record<string, Scope> = {};
  for (const permission of catalogKeys()) {
    const scope = scopeOf(user, permission);
    if (scope !== "NONE") result[permission] = scope;
  }
  return result;
};
