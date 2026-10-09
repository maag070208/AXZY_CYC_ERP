import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import {
  filterBool,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
  type TableFilters,
} from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";

/** Lo mínimo que se usa de un delegate de Prisma (levels, cancellationReason, …). */
interface CatalogDelegate {
  findUnique(args: { where: { id: string } }): Promise<CatalogRow | null>;
  findMany(args: { where?: Record<string, unknown>; orderBy?: unknown }): Promise<CatalogRow[]>;
  create(args: { data: Record<string, unknown> }): Promise<CatalogRow>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<CatalogRow>;
  count(args?: unknown): Promise<number>;
}

export interface CatalogRow {
  id: string;
  nombre: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  [field: string]: unknown;
}

export interface CatalogSpec {
  /** Delegate de Prisma, dentro o fuera de una transacción. */
  delegate: (db: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => unknown;
  /** `entityType` de la bitácora (`Level`). */
  entityType: string;
  /** Prefijo de la acción de bitácora (`LEVEL` → `LEVEL_CREATED`). */
  auditPrefix: string;
  /** Filtros extra de la tabla, además de `nombre` y `active`. */
  extraFilters?: (filters: TableFilters) => Record<string, unknown>;
  /** Columnas ordenables extra (`campo de la tabla → campo Prisma`). */
  extraSort?: Record<string, string>;
  defaultOrder: unknown[];
}

const toView = (row: CatalogRow) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Campos de negocio (sin id/timestamps) para `previousState`/`newState`. */
const stateOf = (row: CatalogRow): Prisma.InputJsonObject => {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = row;
  return rest as Prisma.InputJsonObject;
};

/**
 * CRUD genérico de catálogos simples (M11): tabla server-side, lista para
 * selects, alta, edición y desactivación lógica. Cada escritura se audita en
 * la misma transacción.
 */
export class CatalogService {
  constructor(
    private readonly spec: CatalogSpec,
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private model(client: unknown = this.db): CatalogDelegate {
    return this.spec.delegate(client as PrismaClient) as CatalogDelegate;
  }

  async table(params: ITDataTableFetchParams): Promise<ITDataTableResponse<ReturnType<typeof toView>>> {
    const where: Record<string, unknown> = {
      nombre: filterText(params.filters, "nombre"),
      active: filterBool(params.filters, "active"),
      ...(this.spec.extraFilters?.(params.filters) ?? {}),
    };
    for (const key of Object.keys(where)) if (where[key] === undefined) delete where[key];

    const orderBy = orderByOf(
      params.sort,
      { nombre: "nombre", active: "active", createdAt: "createdAt", ...(this.spec.extraSort ?? {}) },
      this.spec.defaultOrder
    );
    const result = await paginatedQuery<CatalogRow>({
      model: this.model(),
      where,
      orderBy,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toView), total: result.total };
  }

  /** Lista para selects: solo activos, salvo que se pidan todos. */
  async options(includeInactive = false) {
    const rows = await this.model().findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: this.spec.defaultOrder,
    });
    return rows.map(toView);
  }

  async getById(id: string) {
    const row = await this.model().findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "CATALOG_ITEM_NOT_FOUND");
    return toView(row);
  }

  async create(data: Record<string, unknown>, actor: { id: string; username: string }) {
    const created = await this.db.$transaction(async (tx) => {
      const row = await this.model(tx).create({ data });
      await this.audit?.(
        {
          action: `${this.spec.auditPrefix}_CREATED`,
          entityType: this.spec.entityType,
          entityId: row.id,
          userId: actor.id,
          userName: actor.username,
          newState: stateOf(row),
        },
        tx
      );
      return row;
    });
    return toView(created);
  }

  async update(id: string, data: Record<string, unknown>, actor: { id: string; username: string }) {
    const previous = await this.model().findUnique({ where: { id } });
    if (!previous) throw new HttpError(404, "CATALOG_ITEM_NOT_FOUND");

    const updated = await this.db.$transaction(async (tx) => {
      const row = await this.model(tx).update({ where: { id }, data });
      await this.audit?.(
        {
          action:
            previous.active && data.active === false
              ? `${this.spec.auditPrefix}_DEACTIVATED`
              : `${this.spec.auditPrefix}_UPDATED`,
          entityType: this.spec.entityType,
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: stateOf(previous),
          newState: stateOf(row),
        },
        tx
      );
      return row;
    });
    return toView(updated);
  }

  /** Desactivación lógica: el registro se conserva para no romper históricos. */
  async deactivate(id: string, actor: { id: string; username: string }) {
    const previous = await this.model().findUnique({ where: { id } });
    if (!previous) throw new HttpError(404, "CATALOG_ITEM_NOT_FOUND");
    if (!previous.active) throw new HttpError(409, "CATALOG_ITEM_ALREADY_INACTIVE");
    return this.update(id, { active: false }, actor);
  }
}
