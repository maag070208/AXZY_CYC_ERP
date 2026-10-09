import type { PrismaClient } from "@prisma/client";
import { POLICY_OPERATORS, type PolicyDef, type PolicyOperator } from "./types";

/**
 * Cache en memoria de las políticas activas. Se llena desde la BD al arrancar
 * y tras cada escritura (junto con catálogo y matriz).
 */
let policies: PolicyDef[] = [];

export const getPolicies = (): PolicyDef[] => policies;

export const setPolicies = (list: PolicyDef[]): void => {
  policies = list;
};

export const resetPolicies = (): void => {
  policies = [];
};

const isOperator = (value: string): value is PolicyOperator =>
  (POLICY_OPERATORS as readonly string[]).includes(value);

/** Lee `policies` (+ condiciones y roles) y deja la cache cargada. */
export const loadPoliciesFromDb = async (db: PrismaClient): Promise<void> => {
  const rows = await db.policy.findMany({
    where: { active: true },
    include: {
      conditions: { orderBy: { sortOrder: "asc" } },
      roles: { select: { roleKey: true } },
    },
  });
  setPolicies(
    rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      action: row.action,
      effect: row.effect,
      priority: row.priority,
      active: row.active,
      roles: row.roles.map((link) => link.roleKey),
      conditions: row.conditions
        .filter((condition) => isOperator(condition.operator))
        .map((condition) => ({
          field: condition.field,
          operator: condition.operator as PolicyOperator,
          value: condition.value,
        })),
    }))
  );
};
