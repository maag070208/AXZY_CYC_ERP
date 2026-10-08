import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { isRole, loadPermissionsFromDb, type Scope } from "@core/permissions";
import type { AuditLogger } from "@modules/audit";
import type {
  MatrixChange,
  PermissionCatalogCreateInput,
  PermissionCatalogUpdateInput,
  RoleCreateInput,
  RoleUpdateInput,
} from "../models/dto/permission.dto";
import type {
  PermissionCatalog,
  PermissionsAdminData,
  RoleAdmin,
} from "../models/entity/permission.entity";

const MATRIX_MAX = 500;
const PERMISSION_ADMIN = "roles.manage";

const toCatalog = (row: {
  key: string;
  module: string;
  name: string;
  scopes: Scope[];
  sensitive: boolean;
  active: boolean;
  sortOrder: number;
}): PermissionCatalog => ({
  key: row.key,
  module: row.module,
  name: row.name,
  scopes: [...row.scopes],
  sensitive: row.sensitive,
  active: row.active,
  sortOrder: row.sortOrder,
});

type RoleRow = {
  key: string;
  name: string;
  module: string | null;
  staff: boolean;
  system: boolean;
  active: boolean;
  sortOrder: number;
};

const toRoleAdmin = (row: RoleRow, userCount: number): RoleAdmin => ({
  key: row.key,
  name: row.name,
  module: row.module ?? null,
  staff: row.staff,
  system: row.system,
  active: row.active,
  sortOrder: row.sortOrder,
  userCount,
});

const roleStatus = (row: RoleRow) => ({
  name: row.name,
  module: row.module ?? null,
  staff: row.staff,
  active: row.active,
  sortOrder: row.sortOrder,
});

const catalogStatus = (row: {
  module: string;
  name: string;
  scopes: Scope[];
  sensitive: boolean;
  active: boolean;
  sortOrder: number;
}) => ({
  module: row.module,
  name: row.name,
  scopes: [...row.scopes],
  sensitive: row.sensitive,
  active: row.active,
  sortOrder: row.sortOrder,
});

/**
 * Administración del catálogo de roles, del catálogo de permisos y de la matriz
 * rol → permiso → alcance. El núcleo `@core/permissions` mantiene las caches en
 * memoria y este servicio las recarga tras cada escritura.
 */
export class PermissionService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  /** Roles, catálogo completo y matriz con alcance ≠ NONE. */
  async adminData(): Promise<PermissionsAdminData> {
    const [roles, catalog, matrix] = await Promise.all([
      this.db.role.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { key: true } }),
      this.db.permission.findMany({ orderBy: [{ module: "asc" }, { sortOrder: "asc" }] }),
      this.db.rolePermission.findMany({
        where: { scope: { not: "NONE" } },
        select: { roleKey: true, permissionKey: true, scope: true },
      }),
    ]);

    return {
      roles: roles.map((role) => role.key),
      catalog: catalog.map(toCatalog),
      matrix: matrix.map((row) => ({
        roleKey: row.roleKey,
        permissionKey: row.permissionKey,
        scope: row.scope as Scope,
      })),
    };
  }

  /** Catálogo activo, para que la web resuelva nombres de permiso. */
  async getActiveCatalog(): Promise<PermissionCatalog[]> {
    const rows = await this.db.permission.findMany({
      where: { active: true },
      orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
    });
    return rows.map(toCatalog);
  }

  private countRoleUsers(key: string): Promise<number> {
    return this.db.userRole.count({ where: { roleKey: key } });
  }

  /** Roles con el número de personas asignadas. */
  async listRoles(): Promise<RoleAdmin[]> {
    const rows = await this.db.role.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const counts = await Promise.all(rows.map((row) => this.countRoleUsers(row.key)));
    return rows.map((row, index) => toRoleAdmin(row, counts[index]));
  }

  async createRole(dto: RoleCreateInput, actorId: string): Promise<RoleAdmin> {
    const existing = await this.db.role.findUnique({ where: { key: dto.key } });
    if (existing) throw new HttpError(409, "ROLE_KEY_TAKEN", { key: dto.key });
    if (dto.copyFrom) {
      const source = await this.db.role.findUnique({ where: { key: dto.copyFrom } });
      if (!source) throw new HttpError(404, "ROLE_NOT_FOUND", { key: dto.copyFrom });
    }

    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.role.create({
        data: {
          key: dto.key,
          name: dto.name,
          module: dto.module ?? null,
          staff: dto.staff ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      const copied = dto.copyFrom
        ? await tx.rolePermission.findMany({
            where: { roleKey: dto.copyFrom, scope: { not: "NONE" } },
            select: { permissionKey: true, scope: true },
          })
        : [];
      if (copied.length > 0) {
        await tx.rolePermission.createMany({
          data: copied.map((cell) => ({
            roleKey: row.key,
            permissionKey: cell.permissionKey,
            scope: cell.scope,
          })),
        });
      }

      await this.audit?.(
        {
          action: "ROLE_CREATED",
          entityType: "Role",
          entityId: row.key,
          userId: actorId,
          newState: roleStatus(row),
          ...(dto.copyFrom ? { metadata: { copiedFrom: dto.copyFrom, permissions: copied.length } } : {}),
        },
        tx
      );
      return row;
    });

    await loadPermissionsFromDb(this.db);
    return toRoleAdmin(created, 0);
  }

  async updateRole(key: string, dto: RoleUpdateInput, actorId: string): Promise<RoleAdmin> {
    const previous = await this.db.role.findUnique({ where: { key } });
    if (!previous) throw new HttpError(404, "ROLE_NOT_FOUND", { key });

    // Un rol de sistema no se renombra ni se desactiva; sus permisos sí se editan.
    if (previous.system && (dto.name !== undefined || dto.active !== undefined)) {
      throw new HttpError(409, "ROLE_SYSTEM_PROTECTED", { key });
    }
    if (dto.active === false) await this.assertRolesManageSurvives(key);

    const data: Prisma.RoleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.module !== undefined) data.module = dto.module;
    if (dto.staff !== undefined) data.staff = dto.staff;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const previousState = roleStatus(previous);
    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.role.update({ where: { key }, data });
      await this.audit?.(
        {
          action: "ROLE_UPDATED",
          entityType: "Role",
          entityId: key,
          userId: actorId,
          previousState,
          newState: roleStatus(row),
        },
        tx
      );
      return row;
    });

    await loadPermissionsFromDb(this.db);
    return toRoleAdmin(updated, await this.countRoleUsers(key));
  }

  async deleteRole(key: string, actorId: string): Promise<void> {
    const role = await this.db.role.findUnique({ where: { key } });
    if (!role) throw new HttpError(404, "ROLE_NOT_FOUND", { key });
    if (role.system) throw new HttpError(409, "ROLE_SYSTEM_PROTECTED", { key });

    const userCount = await this.countRoleUsers(key);
    if (userCount > 0) throw new HttpError(409, "ROLE_HAS_USERS", { key, userCount });

    await this.assertRolesManageSurvives(key);

    await this.db.$transaction(async (tx) => {
      await tx.role.delete({ where: { key } });
      await this.audit?.(
        {
          action: "ROLE_DELETED",
          entityType: "Role",
          entityId: key,
          userId: actorId,
          previousState: roleStatus(role),
        },
        tx
      );
    });

    await loadPermissionsFromDb(this.db);
  }

  /** Alta de un permiso del catálogo. */
  async createCatalog(dto: PermissionCatalogCreateInput, actorId: string): Promise<PermissionCatalog> {
    const existing = await this.db.permission.findUnique({ where: { key: dto.key } });
    if (existing) throw new HttpError(409, "PERMISSION_KEY_TAKEN", { key: dto.key });

    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.permission.create({
        data: {
          key: dto.key,
          module: dto.module,
          name: dto.name,
          scopes: dto.scopes,
          sensitive: dto.sensitive ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      await this.audit?.(
        {
          action: "PERMISSION_CREATED",
          entityType: "Permission",
          entityId: row.key,
          userId: actorId,
          newState: catalogStatus(row),
        },
        tx
      );
      return row;
    });

    await loadPermissionsFromDb(this.db);
    return toCatalog(created);
  }

  /** Edición de un permiso del catálogo. */
  async updateCatalog(
    key: string,
    dto: PermissionCatalogUpdateInput,
    actorId: string
  ): Promise<PermissionCatalog> {
    const previous = await this.db.permission.findUnique({ where: { key } });
    if (!previous) throw new HttpError(404, "PERMISSION_NOT_FOUND", { key });

    const data: Prisma.PermissionUpdateInput = {};
    if (dto.module !== undefined) data.module = dto.module;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.sensitive !== undefined) data.sensitive = dto.sensitive;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    if (dto.scopes !== undefined) {
      const grants = await this.db.rolePermission.findMany({ where: { permissionKey: key } });
      const outsideScope = grants.filter(
        (row) => row.scope !== "NONE" && !dto.scopes!.includes(row.scope)
      );
      if (outsideScope.length > 0) {
        const item = outsideScope.map((row) => `${row.roleKey}=${row.scope}`).join(", ");
        throw new HttpError(409, "SCOPE_HAS_GRANTS", { grants: item }, {
          grants: outsideScope.map((row) => ({ roleKey: row.roleKey, scope: row.scope })),
        });
      }
      data.scopes = dto.scopes;
    }

    const previousState = catalogStatus(previous);
    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.permission.update({ where: { key }, data });
      await this.audit?.(
        {
          action: "PERMISSION_UPDATED",
          entityType: "Permission",
          entityId: key,
          userId: actorId,
          previousState,
          newState: catalogStatus(row),
        },
        tx
      );
      return row;
    });

    await loadPermissionsFromDb(this.db);
    return toCatalog(updated);
  }

  /**
   * Aplica un lote de celdas de la matriz. Valida cada fila, impide dejar el
   * sistema sin ningún rol activo con `roles.manage` y escribe también los NONE
   * (tombstone: nunca borra filas). Audita celda por celda y recarga la cache.
   */
  async saveMatrix(changes: MatrixChange[], actorId: string): Promise<{ updated: number }> {
    if (changes.length === 0) throw new HttpError(400, "CHANGES_REQUIRED");
    if (changes.length > MATRIX_MAX) throw new HttpError(400, "TOO_MANY_CHANGES", { max: MATRIX_MAX });

    const keys = [...new Set(changes.map((change) => change.permissionKey))];
    const permissions = await this.db.permission.findMany({ where: { key: { in: keys } } });
    const byKey = new Map(permissions.map((permission) => [permission.key, permission]));

    for (const change of changes) {
      if (!isRole(change.roleKey)) throw new HttpError(400, "INVALID_ROLE", { role: change.roleKey });
      const definition = byKey.get(change.permissionKey);
      if (!definition) throw new HttpError(400, "PERMISSION_DOES_NOT_EXIST", { permission: change.permissionKey });
      if (!definition.active) throw new HttpError(400, "PERMISSION_INACTIVE", { permission: change.permissionKey });
      const valid = new Set<string>([...definition.scopes, "NONE"]);
      if (!valid.has(change.scope)) {
        throw new HttpError(400, "INVALID_SCOPE_FOR_PERMISSION", {
          permission: change.permissionKey,
          scope: change.scope,
        });
      }
    }

    const removingManage = changes.filter(
      (change) => change.permissionKey === PERMISSION_ADMIN && change.scope === "NONE"
    );
    if (removingManage.length > 0) {
      await this.assertSomeRoleKeepsManage(new Set(removingManage.map((change) => change.roleKey)));
    }

    await this.db.$transaction(async (tx) => {
      const previous = await tx.rolePermission.findMany({
        where: { OR: changes.map((change) => ({ roleKey: change.roleKey, permissionKey: change.permissionKey })) },
      });
      const previousByCell = new Map(previous.map((row) => [`${row.roleKey}|${row.permissionKey}`, row.scope]));

      for (const change of changes) {
        const entityId = `${change.roleKey}|${change.permissionKey}`;
        const before = previousByCell.get(entityId);
        await tx.rolePermission.upsert({
          where: {
            roleKey_permissionKey: {
              roleKey: change.roleKey,
              permissionKey: change.permissionKey,
            },
          },
          create: {
            roleKey: change.roleKey,
            permissionKey: change.permissionKey,
            scope: change.scope,
          },
          update: { scope: change.scope },
        });
        await this.audit?.(
          {
            action: "ROLE_PERMISSIONS_UPDATED",
            entityType: "RolePermission",
            entityId,
            userId: actorId,
            previousState: before ? { scope: before } : undefined,
            newState: { scope: change.scope },
          },
          tx
        );
      }
    });

    await loadPermissionsFromDb(this.db);
    return { updated: changes.length };
  }

  /** Recarga catálogo, roles y matriz desde la BD (multi-instancia). */
  async reload(): Promise<void> {
    await loadPermissionsFromDb(this.db);
  }

  private async assertRolesManageSurvives(removing: string): Promise<void> {
    await this.assertSomeRoleKeepsManage(new Set([removing]));
  }

  private async assertSomeRoleKeepsManage(removedRoles: ReadonlySet<string>): Promise<void> {
    const [grants, activeRoles] = await Promise.all([
      this.db.rolePermission.findMany({
        where: { permissionKey: PERMISSION_ADMIN, scope: { not: "NONE" } },
        select: { roleKey: true },
      }),
      this.db.role.findMany({ where: { active: true }, select: { key: true } }),
    ]);
    const active = new Set(activeRoles.map((role) => role.key));
    const survivors = grants.filter(
      (grant) => !removedRoles.has(grant.roleKey) && active.has(grant.roleKey)
    );
    if (survivors.length === 0) {
      throw new HttpError(409, "ADMIN_PERMISSION_REQUIRED", { permission: PERMISSION_ADMIN });
    }
  }
}
