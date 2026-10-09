import { Prisma, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import { serializable } from "@core/db/serializable";
import { formatMoney } from "@core/utils/format";
import type { Notifier } from "@core/ports/notification.port";
import { studentContacts } from "@modules/students";
import { scopeWhere, type UserPermissions } from "@core/permissions";
import { enforcePolicy } from "@core/policies";
import { fromDbDay, toDbDay, todayInBusinessZone } from "@core/utils/day";
import type { AuthenticatedUser } from "@core/utils/security";
import {
  filterBool,
  filterDayRange,
  filterEnum,
  filterId,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
} from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import { fullName } from "@modules/students/services/student.service";
import { PAYMENT_METHODS, type PaymentCreateInput, type PaymentView } from "../models/dto/finance.dto";
import { balanceOf, chargeStatusOf, chargeTotal, daysBetween, formatFolio, sumOf } from "../models/entity/money";

type Tx = Prisma.TransactionClient;

const include = {
  charge: {
    select: {
      id: true, studentId: true, description: true, status: true, amount: true, discount: true,
      student: { select: { studentNumber: true, firstNames: true, paternalSurname: true, maternalSurname: true } },
      concept: { select: { name: true } },
      payments: { where: { cancelledAt: null }, select: { amount: true } },
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof include }>;

const toView = (row: PaymentRow): PaymentView => {
  const total = chargeTotal(row.charge.amount, row.charge.discount);
  const paid = sumOf(row.charge.payments.map((p) => p.amount));
  return {
    id: row.id,
    chargeId: row.chargeId,
    studentId: row.charge.studentId,
    studentNumber: row.charge.student.studentNumber,
    studentNombre: fullName(row.charge.student),
    conceptNombre: row.charge.concept.name,
    chargeDescripcion: row.charge.description,
    amount: Number(row.amount),
    date: fromDbDay(row.date),
    method: row.method,
    reference: row.reference,
    receiptNumber: row.receiptNumber,
    registeredBy: row.registeredBy,
    registeredByName: row.registeredByName,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
    chargeStatus: row.charge.status,
    chargeSaldo: row.charge.status === "CANCELLED" ? 0 : balanceOf(total, paid),
  };
};

const paymentScope = (user: UserPermissions) =>
  scopeWhere<Prisma.PaymentWhereInput>(user, {
    resource: "students",
    permission: "charges.view",
    own: (u) => ({ charge: { student: { userId: u.id } } }),
    byIds: (ids) => ({ charge: { studentId: { in: ids } } }),
    or: (filters) => ({ OR: filters }),
    none: { id: { in: [] } },
  });

/** Recalcula y guarda el estatus del cargo con sus pagos vigentes (M09 §4.1–4.2). */
const refreshChargeStatus = async (tx: Tx, chargeId: string) => {
  const charge = await tx.charge.findUniqueOrThrow({
    where: { id: chargeId },
    include: { payments: { where: { cancelledAt: null }, select: { amount: true } } },
  });
  if (charge.status === "CANCELLED") return charge.status;
  const status = chargeStatusOf(chargeTotal(charge.amount, charge.discount), sumOf(charge.payments.map((p) => p.amount)));
  if (status !== charge.status) await tx.charge.update({ where: { id: chargeId }, data: { status } });
  return status;
};

/**
 * Pagos manuales (M09). Registrar corre en una transacción `Serializable`:
 * valida el saldo, toma el siguiente folio `REC-AAAA-NNNNNN` y recalcula el
 * cargo. Un pago nunca se borra: se cancela con motivo y el folio se conserva.
 */
export class PaymentService {
  private notifier?: Notifier;

  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  /** Puerto de M19: recibo por correo y aviso interno al registrar un pago. */
  setNotifier(notifier: Notifier): void {
    this.notifier = notifier;
  }

  private async load(id: string, client: PrismaClient | Tx, user?: UserPermissions): Promise<PaymentRow> {
    const scoped = user ? await paymentScope(user) : null;
    const row = await client.payment.findFirst({ where: { AND: [{ id }, ...(scoped ? [scoped] : [])] }, include });
    if (!row) throw new HttpError(404, "PAYMENT_NOT_FOUND");
    return row;
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<PaymentView>> {
    const { filters } = params;
    const and: Prisma.PaymentWhereInput[] = [];
    const chargeId = filterId(filters, "chargeId");
    if (chargeId) and.push({ chargeId });
    const studentId = filterId(filters, "studentId");
    if (studentId) and.push({ charge: { studentId } });
    const folio = filterText(filters, "receiptNumber");
    if (folio) and.push({ receiptNumber: folio });
    const method = filterEnum(filters, "method", PAYMENT_METHODS);
    if (method) and.push({ method });
    const date = filterDayRange(filters, "date");
    if (date) and.push({ date });
    const cancelled = filterBool(filters, "cancelled");
    if (cancelled !== undefined) and.push({ cancelledAt: cancelled ? { not: null } : null });
    const name = filterText(filters, "studentNombre");
    if (name) {
      for (const word of name.contains.split(/\s+/).filter(Boolean)) {
        const contains = { contains: word, mode: "insensitive" as const };
        and.push({ charge: { student: { OR: [{ firstNames: contains }, { paternalSurname: contains }, { maternalSurname: contains }] } } });
      }
    }
    const scoped = await paymentScope(user);
    if (scoped) and.push(scoped);
    const result = await paginatedQuery<PaymentRow>({
      model: this.db.payment,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy: orderByOf(
        params.sort,
        { date: "date", amount: "amount", receiptNumber: "receiptNumber", createdAt: "createdAt" },
        [{ createdAt: "desc" }]
      ),
      include,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toView), total: result.total };
  }

  async getById(id: string, user: UserPermissions): Promise<PaymentView> {
    return toView(await this.load(id, this.db, user));
  }

  /** Repetición con la misma `Idempotency-Key`: mismo pago, o 409 si es de otra persona/cargo. */
  private async replay(key: string, actor: AuthenticatedUser, chargeId: string): Promise<PaymentView | null> {
    const prior = await this.db.payment.findUnique({ where: { idempotencyKey: key }, include });
    if (!prior) return null;
    if (prior.registeredBy !== actor.id || prior.chargeId !== chargeId) throw new HttpError(409, "IDEMPOTENCY_KEY_REUSED");
    return toView(prior);
  }

  async register(
    input: PaymentCreateInput,
    actor: AuthenticatedUser & { name?: string | null },
    idempotencyKey?: string
  ): Promise<{ payment: PaymentView; replayed: boolean }> {
    if (idempotencyKey) {
      const prior = await this.replay(idempotencyKey, actor, input.chargeId);
      if (prior) return { payment: prior, replayed: true };
    }
    const today = todayInBusinessZone();
    const date = input.date ?? today;
    if (date > today) throw new HttpError(400, "FUTURE_DATE", { field: "date" });
    const year = Number(today.slice(0, 4));
    const registrar = await this.db.user.findUnique({ where: { id: actor.id }, select: { name: true } });

    try {
      const id = await serializable(async (tx) => {
        const charge = await tx.charge.findUnique({
          where: { id: input.chargeId },
          include: { payments: { where: { cancelledAt: null }, select: { amount: true } } },
        });
        if (!charge) throw new HttpError(404, "CHARGE_NOT_FOUND");
        if (charge.status === "PAID" || charge.status === "CANCELLED") throw new HttpError(409, "CHARGE_ALREADY_PAID");
        const saldo = balanceOf(chargeTotal(charge.amount, charge.discount), sumOf(charge.payments.map((p) => p.amount)));
        if (new Prisma.Decimal(input.amount).greaterThan(saldo)) {
          throw new HttpError(400, "PAYMENT_EXCEEDS_BALANCE", { saldo: saldo.toFixed(2) }, { saldo });
        }
        // Consecutivo por año: el UPDATE … +1 bloquea la fila hasta el commit.
        const sequence = await tx.receiptSequence.upsert({
          where: { year },
          create: { year, last: 1 },
          update: { last: { increment: 1 } },
        });
        const payment = await tx.payment.create({
          data: {
            chargeId: charge.id,
            amount: input.amount,
            date: toDbDay(date),
            method: input.method,
            reference: input.reference ?? null,
            receiptNumber: formatFolio(year, sequence.last),
            registeredBy: actor.id,
            registeredByName: registrar?.name ?? actor.username,
            idempotencyKey: idempotencyKey ?? null,
          },
        });
        const status = await refreshChargeStatus(tx, charge.id);
        if (this.notifier) {
          const contacts = await studentContacts(tx, charge.studentId, "payer");
          const concept = await tx.feeConcept.findUnique({ where: { id: charge.conceptId }, select: { name: true } });
          if (contacts) {
            await this.notifier(
              {
                code: "PAGO_RECIBIDO",
                recipients: contacts.recipients,
                payload: {
                  name: contacts.name,
                  amount: formatMoney(input.amount),
                  concepto: concept?.name ?? "",
                  folio: payment.receiptNumber,
                  saldo: formatMoney(new Prisma.Decimal(saldo).minus(input.amount)),
                },
                idempotencyKey: `PAGO_RECIBIDO:${payment.id}`,
              },
              tx
            );
          }
        }
        await this.audit?.(
          { action: "PAYMENT_REGISTERED", entityType: "Payment", entityId: payment.id, userId: actor.id,
            userName: actor.username,
            newState: { receiptNumber: payment.receiptNumber, amount: input.amount, method: input.method, date, chargeStatus: status },
            metadata: { chargeId: charge.id, studentId: charge.studentId } },
          tx
        );
        return payment.id;
      });
      return { payment: toView(await this.load(id, this.db)), replayed: false };
    } catch (error) {
      // Dos peticiones simultáneas con la misma clave: gana una, la otra la repite.
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const prior = await this.replay(idempotencyKey, actor, input.chargeId);
        if (prior) return { payment: prior, replayed: true };
      }
      throw error;
    }
  }

  /** Cancelación lógica con motivo: el folio se conserva y el cargo se recalcula. */
  async cancel(id: string, reason: string, actor: AuthenticatedUser): Promise<PaymentView> {
    const previous = await this.load(id, this.db);
    if (previous.cancelledAt) throw new HttpError(409, "PAYMENT_ALREADY_CANCELLED");
    enforcePolicy("payments.cancel", actor, {
      amount: Number(previous.amount),
      method: previous.method,
      diasDesdeRegistro: daysBetween(previous.createdAt.toISOString().slice(0, 10), todayInBusinessZone()),
    });
    await this.db.$transaction(async (tx) => {
      const changed = await tx.payment.updateMany({
        where: { id, cancelledAt: null },
        data: { cancelledAt: new Date(), cancelReason: reason, cancelledBy: actor.id },
      });
      if (changed.count === 0) throw new HttpError(409, "PAYMENT_ALREADY_CANCELLED");
      const status = await refreshChargeStatus(tx, previous.chargeId);
      await this.audit?.(
        { action: "PAYMENT_CANCELLED", entityType: "Payment", entityId: id, userId: actor.id, userName: actor.username,
          previousState: { cancelledAt: null, chargeStatus: previous.charge.status },
          newState: { cancelledAt: new Date().toISOString(), chargeStatus: status },
          metadata: { reason, receiptNumber: previous.receiptNumber, amount: Number(previous.amount) } },
        tx
      );
    });
    return toView(await this.load(id, this.db));
  }
}
