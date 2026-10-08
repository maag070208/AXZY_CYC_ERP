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
  /** Idioma del sistema (`sys_config.LANGUAGE`). */
  language?: AppLanguage;
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

/** Usuario del listado server-side. */
export interface User extends AuthUser {
  active: boolean;
  email?: string | null;
}

/** `POST /users`. */
export interface CreateUserInput {
  username: string;
  name: string;
  email?: string;
  password: string;
  role?: UserRole;
  roles?: UserRole[];
  active?: boolean;
}

/** `PATCH /users/:id`. */
export interface UpdateUserInput {
  username?: string;
  name?: string;
  email?: string | null;
  role?: UserRole;
  roles?: UserRole[];
  active?: boolean;
}

/** `PUT /users/:id/permissions` (roles y excepciones por persona). */
export interface SetUserPermissionsInput {
  roles?: UserRole[];
  permissions?: PermissionMap;
}
