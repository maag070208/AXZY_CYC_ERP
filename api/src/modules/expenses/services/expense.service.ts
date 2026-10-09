import type { Expense, Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import { t, type MessageKey } from "@core/i18n";
import { fromDbDay, todayInBusinessZone } from "@core/utils/day";
import type { AuthenticatedUser } from "@core/utils/security";
import {
  filterDateRange,
  filterDayRange,
  filterEnum,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
} from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import { sumOf } from "@modules/finance/models/entity/money";
import {
  EXPENSE_STATUSES,
  EXPENSE_TYPES,
  type ExpenseCreateInput,
  type ExpenseSummary,
  type ExpenseUpdateInput,
  type ExpenseView,
} from "../models/dto/expense.dto";

/** Fila con lo mínimo para decidir la mora. */
type ExpenseRow = Expense & { term: { name: string } | null };

const toView = (row: ExpenseRow, today: string): ExpenseView => {
  const status = row.status;
  return {
    id: row.id,
    date: fromDbDay(row.date),
    dueDate: row.dueDate ? fromDbDay(row.dueDate) : null,
    concept: row.concept,
    type: row.type,
    vendor: row.vendor,
    amount: Number(row.amount),
    status,
    notes: row.notes,
    termId: row.termId,
    termName: row.term?.name ?? null,
    overdue: status === "PENDING" && row.dueDate !== null && fromDbDay(row.dueDate) < today,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};

const stateOf = (v: ExpenseView): Prisma.InputJsonObject => ({
  date: v.date,
  dueDate: v.dueDate,
  concept: v.concept,
  type: v.type,
  vendor: v.vendor,
  amount: v.amount,
  status: v.status,
  notes: v.notes,
  termId: v.termId,
});

const withTerm = { term: { select: { name: true } } } as const;

/**
 * M23 — Gastos institucionales. Alta, edición y cancelación con bitácora; la
 * baja es lógica (`status = CANCELLED`) para no perder el histórico contable.
 */
export class ExpenseService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private async load(id: string): Promise<ExpenseRow> {
    const row = await this.db.expense.findUnique({ where: { id }, include: withTerm });
    if (!row) throw new HttpError(404, "EXPENSE_NOT_FOUND");
    return row;
  }

  async table(params: ITDataTableFetchParams): Promise<ITDataTableResponse<ExpenseView>> {
    const { filters } = params;
    const where: Prisma.ExpenseWhereInput = {};
    const concept = filterText(filters, "concept");
    if (concept) where.concept = concept;
    const vendor = filterText(filters, "vendor");
    if (vendor) where.vendor = vendor;
    const type = filterEnum(filters, "type", EXPENSE_TYPES);
    if (type) where.type = type;
    const status = filterEnum(filters, "status", EXPENSE_STATUSES);
    if (status) where.status = status;
    const termId = filterText(filters, "termId");
    if (termId) where.termId = termId;
    const date = filterDayRange(filters, "date");
    if (date) where.date = date;
    const dueDate = filterDateRange(filters, "dueDate");
    if (dueDate) where.dueDate = dueDate;

    const result = await paginatedQuery<ExpenseRow>({
      model: this.db.expense,
      where: where as Record<string, unknown>,
      include: withTerm,
      orderBy: orderByOf(
        params.sort,
        { date: "date", dueDate: "dueDate", concept: "concept", type: "type", vendor: "vendor", amount: "amount", status: "status" },
        [{ date: "desc" }, { createdAt: "desc" }]
      ),
      page: params.page,
      limit: params.limit,
    });
    const today = todayInBusinessZone();
    return { data: result.data.map((row) => toView(row, today)), total: result.total };
  }

  async getById(id: string): Promise<ExpenseView> {
    return toView(await this.load(id), todayInBusinessZone());
  }

  async create(input: ExpenseCreateInput, actor: AuthenticatedUser): Promise<ExpenseView> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.expense.create({
        data: {
          date: new Date(`${input.date}T00:00:00.000Z`),
          dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
          concept: input.concept,
          type: input.type,
          vendor: input.vendor ?? null,
          amount: input.amount,
          status: input.status,
          notes: input.notes ?? null,
          termId: input.termId ?? null,
          createdBy: actor.id,
        },
        include: withTerm,
      });
      const view = toView(row, todayInBusinessZone());
      await this.audit?.(
        {
          action: "EXPENSE_CREATED",
          entityType: "Expense",
          entityId: row.id,
          userId: actor.id,
          userName: actor.username,
          newState: stateOf(view),
        },
        tx
      );
      return view;
    });
  }

  async update(id: string, input: ExpenseUpdateInput, actor: AuthenticatedUser): Promise<ExpenseView> {
    const previous = await this.load(id);
    if (previous.status === "CANCELLED") throw new HttpError(409, "EXPENSE_CANCELLED");
    const before = toView(previous, todayInBusinessZone());
    // La fecha y el vencimiento se validan juntos: puede cambiar solo uno.
    const date = input.date ?? before.date;
    const dueDate = input.dueDate === undefined ? before.dueDate : input.dueDate;
    if (dueDate && dueDate < date) throw new HttpError(400, "DUE_DATE_BEFORE_DATE");
    return this.db.$transaction(async (tx) => {
      const row = await tx.expense.update({
        where: { id },
        data: {
          ...(input.date !== undefined && { date: new Date(`${input.date}T00:00:00.000Z`) }),
          ...(input.dueDate !== undefined && { dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null }),
          ...(input.concept !== undefined && { concept: input.concept }),
          ...(input.type !== undefined && { type: input.type }),
          ...(input.vendor !== undefined && { vendor: input.vendor }),
          ...(input.amount !== undefined && { amount: input.amount }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.termId !== undefined && { termId: input.termId }),
        },
        include: withTerm,
      });
      const after = toView(row, todayInBusinessZone());
      await this.audit?.(
        {
          action: "EXPENSE_UPDATED",
          entityType: "Expense",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: stateOf(before),
          newState: stateOf(after),
        },
        tx
      );
      return after;
    });
  }

  /** Cancelación lógica con motivo (nunca se borra la fila). */
  async cancel(id: string, reason: string, actor: AuthenticatedUser): Promise<ExpenseView> {
    const previous = await this.load(id);
    if (previous.status === "CANCELLED") throw new HttpError(409, "EXPENSE_ALREADY_CANCELLED");
    return this.db.$transaction(async (tx) => {
      const row = await tx.expense.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, cancelledBy: actor.id },
        include: withTerm,
      });
      await this.audit?.(
        {
          action: "EXPENSE_CANCELLED",
          entityType: "Expense",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: { status: previous.status },
          newState: { status: "CANCELLED" },
          metadata: { reason },
        },
        tx
      );
      return toView(row, todayInBusinessZone());
    });
  }

  /**
   * Totales del ciclo (o de todos si no se indica uno). Los compromisos
   * cancelados no cuentan. `byType` solo incluye las categorías con gasto.
   */
  async summary(termId: string | null): Promise<ExpenseSummary> {
    const rows = await this.db.expense.findMany({
      where: { status: { not: "CANCELLED" }, ...(termId ? { termId } : {}) },
      select: { type: true, amount: true, status: true, date: true },
      orderBy: { date: "asc" },
    });
    const paid = rows.filter((row) => row.status === "PAID");
    const pending = rows.filter((row) => row.status === "PENDING");
    const byType = new Map<string, number[]>();
    const byMonth = new Map<string, number[]>();
    for (const row of rows) {
      byType.set(row.type, [...(byType.get(row.type) ?? []), Number(row.amount)]);
      const month = fromDbDay(row.date).slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), Number(row.amount)]);
    }
    return {
      total: sumOf(rows.map((row) => row.amount)),
      paid: sumOf(paid.map((row) => row.amount)),
      pending: sumOf(pending.map((row) => row.amount)),
      count: rows.length,
      byType: EXPENSE_TYPES.filter((type) => byType.has(type)).map((type) => {
        const amounts = byType.get(type) ?? [];
        return { type, label: t(`expenses.types.${type}` as MessageKey), total: sumOf(amounts), count: amounts.length };
      }),
      byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amounts]) => ({ month, total: sumOf(amounts) })),
    };
  }
}
