import type { PrismaClient, Term } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import {
  filterBool,
  filterDayRange,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
} from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import type { TermCreateInput, TermUpdateInput } from "../models/dto/catalog.dto";

/** `AAAA-MM-DD` ↔ `@db.Date` (medianoche UTC, sin corrimiento de zona). */
const toDay = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const fromDay = (value: Date): string => value.toISOString().slice(0, 10);

const toView = (row: Term) => ({
  id: row.id,
  name: row.name,
  startDate: fromDay(row.startDate),
  endDate: fromDay(row.endDate),
  active: row.active,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
export type TermView = ReturnType<typeof toView>;

const stateOf = (row: Term) => ({
  name: row.name,
  startDate: fromDay(row.startDate),
  endDate: fromDay(row.endDate),
  active: row.active,
});

/**
 * Ciclos escolares (M11 sobre el modelo `Term` de M07). Solo uno activo a la
 * vez: activar uno desactiva el anterior en la misma transacción (y el índice
 * único parcial `terms_single_active` lo garantiza en la base).
 */
export class TermService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private assertDates(startDate: string, endDate: string): void {
    if (Number.isNaN(toDay(startDate).getTime()) || Number.isNaN(toDay(endDate).getTime())) {
      throw new HttpError(400, "TERM_DATES_INVALID");
    }
    if (startDate > endDate) throw new HttpError(400, "TERM_DATES_INVALID");
  }

  private async load(id: string): Promise<Term> {
    const row = await this.db.term.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "CATALOG_ITEM_NOT_FOUND");
    return row;
  }

  async table(params: ITDataTableFetchParams): Promise<ITDataTableResponse<TermView>> {
    const where: Record<string, unknown> = {
      name: filterText(params.filters, "name"),
      active: filterBool(params.filters, "active"),
      startDate: filterDayRange(params.filters, "startDate"),
    };
    for (const key of Object.keys(where)) if (where[key] === undefined) delete where[key];
    const orderBy = orderByOf(
      params.sort,
      { name: "name", startDate: "startDate", endDate: "endDate", active: "active" },
      [{ startDate: "desc" }]
    );
    const result = await paginatedQuery<Term>({
      model: this.db.term,
      where,
      orderBy,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toView), total: result.total };
  }

  async options(): Promise<TermView[]> {
    const rows = await this.db.term.findMany({ orderBy: { startDate: "desc" } });
    return rows.map(toView);
  }

  async active(): Promise<TermView | null> {
    const row = await this.db.term.findFirst({ where: { active: true } });
    return row ? toView(row) : null;
  }

  async create(input: TermCreateInput, actor: { id: string; username: string }): Promise<TermView> {
    this.assertDates(input.startDate, input.endDate);
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.term.create({
        data: {
          name: input.name,
          startDate: toDay(input.startDate),
          endDate: toDay(input.endDate),
        },
      });
      await this.audit?.(
        {
          action: "TERM_CREATED",
          entityType: "Term",
          entityId: created.id,
          userId: actor.id,
          userName: actor.username,
          newState: stateOf(created),
        },
        tx
      );
      return created;
    });
    return toView(row);
  }

  async update(id: string, input: TermUpdateInput, actor: { id: string; username: string }): Promise<TermView> {
    const previous = await this.load(id);
    const startDate = input.startDate ?? fromDay(previous.startDate);
    const endDate = input.endDate ?? fromDay(previous.endDate);
    this.assertDates(startDate, endDate);

    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.term.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.startDate !== undefined && { startDate: toDay(input.startDate) }),
          ...(input.endDate !== undefined && { endDate: toDay(input.endDate) }),
        },
      });
      await this.audit?.(
        {
          action: "TERM_UPDATED",
          entityType: "Term",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: stateOf(previous),
          newState: stateOf(updated),
        },
        tx
      );
      return updated;
    });
    return toView(row);
  }

  /** Activa el ciclo y desactiva el anterior (atómico). */
  async activate(id: string, actor: { id: string; username: string }): Promise<TermView> {
    const target = await this.load(id);
    if (target.active) throw new HttpError(409, "TERM_ALREADY_ACTIVE");

    const row = await this.db.$transaction(async (tx) => {
      const previous = await tx.term.findFirst({ where: { active: true } });
      if (previous) await tx.term.update({ where: { id: previous.id }, data: { active: false } });
      const activated = await tx.term.update({ where: { id }, data: { active: true } });
      await this.audit?.(
        {
          action: "TERM_ACTIVATED",
          entityType: "Term",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: { activeTermId: previous?.id ?? null, activeTermName: previous?.name ?? null },
          newState: { activeTermId: id, activeTermName: activated.name },
        },
        tx
      );
      return activated;
    });
    return toView(row);
  }
}
