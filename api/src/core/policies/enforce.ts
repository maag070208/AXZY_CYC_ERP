import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { getPolicies } from "./cache";
import { evaluatePolicies } from "./evaluator";
import type { PolicyActor, PolicyDecision } from "./types";

/**
 * Aplica las políticas ABAC de una acción **después** del RBAC. Si una política
 * DENY casa: audita `ACCESS_DENIED` (en segundo plano) y responde
 * `403 POLICY_DENIED`.
 */
export const enforcePolicy = (
  action: string,
  actor: PolicyActor,
  context: Record<string, unknown>
): PolicyDecision => {
  const decision = evaluatePolicies(getPolicies(), action, actor, context);
  if (!decision.allowed) {
    void prismaClient.auditLog
      .create({
        data: {
          action: "ACCESS_DENIED",
          entityType: "Policy",
          entityId: decision.policy?.key ?? null,
          userId: actor.id,
          userName: actor.username,
          metadata: { policyAction: action },
        },
      })
      .catch(() => undefined);
    throw new HttpError(403, "POLICY_DENIED", { policy: decision.policy?.key ?? "" });
  }
  return decision;
};
