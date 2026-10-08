import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { hashPassword } from "@core/utils/security";
import { HttpError } from "@core/middlewares/error.middleware";
import { definitionOfRole, isRole, roleKeys } from "@core/permissions";
import { paginatedQuery } from "@core/db/table";
import {
  filterBool,
  filterId,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
} from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import type { UserCreateInput, UserUpdateInput } from "../models/dto/user.dto";
import type { UserEntity } from "../models/entity/user.entity";
import type { User } from "../models/dto/user.dto";

const userSelect = () => ({
  id: true,
  username: true,
  email: true,
  name: true,
  phone: true,
  active: true,
  lastLoginAt: true,
  deactivatedAt: true,
  deactivationReason: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: { role: { select: { key: true, name: true, sortOrder: true } } },
    orderBy: { role: { sortOrder: "asc" as const } },
  },
});

type UserRow = {
  id: string;
  username: string;
  email: string;
  name: string;
  phone: string | null;
  active: boolean;
  lastLoginAt: Date | null;
  deactivatedAt: Date | null;
  deactivationReason: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{ role: { key: string; name: string; sortOrder: number } }>;
};

const toEntity = (row: UserRow): UserEntity => {
  const roles = row.roles.map((link) => link.role.key);
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    name: row.name,
    phone: row.phone,
    active: row.active,
    role: roles[0] ?? "",
    roles,
    lastLoginAt: row.lastLoginAt,
    deactivatedAt: row.deactivatedAt,
    deactivationReason: row.deactivationReason,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const toDto = (entity: UserEntity): User => ({
  id: entity.id,
  username: entity.username,
  email: entity.email,
  name: entity.name,
  phone: entity.phone,
  active: entity.active,
  role: entity.role,
  roles: entity.roles,
  lastLoginAt: entity.lastLoginAt?.toISOString() ?? null,
  deactivatedAt: entity.deactivatedAt?.toISOString() ?? null,
  deactivationReason: entity.deactivationReason,
  mustChangePassword: entity.mustChangePassword,
  createdAt: entity.createdAt.toISOString(),
});

export class UserService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  /** Valida que todas las claves de rol existan y estén activas. */
  private assertRoles(roles: readonly string[]): void {
    for (const key of new Set(roles)) {
      if (!isRole(key)) {
        if (definitionOfRole(key)) throw new HttpError(400, "ROLE_INACTIVE", { key });
        throw new HttpError(400, "INVALID_ROLE", { role: key });
      }
    }
  }

  async list() {
    const rows = (await this.db.user.findMany({
      select: userSelect(),
      orderBy: { name: "asc" },
    })) as unknown as UserRow[];
    return rows.map((row) => toDto(toEntity(row)));
  }

  async getById(id: string): Promise<User> {
    const row = (await this.db.user.findUnique({
      where: { id },
      select: userSelect(),
    })) as unknown as UserRow | null;
    if (!row) throw new HttpError(404, "USER_NOT_FOUND");
    return toDto(toEntity(row));
  }

  async table(params: ITDataTableFetchParams): Promise<ITDataTableResponse<User>> {
    const { filters } = params;
    const roleFilter = filterId(filters, "role");

    const where: Record<string, unknown> = {
      username: filterText(filters, "username"),
      name: filterText(filters, "name"),
      email: filterText(filters, "email"),
      active: filterBool(filters, "active"),
    };
    for (const key of Object.keys(where)) {
      if (where[key] === undefined) delete where[key];
    }
    if (roleFilter) where.roles = { some: { roleKey: roleFilter } };

    const orderBy = orderByOf(
      params.sort,
      {
        username: "username",
        name: "name",
        email: "email",
        active: "active",
        createdAt: "createdAt",
      },
      [{ name: "asc" }]
    );

    const result = await paginatedQuery<UserRow>({
      model: this.db.user,
      where,
      orderBy,
      select: userSelect(),
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map((row) => toDto(toEntity(row))), total: result.total };
  }

  async create(input: UserCreateInput, actorId: string, actorName?: string): Promise<User> {
    const usernameTaken = await this.db.user.findUnique({ where: { username: input.username } });
    if (usernameTaken) throw new HttpError(409, "USERNAME_TAKEN");
    const emailTaken = await this.db.user.findUnique({ where: { email: input.email } });
    if (emailTaken) throw new HttpError(409, "EMAIL_TAKEN");

    const roles = [...new Set(input.roles)];
    this.assertRoles(roles);

    const passwordHash = await hashPassword(input.password);

    const created = await this.db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: input.username,
          email: input.email,
          passwordHash,
          name: input.name,
          phone: input.phone ?? null,
          mustChangePassword: true,
        },
        select: { id: true },
      });
      await tx.userRole.createMany({
        data: roles.map((roleKey) => ({ userId: user.id, roleKey })),
        skipDuplicates: true,
      });
      await this.audit?.(
        {
          action: "USER_CREATED",
          entityType: "User",
          entityId: user.id,
          userId: actorId,
          userName: actorName ?? null,
          newState: {
            username: input.username,
            name: input.name,
            email: input.email,
            roles,
          },
        },
        tx
      );
      return user.id;
    });

    return this.getById(created);
  }

  async update(
    id: string,
    input: UserUpdateInput,
    actorId: string,
    actorName?: string
  ): Promise<User> {
    const previous = (await this.db.user.findUnique({
      where: { id },
      select: userSelect(),
    })) as unknown as UserRow | null;
    if (!previous) throw new HttpError(404, "USER_NOT_FOUND");

    if (input.email && input.email !== previous.email) {
      const emailTaken = await this.db.user.findFirst({
        where: { email: input.email, NOT: { id } },
      });
      if (emailTaken) throw new HttpError(409, "EMAIL_TAKEN");
    }
    if (input.roles) this.assertRoles(input.roles);

    const data: Prisma.UserUpdateInput = {};
    if (input.email !== undefined) data.email = input.email;
    if (input.name !== undefined) data.name = input.name;
    if (input.phone !== undefined) data.phone = input.phone;

    await this.db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.user.update({ where: { id }, data });
      }
      if (input.roles) {
        const roles = [...new Set(input.roles)];
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map((roleKey) => ({ userId: id, roleKey })),
          skipDuplicates: true,
        });
      }
      await this.audit?.(
        {
          action: "USER_UPDATED",
          entityType: "User",
          entityId: id,
          userId: actorId,
          userName: actorName ?? null,
          previousState: {
            email: previous.email,
            name: previous.name,
            phone: previous.phone,
            roles: previous.roles.map((link) => link.role.key),
          },
          newState: {
            email: input.email ?? previous.email,
            name: input.name ?? previous.name,
            phone: input.phone !== undefined ? input.phone : previous.phone,
            roles: input.roles ?? previous.roles.map((link) => link.role.key),
          },
        },
        tx
      );
    });

    return this.getById(id);
  }

  /** Baja lógica: `active=false` + `deactivatedAt`/`deactivationReason`. */
  async deactivate(
    id: string,
    actorId: string,
    actorName?: string,
    reason?: string
  ): Promise<User> {
    if (id === actorId) throw new HttpError(400, "CANNOT_DEACTIVATE_SELF");

    const previous = (await this.db.user.findUnique({
      where: { id },
      select: userSelect(),
    })) as unknown as UserRow | null;
    if (!previous) throw new HttpError(404, "USER_NOT_FOUND");
    if (!previous.active) throw new HttpError(409, "USER_ALREADY_DEACTIVATED");

    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          active: false,
          deactivatedAt: new Date(),
          deactivationReason: reason ?? null,
        },
      });
      // Cerrar sesiones vigentes del usuario.
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit?.(
        {
          action: "USER_DEACTIVATED",
          entityType: "User",
          entityId: id,
          userId: actorId,
          userName: actorName ?? null,
          previousState: { active: true },
          newState: { active: false, deactivationReason: reason ?? null },
          metadata: { reason: reason ?? null },
        },
        tx
      );
    });

    return this.getById(id);
  }

  /** Claves de rol válidas (para validaciones de controller o importación). */
  validRoleKeys(): string[] {
    return roleKeys();
  }
}
