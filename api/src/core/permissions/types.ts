/**
 * Tipos base del motor de permisos. `Scope` se declara como literal propio (sin
 * importar Prisma) para que el runner unitario no cargue el cliente.
 */
export type Scope = "NONE" | "OWN" | "AREA" | "ALL";

export const SCOPES: readonly Scope[] = ["NONE", "OWN", "AREA", "ALL"];

export interface PermissionDef {
  key: string;
  module: string;
  name: string;
  scopes: Scope[];
  sensitive: boolean;
  active: boolean;
  sortOrder: number;
}

export interface RoleDef {
  key: string;
  name: string;
  module: string | null;
  staff: boolean;
  system: boolean;
  active: boolean;
  sortOrder: number;
}
