import type { Scope } from "@core/permissions";

export interface UserRoleLink {
  role: { key: string; name: string; sortOrder: number };
}

/** Usuario listo para responder (rol principal derivado de `user_roles`). */
export interface UserEntity {
  id: string;
  username: string;
  email: string;
  name: string;
  phone: string | null;
  active: boolean;
  role: string;
  roles: string[];
  lastLoginAt: Date | null;
  deactivatedAt: Date | null;
  deactivationReason: string | null;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Excepción de permiso por persona, con su alcance efectivo. */
export interface UserPermissionView {
  permission: string;
  module: string;
  name: string;
  scopes: Scope[];
  sensitive: boolean;
  /** Lo que da el rol (sin excepción). */
  roleScope: Scope;
  /** Lo que resuelve al final (con excepción vigente). */
  effective: Scope;
  exception: {
    scope: Scope;
    reason: string | null;
    expiresAt: string | null;
    grantedById: string | null;
  } | null;
}

export interface UserPermissionsView {
  roles: string[];
  permissions: UserPermissionView[];
}
