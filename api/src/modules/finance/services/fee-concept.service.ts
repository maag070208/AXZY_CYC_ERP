import type { FeeConcept, Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import type { AuthenticatedUser } from "@core/utils/security";
import {
  filterBool,
  filterEnum,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
} from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import {
  FEE_CONCEPT_TYPES,
  type FeeConceptCreateInput,
  type FeeConceptUpdateInput,
  type FeeConceptView,
} from "../models/dto/finance.dto";

const toView = (row: FeeConcept): FeeConceptView => ({
  id: row.id,
  nombre: row.nombre,
  descripcion: row.descripcion,
  monto: Number(row.monto),
  tipo: row.tipo,
  active: row.active,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const stateOf = (v: FeeConceptView): Prisma.InputJsonObject => ({
  nombre: v.nombre,
  descripcion: v.descripcion,
  monto: v.monto,
  tipo: v.tipo,
  active: v.active,
});

/** Conceptos de cobro (M09). El de recargos (RECARGO) lo administra el sistema. */
export class FeeConceptService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private async load(id: string): Promise<FeeConcept> {
    const row = await this.db.feeConcept.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "FEE_CONCEPT_NOT_FOUND");
    return row;
  }

  private async assertNameFree(nombre: string, exceptId?: string): Promise<void> {
    const taken = await this.db.feeConcept.findFirst({
      where: { nombre: { equals: nombre, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    });
    if (taken) throw new HttpError(409, "FEE_CONCEPT_NAME_TAKEN", { nombre });
  }

  async table(params: ITDataTableFetchParams): Promise<ITDataTableResponse<FeeConceptView>> {
    const { filters } = params;
    const where: Prisma.FeeConceptWhereInput = {};
    const nombre = filterText(filters, "nombre");
    if (nombre) where.nombre = nombre;
    const tipo = filterEnum(filters, "tipo", FEE_CONCEPT_TYPES);
    if (tipo) where.tipo = tipo;
    const active = filterBool(filters, "active");
    if (active !== undefined) where.active = active;
    const result = await paginatedQuery<FeeConcept>({
      model: this.db.feeConcept,
      where: where as Record<string, unknown>,
      orderBy: orderByOf(params.sort, { nombre: "nombre", monto: "monto", tipo: "tipo", active: "active" }, [{ nombre: "asc" }]),
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toView), total: result.total };
  }

  /** Conceptos activos y capturables a mano (sin RECARGO). */
  async options(): Promise<FeeConceptView[]> {
    const rows = await this.db.feeConcept.findMany({
      where: { active: true, tipo: { not: "RECARGO" } },
      orderBy: { nombre: "asc" },
    });
    return rows.map(toView);
  }

  async create(input: FeeConceptCreateInput, actor: AuthenticatedUser): Promise<FeeConceptView> {
    await this.assertNameFree(input.nombre);
    return this.db.$transaction(async (tx) => {
      const row = await tx.feeConcept.create({
        data: { nombre: input.nombre, descripcion: input.descripcion ?? null, monto: input.monto, tipo: input.tipo },
      });
      const view = toView(row);
      await this.audit?.(
        { action: "FEE_CONCEPT_CREATED", entityType: "FeeConcept", entityId: row.id, userId: actor.id,
          userName: actor.username, newState: stateOf(view) },
        tx
      );
      return view;
    });
  }

  async update(id: string, input: FeeConceptUpdateInput, actor: AuthenticatedUser): Promise<FeeConceptView> {
    const previous = await this.load(id);
    if (previous.tipo === "RECARGO") throw new HttpError(409, "FEE_CONCEPT_RESERVED");
    if (input.nombre && input.nombre !== previous.nombre) await this.assertNameFree(input.nombre, id);
    const before = toView(previous);
    return this.db.$transaction(async (tx) => {
      const row = await tx.feeConcept.update({
        where: { id },
        data: {
          ...(input.nombre !== undefined && { nombre: input.nombre }),
          ...(input.descripcion !== undefined && { descripcion: input.descripcion }),
          ...(input.monto !== undefined && { monto: input.monto }),
          ...(input.tipo !== undefined && { tipo: input.tipo }),
        },
      });
      const after = toView(row);
      await this.audit?.(
        { action: "FEE_CONCEPT_UPDATED", entityType: "FeeConcept", entityId: id, userId: actor.id,
          userName: actor.username, previousState: stateOf(before), newState: stateOf(after) },
        tx
      );
      return after;
    });
  }

  /** Baja lógica: los cargos ya emitidos no cambian. */
  async setActive(id: string, active: boolean, actor: AuthenticatedUser): Promise<FeeConceptView> {
    const previous = await this.load(id);
    if (previous.tipo === "RECARGO") throw new HttpError(409, "FEE_CONCEPT_RESERVED");
    if (previous.active === active) throw new HttpError(409, active ? "FEE_CONCEPT_ALREADY_ACTIVE" : "FEE_CONCEPT_INACTIVE");
    return this.db.$transaction(async (tx) => {
      const row = await tx.feeConcept.update({ where: { id }, data: { active } });
      await this.audit?.(
        { action: active ? "FEE_CONCEPT_REACTIVATED" : "FEE_CONCEPT_DEACTIVATED", entityType: "FeeConcept",
          entityId: id, userId: actor.id, userName: actor.username,
          previousState: { active: previous.active }, newState: { active } },
        tx
      );
      return toView(row);
    });
  }
}
