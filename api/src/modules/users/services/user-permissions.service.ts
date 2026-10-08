import type { PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import {
  definitionOfRole,
  getCatalog,
  getMatrix,
  isPermission,
  isRole,
  maxScope,
  scopeOf,
  type Scope,
} from "@core/permissions";
import type { AuthenticatedUser } from "@core/utils/security";
import type { AuditLogger } from "@modules/audit";
import type { UserPermissionView, UserPermissionsView } from "../models/entity/user.entity";

const EXCEPTION_DEFAULT_DAYS = 30;

export interface SetExceptionInput {
  scope: Scope;
  reason?: string;
  /** ISO date o `null` para sin vencimiento; ausente = vigencia global. */
  expiresAt?: string | null;
}

type UserRow = {
  id: string;
  roles: Array<{ role: { key: string; active: boolean; sortOrder: number } }>;
  permissions: Array<{
    permissionKey: string;
    scope: Scope;
    reason: string | null;
    expiresAt: Date | null;
    grantedById: string | null;
  }>;
};

export class UserPermissionsService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private async loadUser(id: string): Promise<UserRow> {
    const user = (await this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        roles: {
          select: { role: { select: { key: true, active: true, sortOrder: true } } },
          orderBy: { role: { sortOrder: "asc" as const } },
        },
        permissions: {
          select: {
            permissionKey: true,
            scope: true,
            reason: true,
            expiresAt: true,
            grantedById: true,
          },
        },
      },
    })) as unknown as UserRow | null;
    if (!user) throw new HttpError(404, "USER_NOT_FOUND");
    return user;
  }

  private roleKeysOf(user: UserRow): string[] {
    return user.roles.filter((link) => link.role.active).map((link) => link.role.key);
  }

  private roleScopeOf(roles: readonly string[], permission: string): Scope {
    const matrix = getMatrix();
    let scope: Scope = "NONE";
    for (const role of roles) scope = maxScope(scope, matrix[role]?.[permission] ?? "NONE");
    return scope;
  }

  /** Catálogo activo con el alcance del rol, la excepción y el efectivo. */
  async list(userId: string): Promise<UserPermissionsView> {
    const user = await this.loadUser(userId);
    const roles = this.roleKeysOf(user);
    const now = Date.now();

    type ExceptionRow = UserRow["permissions"][number];
    const exceptions = new Map<string, ExceptionRow>(
      user.permissions.map((exception) => [exception.permissionKey, exception])
    );

    const permissions: UserPermissionView[] = getCatalog()
      .filter((permission) => permission.active)
      .map((permission) => {
        const grant = exceptions.get(permission.key);
        const effective = scopeOf(
          {
            id: user.id,
            role: roles[0] ?? "",
            roles,
            exceptions: user.permissions
              .filter((exception) => !exception.expiresAt || exception.expiresAt.getTime() > now)
              .map((exception) => ({
                permission: exception.permissionKey,
                scope: exception.scope,
                expiresAt: exception.expiresAt,
              })),
          },
          permission.key
        );
        return {
          permission: permission.key,
          module: permission.module,
          name: permission.name,
          scopes: permission.scopes,
          sensitive: permission.sensitive,
          roleScope: this.roleScopeOf(roles, permission.key),
          effective,
          exception: grant
            ? {
                scope: grant.scope,
                reason: grant.reason,
                expiresAt: grant.expiresAt?.toISOString() ?? null,
                grantedById: grant.grantedById,
              }
            : null,
        };
      });

    return { roles, permissions };
  }

  private async defaultExpiry(): Promise<Date | null> {
    if (EXCEPTION_DEFAULT_DAYS <= 0) return null;
    return new Date(Date.now() + EXCEPTION_DEFAULT_DAYS * 24 * 60 * 60 * 1000);
  }

  /** Reemplaza los roles del usuario (multi-rol). */
  async setRoles(userId: string, roles: string[], actor: AuthenticatedUser): Promise<UserPermissionsView> {
    if (actor.id === userId) throw new HttpError(409, "CANNOT_CHANGE_OWN_PERMISSIONS");

    const next = [...new Set(roles)];
    for (const key of next) {
      if (!isRole(key)) {
        if (definitionOfRole(key)) throw new HttpError(400, "ROLE_INACTIVE", { key });
        throw new HttpError(400, "INVALID_ROLE", { role: key });
      }
    }

    await this.db.$transaction(async (tx) => {
      const current = await tx.userRole.findMany({ where: { userId }, select: { roleKey: true } });
      const before = new Set(current.map((link) => link.roleKey));
      const after = new Set(next);

      await tx.userRole.deleteMany({ where: { userId } });
      if (next.length > 0) {
        await tx.userRole.createMany({
          data: next.map((roleKey) => ({ userId, roleKey })),
          skipDuplicates: true,
        });
      }

      for (const key of next) {
        if (!before.has(key)) {
          await this.audit?.(
            { action: "USER_ROLE_ADDED", entityType: "UserRole", entityId: `${userId}|${key}`, userId: actor.id, userName: actor.username, newState: { role: key } },
            tx
          );
        }
      }
      for (const key of before) {
        if (!after.has(key)) {
          await this.audit?.(
            { action: "USER_ROLE_REMOVED", entityType: "UserRole", entityId: `${userId}|${key}`, userId: actor.id, userName: actor.username, previousState: { role: key } },
            tx
          );
        }
      }
    });

    return this.list(userId);
  }

  /** Alta/actualización de una excepción de permiso. */
  async setException(
    userId: string,
    permission: string,
    input: SetExceptionInput,
    actor: AuthenticatedUser
  ): Promise<UserPermissionsView> {
    if (actor.id === userId) throw new HttpError(409, "CANNOT_CHANGE_OWN_PERMISSIONS");

    const definition = getCatalog().find((p) => p.key === permission);
    if (!isPermission(permission) || !definition) {
      throw new HttpError(400, "PERMISSION_DOES_NOT_EXIST", { permission });
    }
    const valid = new Set<string>([...definition.scopes, "NONE"]);
    if (!valid.has(input.scope)) {
      throw new HttpError(400, "INVALID_SCOPE_FOR_PERMISSION", { permission, scope: input.scope });
    }
    if (definition.sensitive && scopeOf(actor, permission) !== "ALL") {
      throw new HttpError(403, "SENSITIVE_PERMISSION_REQUIRES_ADMIN", { permission });
    }

    const expiresAt =
      input.expiresAt === undefined
        ? await this.defaultExpiry()
        : input.expiresAt === null
          ? null
          : new Date(input.expiresAt);

    await this.db.$transaction(async (tx) => {
      const previous = await tx.userPermission.findUnique({
        where: { userId_permissionKey: { userId, permissionKey: permission } },
      });
      await tx.userPermission.upsert({
        where: { userId_permissionKey: { userId, permissionKey: permission } },
        create: {
          userId,
          permissionKey: permission,
          scope: input.scope,
          reason: input.reason ?? null,
          expiresAt,
          grantedById: actor.id,
        },
        update: {
          scope: input.scope,
          reason: input.reason ?? null,
          expiresAt,
          grantedById: actor.id,
        },
      });
      await this.audit?.(
        {
          action: "PERMISSION_EXCEPTION_SET",
          entityType: "UserPermission",
          entityId: `${userId}|${permission}`,
          userId: actor.id,
          userName: actor.username,
          previousState: previous ? { scope: previous.scope } : undefined,
          newState: { scope: input.scope, expiresAt: expiresAt?.toISOString() ?? null },
          metadata: { reason: input.reason ?? null },
        },
        tx
      );
    });

    return this.list(userId);
  }

  /** Quita la excepción de un permiso. */
  async removeException(
    userId: string,
    permission: string,
    actor: { id: string; username: string }
  ): Promise<UserPermissionsView> {
    if (actor.id === userId) throw new HttpError(409, "CANNOT_CHANGE_OWN_PERMISSIONS");

    const existing = await this.db.userPermission.findUnique({
      where: { userId_permissionKey: { userId, permissionKey: permission } },
    });
    if (!existing) throw new HttpError(404, "PERMISSION_EXCEPTION_NOT_FOUND", { permission });

    await this.db.$transaction(async (tx) => {
      await tx.userPermission.delete({
        where: { userId_permissionKey: { userId, permissionKey: permission } },
      });
      await this.audit?.(
        {
          action: "PERMISSION_EXCEPTION_REMOVED",
          entityType: "UserPermission",
          entityId: `${userId}|${permission}`,
          userId: actor.id,
          userName: actor.username,
          previousState: { scope: existing.scope },
        },
        tx
      );
    });

    return this.list(userId);
  }
}
