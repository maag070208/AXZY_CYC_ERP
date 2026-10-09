import type { Scope } from "@entities/user";
import { api } from "@shared/api/client";

/** Permiso del catálogo tal como lo expone la administración (incluye inactivos). */
export interface PermissionCatalog {
  key: string;
  module: string;
  name: string;
  scopes: Scope[];
  sensitive: boolean;
  active: boolean;
  sortOrder: number;
}

/** Rol del sistema con su número de cuentas. */
export interface RoleAdmin {
  key: string;
  name: string;
  module: string | null;
  staff: boolean;
  system: boolean;
  active: boolean;
  sortOrder: number;
  userCount: number;
}

/** Celda vigente de la matriz rol → permiso → alcance. */
export interface MatrixCell {
  roleKey: string;
  permissionKey: string;
  scope: Scope;
}

/** Payload de `GET /permissions/admin`. */
export interface PermissionAdminData {
  /** Claves de rol en orden. */
  roles: string[];
  catalog: PermissionCatalog[];
  matrix: MatrixCell[];
}

/** Body de `POST /permissions/roles`. */
export interface RoleCreateDto {
  key: string;
  name: string;
  module?: string;
  staff?: boolean;
  sortOrder?: number;
  /** Duplicar: el rol nuevo arranca con la matriz de este rol. */
  copyFrom?: string;
}

/** Body de `PATCH /permissions/roles/:key`. */
export interface RoleUpdateDto {
  name?: string;
  module?: string | null;
  staff?: boolean;
  active?: boolean;
  sortOrder?: number;
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

// --- Políticas ABAC ----------------------------------------------------------

export type PolicyEffect = "ALLOW" | "DENY";

export const POLICY_OPERATORS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "contains",
  "not_contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
] as const;
export type PolicyOperator = (typeof POLICY_OPERATORS)[number];

export type PolicyValue = string | number | boolean | null | Array<string | number>;

export interface PolicyCondition {
  field: string;
  operator: PolicyOperator;
  value: PolicyValue;
}

export interface Policy {
  id: string;
  key: string;
  name: string;
  description: string | null;
  action: string;
  effect: PolicyEffect;
  priority: number;
  active: boolean;
  roles: string[];
  conditions: PolicyCondition[];
  createdAt: string;
  updatedAt: string;
}

export interface PolicyInput {
  key?: string;
  name: string;
  description?: string | null;
  action: string;
  effect: PolicyEffect;
  priority?: number;
  active?: boolean;
  roles?: string[];
  conditions?: PolicyCondition[];
}

/** Acción registrada que admite políticas y los campos que puede leer. */
export interface PolicyAction {
  key: string;
  module: string;
  description: string;
  fields: Array<{ path: string; type: string; description: string }>;
}

export const permissionApi = {
  /** Catálogo activo, para resolver nombres de permiso. */
  catalog: () => api.get<PermissionCatalog[]>("/permissions/catalog"),
  /** Roles, catálogo completo y matriz (`roles.manage`). */
  admin: () => api.get<PermissionAdminData>("/permissions/admin"),
  /** Roles con conteo de cuentas. */
  roles: () => api.get<RoleAdmin[]>("/permissions/roles"),
  createRole: (dto: RoleCreateDto) => api.post<RoleAdmin>("/permissions/roles", dto),
  updateRole: (key: string, dto: RoleUpdateDto) =>
    api.patch<RoleAdmin>(`/permissions/roles/${key}`, dto),
  deleteRole: (key: string) => api.delete<void>(`/permissions/roles/${key}`),
  /** Aplica un lote de celdas de la matriz. */
  saveMatrix: (changes: MatrixChange[]) =>
    api.put<MatrixSaveResult>("/permissions/matrix", { changes }),
  policyActions: () => api.get<PolicyAction[]>("/permissions/policies/actions"),
  policies: () => api.get<Policy[]>("/permissions/policies"),
  createPolicy: (dto: PolicyInput) => api.post<Policy>("/permissions/policies", dto),
  updatePolicy: (id: string, dto: Partial<PolicyInput>) =>
    api.patch<Policy>(`/permissions/policies/${id}`, dto),
  deletePolicy: (id: string) => api.delete<void>(`/permissions/policies/${id}`),
};
