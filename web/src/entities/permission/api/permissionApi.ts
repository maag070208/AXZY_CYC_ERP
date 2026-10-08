import type { Scope } from "@entities/user";
import { api } from "@shared/api/client";

/** Permiso del catálogo tal como lo expone la administración (incluye inactivos). */
export interface PermissionCatalog {
  key: string;
  module: string;
  name: string;
  description: string | null;
  scopes: Scope[];
  sensitive: boolean;
  active: boolean;
  sortOrder: number;
}

/** Rol del sistema tal como lo expone la administración. */
export interface RoleAdmin {
  key: string;
  name: string;
  description: string | null;
  module: string | null;
  staff: boolean;
  system: boolean;
  active: boolean;
  sortOrder: number;
  userCount?: number;
}

/** Celda vigente de la matriz rol → permiso → alcance. */
export interface MatrixCell {
  roleKey: string;
  permissionKey: string;
  scope: Scope;
}

/** Payload de `GET /permissions/admin`. */
export interface PermissionAdminData {
  roles: RoleAdmin[];
  catalog: PermissionCatalog[];
  matrix: MatrixCell[];
}

/** Body de `POST /permissions/roles`. */
export interface RoleCreateDto {
  key: string;
  name: string;
  description?: string;
  module?: string;
  staff?: boolean;
  sortOrder?: number;
  /** Duplicar: el rol nuevo arranca con la matriz de este rol. */
  copyFrom?: string;
}

/** Cambio de una celda de la matriz (`PUT /permissions/matrix`). */
export interface MatrixChange {
  roleKey: string;
  permissionKey: string;
  scope: Scope;
}

export interface MatrixSaveResult {
  updated: number;
}

export const permissionApi = {
  /** Catálogo activo, para resolver nombres de permiso. */
  catalog: () => api.get<PermissionCatalog[]>("/permissions/catalog"),
  /** Roles, catálogo completo y matriz (`roles.manage`). */
  admin: () => api.get<PermissionAdminData>("/permissions/admin"),
  /** Roles con conteo de cuentas. */
  roles: () => api.get<RoleAdmin[]>("/permissions/roles"),
  /** Alta de un rol (`roles.manage`). */
  createRole: (dto: RoleCreateDto) => api.post<RoleAdmin>("/permissions/roles", dto),
  /** Aplica un lote de celdas de la matriz. */
  saveMatrix: (changes: MatrixChange[]) =>
    api.put<MatrixSaveResult>("/permissions/matrix", { changes }),
  /** Recarga la cache de RBAC/ABAC en el servidor tras editar la matriz. */
  reload: () => api.post<{ reloaded: boolean }>("/permissions/reload"),
};
