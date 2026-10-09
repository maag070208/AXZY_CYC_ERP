import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import { serializable } from "@core/db/serializable";
import { once } from "@core/db/idempotency";
import type { UserPermissions } from "@core/permissions";
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
import type { StudentService } from "@modules/students";
import { fullName } from "@modules/students/services/student.service";
import {
  CHARGE_STATUSES,
  FEE_CONCEPT_TYPES,
  type AccountStatement,
  type ChargeCreateInput,
  type ChargeGenerateInput,
  type ChargeView,
  type GenerationResult,
} from "../models/dto/finance.dto";
import { lateFeeOf, money, sumOf, type LateFeeRule } from "../models/entity/money";
import { chargeInclude, chargeScope, toChargeView, type ChargeRow } from "./charge-view";

type Tx = Prisma.TransactionClient;

const percentOf = (descuento: number, monto: number) => (monto > 0 ? money((descuento / monto) * 100) : 0);

/**
 * Cargos (M09): alta individual, generación masiva idempotente por grupo o
 * ciclo, cancelación con motivo, recargos por mora y estado de cuenta. El
 * estatus (`PENDIENTE → PARCIAL → PAGADO`) lo recalculan los pagos.
 */
export class ChargeService {
  constructor(
    private readonly students: StudentService,
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  async load(id: string, user: UserPermissions | null, client: PrismaClient | Tx = this.db): Promise<ChargeRow> {
    const scoped = user ? await chargeScope(user) : null;
    const row = await client.charge.findFirst({ where: { AND: [{ id }, ...(scoped ? [scoped] : [])] }, include: chargeInclude });
    if (!row) throw new HttpError(404, "CHARGE_NOT_FOUND");
    return row;
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<ChargeView>> {
    const { filters } = params;
    const and: Prisma.ChargeWhereInput[] = [];
    for (const key of ["studentId", "conceptId", "termId"] as const) {
      const value = filterId(filters, key);
      if (value) and.push({ [key]: value });
    }
    const status = filterEnum(filters, "status", CHARGE_STATUSES);
    if (status) and.push({ status });
    const tipo = filterEnum(filters, "conceptTipo", FEE_CONCEPT_TYPES);
    if (tipo) and.push({ concept: { tipo } });
    const matricula = filterText(filters, "matricula");
    if (matricula) and.push({ student: { matricula } });
    const nombre = filterText(filters, "studentNombre");
    if (nombre) {
      for (const word of nombre.contains.split(/\s+/).filter(Boolean)) {
        const contains = { contains: word, mode: "insensitive" as const };
        and.push({ student: { OR: [{ nombres: contains }, { apellidoPaterno: contains }, { apellidoMaterno: contains }] } });
      }
    }
    const vence = filterDayRange(filters, "fechaVencimiento");
    if (vence) and.push({ fechaVencimiento: vence });
    const vencido = filterBool(filters, "vencido");
    if (vencido !== undefined) {
      const today = toDbDay(todayInBusinessZone());
      and.push(
        vencido
          ? { status: { in: ["PENDIENTE", "PARCIAL"] }, fechaVencimiento: { lt: today } }
          : { NOT: { status: { in: ["PENDIENTE", "PARCIAL"] }, fechaVencimiento: { lt: today } } }
      );
    }
    const scoped = await chargeScope(user);
    if (scoped) and.push(scoped);
    const orderBy = orderByOf(
      params.sort,
      {
        fechaVencimiento: "fechaVencimiento",
        monto: "monto",
        status: "status",
        createdAt: "createdAt",
        studentNombre: (direction) => ({ student: { apellidoPaterno: direction } }),
      },
      [{ fechaVencimiento: "desc" }, { createdAt: "desc" }]
    );
    const result = await paginatedQuery<ChargeRow>({
      model: this.db.charge,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy,
      include: chargeInclude,
      page: params.page,
      limit: params.limit,
    });
    const today = todayInBusinessZone();
    return { data: result.data.map((row) => toChargeView(row, today)), total: result.total };
  }

  async getById(id: string, user: UserPermissions): Promise<ChargeView> {
    return toChargeView(await this.load(id, user));
  }

  private async concept(id: string) {
    const concept = await this.db.feeConcept.findUnique({ where: { id } });
    if (!concept) throw new HttpError(400, "FEE_CONCEPT_NOT_FOUND");
    if (!concept.active) throw new HttpError(409, "FEE_CONCEPT_INACTIVE");
    if (concept.tipo === "RECARGO") throw new HttpError(409, "FEE_CONCEPT_RESERVED");
    return concept;
  }

  private amounts(input: { monto?: number; descuento?: number }, base: Prisma.Decimal) {
    const monto = input.monto ?? Number(base);
    const descuento = input.descuento ?? 0;
    if (monto <= 0) throw new HttpError(400, "VALIDATION_ERROR", {}, { fieldErrors: { monto: ["> 0"] } });
    if (descuento > monto) throw new HttpError(400, "DISCOUNT_EXCEEDS_AMOUNT");
    return { monto, descuento };
  }

  async create(input: ChargeCreateInput, actor: AuthenticatedUser): Promise<ChargeView> {
    const concept = await this.concept(input.conceptId);
    const { monto, descuento } = this.amounts(input, concept.monto);
    enforcePolicy("charges.create", actor, {
      monto, descuento, porcentajeDescuento: percentOf(descuento, monto), conceptTipo: concept.tipo, masivo: false,
    });
    const student = await this.db.student.findUnique({ where: { id: input.studentId }, select: { id: true } });
    if (!student) throw new HttpError(400, "STUDENT_NOT_FOUND");
    if (input.termId && !(await this.db.term.findUnique({ where: { id: input.termId }, select: { id: true } }))) {
      throw new HttpError(400, "TERM_NOT_FOUND");
    }
    return this.db.$transaction(async (tx) => {
      const row = await tx.charge.create({
        data: {
          studentId: input.studentId,
          conceptId: concept.id,
          termId: input.termId ?? null,
          descripcion: input.descripcion ?? null,
          monto,
          descuento,
          fechaVencimiento: toDbDay(input.fechaVencimiento),
          createdBy: actor.id,
        },
        include: chargeInclude,
      });
      const view = toChargeView(row);
      await this.audit?.(
        { action: "CHARGE_CREATED", entityType: "Charge", entityId: row.id, userId: actor.id, userName: actor.username,
          newState: { studentId: view.studentId, concepto: view.conceptNombre, monto, descuento, fechaVencimiento: view.fechaVencimiento } },
        tx
      );
      return view;
    });
  }

  /**
   * Generación masiva a los alumnos ACTIVOS inscritos (vigentes) en un grupo o
   * en un ciclo. Idempotente dos veces: con `Idempotency-Key` se repite la
   * misma respuesta, y sin ella no se duplica un cargo vigente del mismo
   * alumno, concepto, ciclo y vencimiento (cuenta como `skipped`).
   */
  async generate(input: ChargeGenerateInput, actor: AuthenticatedUser, idempotencyKey?: string): Promise<GenerationResult & { replayed: boolean }> {
    const concept = await this.concept(input.conceptId);
    const { monto, descuento } = this.amounts(input, concept.monto);
    enforcePolicy("charges.create", actor, {
      monto, descuento, porcentajeDescuento: percentOf(descuento, monto), conceptTipo: concept.tipo, masivo: true,
    });
    let termId = input.termId;
    let enrollmentWhere: Prisma.EnrollmentWhereInput;
    if (input.scope === "group") {
      if (!input.groupId) throw new HttpError(400, "GENERATION_TARGET_REQUIRED");
      const group = await this.db.group.findUnique({ where: { id: input.groupId }, select: { termId: true } });
      if (!group) throw new HttpError(400, "GROUP_NOT_FOUND");
      termId = group.termId;
      enrollmentWhere = { groupId: input.groupId };
    } else {
      if (!input.termId) throw new HttpError(400, "GENERATION_TARGET_REQUIRED");
      if (!(await this.db.term.findUnique({ where: { id: input.termId }, select: { id: true } }))) {
        throw new HttpError(400, "TERM_NOT_FOUND");
      }
      enrollmentWhere = { group: { termId: input.termId } };
    }
    const dueDay = toDbDay(input.fechaVencimiento);

    const { result, replayed } = await serializable((tx) =>
      once(tx, idempotencyKey, { userId: actor.id, scope: "charges.generate" }, async () => {
        const students = await tx.student.findMany({
          where: { status: "ACTIVO", enrollments: { some: { ...enrollmentWhere, status: "INSCRITO" } } },
          select: { id: true },
        });
        const existing = await tx.charge.findMany({
          where: {
            studentId: { in: students.map((s) => s.id) },
            conceptId: concept.id,
            termId: termId ?? null,
            fechaVencimiento: dueDay,
            status: { not: "CANCELADO" },
          },
          select: { studentId: true },
        });
        const already = new Set(existing.map((c) => c.studentId));
        const targets = students.filter((s) => !already.has(s.id));
        const created: Array<{ id: string }> = [];
        for (const s of targets) {
          created.push(
            await tx.charge.create({
              data: {
                studentId: s.id, conceptId: concept.id, termId: termId ?? null, descripcion: input.descripcion ?? null,
                monto, descuento, fechaVencimiento: dueDay, createdBy: actor.id,
              },
              select: { id: true },
            })
          );
        }
        await this.audit?.(
          { action: "CHARGE_GENERATED", entityType: "Charge", userId: actor.id, userName: actor.username,
            metadata: { conceptId: concept.id, concepto: concept.nombre, scope: input.scope, groupId: input.groupId ?? null,
              termId: termId ?? null, fechaVencimiento: input.fechaVencimiento, monto, descuento,
              created: created.length, skipped: already.size, idempotencyKey: idempotencyKey ?? null } },
          tx
        );
        return { created: created.length, skipped: already.size, charges: created };
      })
    );
    return { ...result, replayed };
  }

  /** Cancelación con motivo; con pagos vigentes hay que cancelarlos antes. */
  async cancel(id: string, motivo: string, actor: AuthenticatedUser): Promise<ChargeView> {
    const previous = await this.load(id, null);
    if (previous.status === "CANCELADO") throw new HttpError(409, "CHARGE_ALREADY_CANCELLED");
    if (previous.payments.length > 0) throw new HttpError(409, "CHARGE_HAS_PAYMENTS", { count: previous.payments.length });
    return this.db.$transaction(async (tx) => {
      const changed = await tx.charge.updateMany({
        where: { id, status: { not: "CANCELADO" }, payments: { none: { cancelledAt: null } } },
        data: { status: "CANCELADO", cancelledAt: new Date(), cancelReason: motivo, cancelledBy: actor.id },
      });
      if (changed.count === 0) throw new HttpError(409, "CHARGE_HAS_PAYMENTS", { count: 1 });
      await this.audit?.(
        { action: "CHARGE_CANCELLED", entityType: "Charge", entityId: id, userId: actor.id, userName: actor.username,
          previousState: { status: previous.status }, newState: { status: "CANCELADO" }, metadata: { motivo } },
        tx
      );
      return toChargeView(await this.load(id, null, tx));
    });
  }

  private async lateFeeRule(): Promise<LateFeeRule> {
    const row = await this.db.setting.findUnique({ where: { key: "LATE_FEE" } });
    const value = (row?.value ?? {}) as Partial<LateFeeRule>;
    return { enabled: value.enabled === true, dailyRate: Number(value.dailyRate ?? 0), graceDays: Number(value.graceDays ?? 0) };
  }

  /**
   * Recargos por mora (M11 `LATE_FEE`): un cargo RECARGO por cada cargo vencido
   * con saldo. Si el recargo aún no tiene pagos se actualiza al monto del día;
   * si ya se pagó algo, se respeta. Repetirlo el mismo día no cambia nada.
   */
  async applyLateFees(asOf: string | undefined, actor: AuthenticatedUser) {
    const rule = await this.lateFeeRule();
    if (!rule.enabled) throw new HttpError(409, "LATE_FEES_DISABLED");
    const today = asOf ?? todayInBusinessZone();
    const concept = await this.db.feeConcept.findFirst({ where: { tipo: "RECARGO" } });
    if (!concept) throw new HttpError(409, "FEE_CONCEPT_NOT_FOUND");
    const overdue = await this.db.charge.findMany({
      where: {
        status: { in: ["PENDIENTE", "PARCIAL"] },
        fechaVencimiento: { lt: toDbDay(today) },
        concept: { tipo: { not: "RECARGO" } },
      },
      include: { ...chargeInclude, lateFee: { include: { payments: { where: { cancelledAt: null }, select: { id: true } } } } },
    });
    let created = 0;
    let updated = 0;
    let skipped = 0;
    await this.db.$transaction(async (tx) => {
      for (const charge of overdue) {
        const view = toChargeView(charge, today);
        const fee = lateFeeOf(view.saldo, view.fechaVencimiento, today, rule);
        if (fee <= 0) {
          skipped += 1;
          continue;
        }
        const existing = charge.lateFee;
        if (!existing) {
          await tx.charge.create({
            data: {
              studentId: charge.studentId, conceptId: concept.id, termId: charge.termId, parentChargeId: charge.id,
              descripcion: `Recargo: ${charge.descripcion ?? charge.concept.nombre}`, monto: fee,
              fechaVencimiento: toDbDay(today), createdBy: actor.id,
            },
          });
          created += 1;
        } else if (existing.status !== "CANCELADO" && existing.payments.length === 0 && Number(existing.monto) !== fee) {
          await tx.charge.update({ where: { id: existing.id }, data: { monto: fee } });
          updated += 1;
        } else {
          skipped += 1;
        }
      }
      await this.audit?.(
        { action: "LATE_FEES_APPLIED", entityType: "Charge", userId: actor.id, userName: actor.username,
          metadata: { asOf: today, rule: { ...rule }, created, updated, skipped } },
        tx
      );
    });
    return { asOf: today, created, updated, skipped };
  }

  /** Estado de cuenta (M09 §4.10): cargos vigentes con sus pagos y totales. */
  async statement(studentId: string, actor: AuthenticatedUser): Promise<AccountStatement> {
    const student = await this.students.loadScoped(studentId, actor, "charges.view");
    const [rows, settings] = await Promise.all([
      this.db.charge.findMany({
        where: { studentId, status: { not: "CANCELADO" } },
        include: {
          ...chargeInclude,
          payments: {
            where: { cancelledAt: null },
            select: { id: true, reciboFolio: true, fecha: true, monto: true, metodo: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ fechaVencimiento: "asc" }, { createdAt: "asc" }],
      }),
      this.db.setting.findMany({ where: { key: { in: ["SCHOOL_NAME", "SCHOOL_ADDRESS", "SCHOOL_PHONE", "SCHOOL_EMAIL"] } } }),
    ]);
    const today = todayInBusinessZone();
    const setting = new Map(settings.map((s) => [s.key, String(s.value ?? "")]));
    const charges = rows.map((row) => ({
      ...toChargeView(row, today),
      payments: row.payments.map((p) => ({
        id: p.id, reciboFolio: p.reciboFolio, fecha: fromDbDay(p.fecha), monto: Number(p.monto), metodo: p.metodo,
      })),
    }));
    return {
      student: { id: student.id, matricula: student.matricula, nombre: fullName(student), status: student.status },
      escuela: {
        nombre: setting.get("SCHOOL_NAME") || "CYC",
        direccion: setting.get("SCHOOL_ADDRESS") ?? "",
        telefono: setting.get("SCHOOL_PHONE") ?? "",
        email: setting.get("SCHOOL_EMAIL") ?? "",
      },
      charges,
      totals: {
        cargos: sumOf(charges.map((c) => c.monto)),
        descuentos: sumOf(charges.map((c) => c.descuento)),
        pagado: sumOf(charges.map((c) => c.pagado)),
        saldo: sumOf(charges.map((c) => c.saldo)),
        vencido: sumOf(charges.filter((c) => c.vencido).map((c) => c.saldo)),
      },
      generadoEn: new Date().toISOString(),
    };
  }
}
