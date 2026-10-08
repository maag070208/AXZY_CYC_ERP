import { useSelector } from "react-redux";
import type { Permission, PermissionMap, Scope } from "./types";

/**
 * Forma mínima del estado que necesita el hook. Se declara aquí en vez de
 * importar `RootState` de `@app/store` porque los `entities` no pueden depender
 * de `app` (regla FSD en `eslint.config.js`).
 */
interface AuthStateLike {
  auth: { user: { role?: string; permissions?: PermissionMap } | null };
}

const NO_PERMISSIONS: PermissionMap = {};

/** Mapa completo de permisos de la sesión (para decidir sobre varios a la vez). */
export const usePermissions = (): PermissionMap =>
  useSelector((state: AuthStateLike) => state.auth.user?.permissions ?? NO_PERMISSIONS);

/** Rol principal de la sesión. */
export const useCurrentRole = (): string | null =>
  useSelector((state: AuthStateLike) => state.auth.user?.role ?? null);

/** Alcance efectivo del permiso para la sesión actual (NONE si no aplica). */
export const usePermission = (permission: Permission): Scope =>
  useSelector(
    (state: AuthStateLike) => state.auth.user?.permissions?.[permission] ?? "NONE"
  );

/** ¿La sesión actual tiene el permiso con cualquier alcance? */
export const useCan = (permission: Permission): boolean =>
  usePermission(permission) !== "NONE";

/** Helper puro para decidir sobre un mapa de permisos ya cargado. */
export const can = (
  permissions: PermissionMap | undefined,
  permission: Permission
): boolean => (permissions?.[permission] ?? "NONE") !== "NONE";

/** Alcance efectivo puro desde un mapa de permisos ya cargado. */
export const scopeOf = (
  permissions: PermissionMap | undefined,
  permission: Permission
): Scope => permissions?.[permission] ?? "NONE";
