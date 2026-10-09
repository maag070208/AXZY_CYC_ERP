import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { definitionOfRole, loadPermissionsFromDb } from "@core/permissions";
import { POLICY_ACTIONS, isPolicyField, policyActionOf, type PolicyActionDef } from "@core/policies";
import type { AuditLogger } from "@modules/audit";
import type { PolicyCreateInput, PolicyUpdateInput, PolicyView } from "../models/dto/policy.dto";

const policyInclude = {
  conditions: { orderBy: { sortOrder: "asc" as const } },
  roles: { select: { roleKey: true }, orderBy: { roleKey: "asc" as const } },
};

type PolicyRow = Prisma.PolicyGetPayload<{ include: typeof policyInclude }>;

const toView = (row: PolicyRow): PolicyView => ({
  id: row.id,
  key: row.key,
  name: row.name,
  description: row.description,
  action: row.action,
  effect: row.effect,
  priority: row.priority,
  active: row.active,
  roles: row.roles.map((link) => link.roleKey),
  conditions: row.conditions.map((condition) => ({
    field: condition.field,
    operator: condition.operator as PolicyView["conditions"][number]["operator"],
    value: condition.value as PolicyView["conditions"][number]["value"],
  })),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Estado auditable (sin ids internos). */
const auditState = (view: PolicyView) => ({
  name: view.name,
  action: view.action,
  effect: view.effect,
  priority: view.priority,
  active: view.active,
  roles: view.roles,
  conditions: view.conditions,
});

/**
 * Políticas ABAC de la consola `/roles`. Valida contra el registro de acciones
 * (`core/policies/actions.ts`): solo acciones registradas y campos declarados.
 */
export class PolicyService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  actions(): readonly PolicyActionDef[] {
    return POLICY_ACTIONS;
  }

  async list(): Promise<PolicyView[]> {
    const rows = await this.db.policy.findMany({
      include: policyInclude,
      orderBy: [{ action: "asc" }, { priority: "asc" }, { key: "asc" }],
    });
    return rows.map(toView);
  }

  private async load(id: string): Promise<PolicyRow> {
    const row = await this.db.policy.findUnique({ where: { id }, include: policyInclude });
    if (!row) throw new HttpError(404, "POLICY_NOT_FOUND");
    return row;
  }

  private assertShape(action: string, roles: readonly string[], fields: readonly string[]): void {
    if (!policyActionOf(action)) throw new HttpError(400, "POLICY_ACTION_UNKNOWN", { action });
    for (const field of fields) {
      if (!isPolicyField(action, field)) {
        throw new HttpError(400, "POLICY_FIELD_UNKNOWN", { action, field });
      }
    }
    for (const role of roles) {
      if (!definitionOfRole(role)) throw new HttpError(400, "INVALID_ROLE", { role });
    }
  }

  async create(input: PolicyCreateInput, actor: { id: string; username: string }): Promise<PolicyView> {
    const roles = [...new Set(input.roles ?? [])];
    const conditions = input.conditions ?? [];
    this.assertShape(input.action, roles, conditions.map((c) => c.field));

    const taken = await this.db.policy.findUnique({ where: { key: input.key } });
    if (taken) throw new HttpError(409, "POLICY_KEY_TAKEN", { key: input.key });

    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.policy.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description ?? null,
          action: input.action,
          effect: input.effect,
          priority: input.priority ?? 100,
          active: input.active ?? true,
          roles: { create: roles.map((roleKey) => ({ roleKey })) },
          conditions: {
            create: conditions.map((condition, index) => ({
              field: condition.field,
              operator: condition.operator,
              value: condition.value as Prisma.InputJsonValue,
              sortOrder: index,
            })),
          },
        },
        include: policyInclude,
      });
      const view = toView(row);
      await this.audit?.(
        {
          action: "POLICY_CREATED",
          entityType: "Policy",
          entityId: row.key,
          userId: actor.id,
          userName: actor.username,
          newState: auditState(view),
        },
        tx
      );
      return view;
    });

    await loadPermissionsFromDb(this.db);
    return created;
  }

  async update(
    id: string,
    input: PolicyUpdateInput,
    actor: { id: string; username: string }
  ): Promise<PolicyView> {
    const previous = toView(await this.load(id));
    const action = input.action ?? previous.action;
    const roles = input.roles ? [...new Set(input.roles)] : previous.roles;
    const conditions = input.conditions ?? previous.conditions;
    this.assertShape(action, roles, conditions.map((c) => c.field));

    const updated = await this.db.$transaction(async (tx) => {
      if (input.roles) {
        await tx.policyRole.deleteMany({ where: { policyId: id } });
        if (roles.length > 0) {
          await tx.policyRole.createMany({ data: roles.map((roleKey) => ({ policyId: id, roleKey })) });
        }
      }
      if (input.conditions) {
        await tx.policyCondition.deleteMany({ where: { policyId: id } });
        if (conditions.length > 0) {
          await tx.policyCondition.createMany({
            data: conditions.map((condition, index) => ({
              policyId: id,
              field: condition.field,
              operator: condition.operator,
              value: condition.value as Prisma.InputJsonValue,
              sortOrder: index,
            })),
          });
        }
      }
      const row = await tx.policy.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.action !== undefined && { action: input.action }),
          ...(input.effect !== undefined && { effect: input.effect }),
          ...(input.priority !== undefined && { priority: input.priority }),
          ...(input.active !== undefined && { active: input.active }),
        },
        include: policyInclude,
      });
      const view = toView(row);
      await this.audit?.(
        {
          action: "POLICY_UPDATED",
          entityType: "Policy",
          entityId: row.key,
          userId: actor.id,
          userName: actor.username,
          previousState: auditState(previous),
          newState: auditState(view),
        },
        tx
      );
      return view;
    });

    await loadPermissionsFromDb(this.db);
    return updated;
  }

  async remove(id: string, actor: { id: string; username: string }): Promise<void> {
    const previous = toView(await this.load(id));
    await this.db.$transaction(async (tx) => {
      await tx.policy.delete({ where: { id } });
      await this.audit?.(
        {
          action: "POLICY_DELETED",
          entityType: "Policy",
          entityId: previous.key,
          userId: actor.id,
          userName: actor.username,
          previousState: auditState(previous),
        },
        tx
      );
    });
    await loadPermissionsFromDb(this.db);
  }
}
