import type { Scope } from "@core/permissions";

export interface PermissionCatalog {
  key: string;
  module: string;
  name: string;
  scopes: Scope[];
  sensitive: boolean;
  active: boolean;
  sortOrder: number;
}

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

export interface MatrixCell {
  roleKey: string;
  permissionKey: string;
  scope: Scope;
}

export interface PermissionsAdminData {
  roles: string[];
  catalog: PermissionCatalog[];
  matrix: MatrixCell[];
}
