import type { AppLanguage } from "@shared/i18n/config";

/** Clave del rol (dinámico, tabla `roles` de la API). */
export type UserRole = string;

/** Alcance efectivo de un permiso (ver docs/seguridad/roles-permisos.md §2). */
export type Scope = "NONE" | "OWN" | "AREA" | "ALL";

/**
 * Clave del catálogo dinámico de permisos del API (`GET /permissions/catalog`).
 * Vive en la BD y puede crecer sin recompilar la web (`modulo.accion`).
 */
export type Permission = string;

/** Mapa `{ permiso: alcance }`; la API solo incluye los distintos de NONE. */
export type PermissionMap = Partial<Record<Permission, Scope>>;

/** Persona autenticada, tal como la devuelve `/auth/login` y `/auth/me`. */
export interface AuthUser {
  id: string;
  username: string;
  name: string;
  /** Rol principal. */
  role: UserRole;
  /** Roles efectivos: principal + adicionales. */
  roles?: UserRole[];
  /** Permisos efectivos; opcional porque la sesión persistida se rehidrata con `meThunk`. */
  permissions?: PermissionMap;
  /** Idioma del sistema (`settings.LANGUAGE`). */
  language?: AppLanguage;
  /** Contraseña temporal: la app obliga a cambiarla antes de seguir. */
  mustChangePassword?: boolean;
  active?: boolean;
}

/** `POST /auth/login`. */
export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * `GET /auth/me`: el usuario, sus roles, el mapa de permisos y el idioma van en
 * niveles separados; el slice los aplana sobre el usuario de la sesión.
 */
export interface MeResponse {
  user: AuthUser;
  roles: UserRole[];
  permissions: PermissionMap;
  language: AppLanguage;
}

/** `POST /auth/refresh`. */
export interface RefreshResponse {
  token: string;
  refreshToken: string;
}

/** Cuenta tal como la devuelve `/users` (listado, detalle y escrituras). */
export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  phone: string | null;
  active: boolean;
  /** Rol principal (el de menor `sortOrder`). */
  role: UserRole;
  roles: UserRole[];
  lastLoginAt: string | null;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  mustChangePassword: boolean;
  /** Bloqueo temporal vigente por intentos fallidos. */
  locked: boolean;
  lockedUntil: string | null;
  createdAt: string;
}

/** `POST /users`. */
export interface CreateUserInput {
  username: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  roles: UserRole[];
}

/** `PATCH /users/:id` (si vienen `roles`, reemplazan a los actuales). */
export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string | null;
  roles?: UserRole[];
}

/** Excepción de permiso por persona. */
export interface PermissionException {
  scope: Scope;
  reason: string | null;
  expiresAt: string | null;
  grantedById: string | null;
}

/** Fila de `GET /users/:id/permissions`: lo del rol, la excepción y el efectivo. */
export interface UserPermissionRow {
  permission: Permission;
  module: string;
  name: string;
  scopes: Scope[];
  sensitive: boolean;
  roleScope: Scope;
  effective: Scope;
  exception: PermissionException | null;
}

export interface UserPermissionsView {
  roles: UserRole[];
  permissions: UserPermissionRow[];
}

/** `PUT /users/:id/permissions` (roles y/o una excepción). */
export interface SetUserPermissionsInput {
  roles?: UserRole[];
  exception?: {
    permission: Permission;
    scope: Scope;
    reason?: string;
    /** ISO o `null` (sin vencimiento); ausente = vigencia por defecto. */
    expiresAt?: string | null;
  };
}
