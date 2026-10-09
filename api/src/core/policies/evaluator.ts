import type {
  PolicyActor,
  PolicyConditionDef,
  PolicyDecision,
  PolicyDef,
} from "./types";

/**
 * Evaluación ABAC. **Pura**: recibe políticas, actor y contexto y decide.
 *
 * - Solo cuentan las políticas activas de la acción cuyo rol aplica al actor
 *   (sin roles = aplica a todos).
 * - Se recorren por `priority` ascendente (empate: `key`); la **primera** cuyas
 *   condiciones se cumplen todas decide con su efecto.
 * - Sin coincidencia → se permite (el RBAC ya autorizó).
 */

const USER_REF = /^@user\.(id|username|roles)$/;

/** Lee `a.b.c` de un objeto plano. */
export const readPath = (source: unknown, path: string): unknown => {
  let node: unknown = source;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
};

/** Sustituye `"@user.*"` por el dato del actor; deja el resto igual. */
export const resolveValue = (value: unknown, actor: PolicyActor): unknown => {
  if (typeof value === "string") {
    const match = USER_REF.exec(value);
    if (match) {
      const field = match[1] as "id" | "username" | "roles";
      return field === "roles" ? [...actor.roles] : actor[field];
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, actor));
  return value;
};

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

const same = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((item) => b.includes(item))
    : a === b;

const compare = (a: unknown, b: unknown): number | null => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return null;
};

/** ¿Se cumple una condición sobre el contexto? */
export const conditionHolds = (
  condition: PolicyConditionDef,
  context: unknown,
  actor: PolicyActor
): boolean => {
  const actual = readPath(context, condition.field);
  const expected = resolveValue(condition.value, actor);

  switch (condition.operator) {
    case "eq":
      return same(actual, expected);
    case "neq":
      return !same(actual, expected);
    case "in":
      // Un arreglo "está en" la lista si alguno de sus elementos lo está.
      return asList(actual).some((item) => asList(expected).includes(item));
    case "not_in":
      return !asList(actual).some((item) => asList(expected).includes(item));
    case "contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.includes(expected);
      }
      return Array.isArray(actual) && asList(expected).some((item) => actual.includes(item));
    case "not_contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return !actual.includes(expected);
      }
      return !(Array.isArray(actual) && asList(expected).some((item) => actual.includes(item)));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const diff = compare(actual, expected);
      if (diff === null) return false;
      if (condition.operator === "gt") return diff > 0;
      if (condition.operator === "gte") return diff >= 0;
      if (condition.operator === "lt") return diff < 0;
      return diff <= 0;
    }
    case "exists":
      return (actual !== undefined && actual !== null) === (expected !== false);
    default:
      // Operador desconocido: la condición no se cumple (la política no casa).
      return false;
  }
};

/** Políticas candidatas para la acción y el actor, en orden de evaluación. */
export const candidatePolicies = (
  policies: ReadonlyArray<PolicyDef>,
  action: string,
  actor: PolicyActor
): PolicyDef[] =>
  policies
    .filter((policy) => policy.active && policy.action === action)
    .filter((policy) => policy.roles.length === 0 || policy.roles.some((role) => actor.roles.includes(role)))
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));

/** Decide la acción para el actor y el contexto. */
export const evaluatePolicies = (
  policies: ReadonlyArray<PolicyDef>,
  action: string,
  actor: PolicyActor,
  context: unknown
): PolicyDecision => {
  for (const policy of candidatePolicies(policies, action, actor)) {
    if (policy.conditions.every((condition) => conditionHolds(condition, context, actor))) {
      return {
        allowed: policy.effect === "ALLOW",
        policy: { key: policy.key, effect: policy.effect, action: policy.action },
      };
    }
  }
  return { allowed: true, policy: null };
};
