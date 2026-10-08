import { Prisma, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import {
  filterDateRange,
  filterId,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
} from "@core/utils/table";
import type { AuditLogInput, ListAuditParams } from "../models/entity/audit.entity";

/** Convierte `undefined`/`null`/valor al input JSON nullable de Prisma. */
const json = (value: AuditLogInput["previousState"]): Prisma.InputJsonValue | undefined => {
  if (value === undefined || value === null) return undefined;
  return value;
};

export class AuditService {
  constructor(private readonly db: PrismaClient = prismaClient) {}

  /**
   * Escribe un registro. Acepta un cliente de transacción (`tx`) para que el
   * log quede atado a la misma transacción que la operación que audita: si la
   * transacción falla, el log tampoco se escribe.
   */
  createLog(input: AuditLogInput, client?: Prisma.TransactionClient) {
    const db = client ?? this.db;
    return db.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        previousState: json(input.previousState),
        newState: json(input.newState),
        metadata: json(input.metadata),
      },
    });
  }

  /** Tabla server-side de bitácora. */
  async query(params: ITDataTableFetchParams): Promise<ITDataTableResponse<unknown>> {
    const { filters } = params;
    const where: Record<string, unknown> = {
      action: filterText(filters, "action"),
      entityType: filterText(filters, "entityType"),
      entityId: filterId(filters, "entityId"),
      userId: filterId(filters, "userId"),
      createdAt: filterDateRange(filters, "createdAt"),
    };
    for (const key of Object.keys(where)) {
      if (where[key] === undefined) delete where[key];
    }

    const orderBy = orderByOf(params.sort, { createdAt: "createdAt" }, [{ createdAt: "desc" }]);

    return paginatedQuery({
      model: this.db.auditLog,
      where,
      orderBy,
      page: params.page,
      limit: params.limit,
    });
  }

  /** Consulta con filtros simples (query params). */
  async list(params: ListAuditParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    const where: Prisma.AuditLogWhereInput = {};
    if (params.action) where.action = params.action;
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;
    if (params.userId) where.userId = params.userId;
    if (params.from || params.to) {
      where.createdAt = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }
    const [total, data] = await this.db.$transaction([
      this.db.auditLog.count({ where }),
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }

  async getById(id: string) {
    const log = await this.db.auditLog.findUnique({ where: { id } });
    if (!log) throw new HttpError(404, "AUDIT_LOG_NOT_FOUND");
    return log;
  }
}
