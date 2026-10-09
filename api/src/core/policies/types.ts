/**
 * Tipos del motor ABAC. Sin dependencias de Prisma para que el runner unitario
 * evalúe políticas sin cargar el cliente.
 */
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

export interface PolicyConditionDef {
  field: string;
  operator: PolicyOperator;
  /** Literal JSON o referencia al actor (`"@user.id"`, `"@user.roles"`). */
  value: unknown;
}

export interface PolicyDef {
  id: string;
  key: string;
  name: string;
  action: string;
  effect: PolicyEffect;
  /** Menor número = se evalúa antes. */
  priority: number;
  active: boolean;
  /** Roles a los que aplica; vacío = a todos. */
  roles: string[];
  conditions: PolicyConditionDef[];
}

/** Actor de la petición, tal como lo ve una condición (`@user.*`). */
export interface PolicyActor {
  id: string;
  username: string;
  roles: readonly string[];
}

export interface PolicyDecision {
  allowed: boolean;
  /** Política que decidió; `null` si ninguna casó (se permite por defecto). */
  policy: Pick<PolicyDef, "key" | "effect" | "action"> | null;
}
