import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { once } from "@core/db/idempotency";
import { paginatedQuery } from "@core/db/table";
import { HttpError } from "@core/middlewares/error.middleware";
import { toDbDay } from "@core/utils/day";
import { filterEnum, filterText, orderByOf, type ITDataTableFetchParams, type ITDataTableResponse } from "@core/utils/table";
import type { AuthenticatedUser } from "@core/utils/security";
import type { AuditLogger } from "@modules/audit";
import { applyDiscount, buildChargeSchedule, chargeDescription, dueDayFor, monthsPerPeriod, type ChargeKind } from "../models/entity/program-rules";
import type { PlanCreateInput, PlanDetailView, PlanView } from "../models/dto/program.dto";

type Tx = Prisma.TransactionClient;

const include = {
  student: { select: { id: true, matricula: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true } },
  program: { select: { id: true, code: true, name: true } },
  term: { select: { id: true, nombre: true } },
  charges: { orderBy: { planChargeIndex: "asc" } },
} satisfies Prisma.StudentPlanInclude;
type PlanRow = Prisma.StudentPlanGetPayload<{ include: typeof include }>;

const studentName = (s: { nombres: string; apellidoPaterno: string; apellidoMaterno: string | null }): string =>
  [s.nombres, s.apellidoPaterno, s.apellidoMaterno].filter(Boolean).join(" ");

const toPlanView = (row: PlanRow): PlanView => {
  const amounts = row.charges.map((c) => Number(c.monto));
  const dates = row.charges.map((c) => c.fechaVencimiento.toISOString().slice(0, 10)).sort();
  return {
    id: row.id,
    student: { id: row.student.id, matricula: row.student.matricula, name: studentName(row.student) },
    program: { id: row.program.id, code: row.program.code, name: row.program.name },
    term: row.term ? { id: row.term.id, nombre: row.term.nombre } : null,
    startDate: row.startDate.toISOString().slice(0, 10),
    periodType: row.periodType,
    periodCount: row.periodCount,
    monthsPerPeriod: monthsPerPeriod(row.periodType, null),
    monthlyFee: Number(row.monthlyFee),
    enrollmentFee: Number(row.enrollmentFee),
    discountPercent: row.discountPercent === null ? null : Number(row.discountPercent),
    discountAmount: row.discountAmount === null ? null : Number(row.discountAmount),
    discountReason: row.discountReason,
    status: row.status,
    totals: {
      charges: row.charges.length,
      enrollmentCharges: row.charges.filter((c) => c.descripcion?.startsWith("Reinscripción")).length,
      monthlyCharges: row.charges.filter((c) => c.descripcion?.startsWith("Colegiatura")).length,
      amount: Math.round(amounts.reduce((sum, a) => sum + a, 0) * 100) / 100,
    },
    firstDueDate: dates[0] ?? null,
    lastDueDate: dates[dates.length - 1] ?? null,
    createdAt: row.createdAt.toISOString(),
  };
};

const toPlanDetail = (row: PlanRow): PlanDetailView => ({
  ...toPlanView(row),
  charges: row.charges.map((c) => ({
    id: c.id,
    planChargeIndex: c.planChargeIndex,
    descripcion: c.descripcion,
    monto: Number(c.monto),
    fechaVencimiento: c.fechaVencimiento.toISOString().slice(0, 10),
    status: c.status,
  })),
});

/** Conceptos genéricos que usan los cargos del plan (M09). */
const CONCEPTS: Record<ChargeKind, { nombre: string; tipo: "INSCRIPCION" | "COLEGIATURA" }> = {
  ENROLLMENT: { nombre: "Reinscripción", tipo: "INSCRIPCION" },
  MONTHLY: { nombre: "Colegiatura", tipo: "COLEGIATURA" },
};

/** M22 — plan de pagos del alumno: generación idempotente de cargos. */
export class PlanService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  /** Día de vencimiento configurable (`settings.PAYMENT_DUE_DAY`, default 5). */
  private async dueDay(): Promise<number> {
    const row = await this.db.setting.findUnique({ where: { key: "PAYMENT_DUE_DAY" }, select: { value: true } });
    const value = Number(row?.value);
    return Number.isInteger(value) && value >= 1 && value <= 28 ? value : 5;
  }

  private async ensureConcept(tx: Tx, kind: ChargeKind): Promise<string> {
    const def = CONCEPTS[kind];
    const existing = await tx.feeConcept.findUnique({ where: { nombre: def.nombre }, select: { id: true } });
    if (existing) return existing.id;
    const created = await tx.feeConcept.create({ data: { nombre: def.nombre, descripcion: "Generado por M22", monto: 0, tipo: def.tipo } });
    return created.id;
  }

  private async load(id: string): Promise<PlanRow> {
    const row = await this.db.studentPlan.findUnique({ where: { id }, include });
    if (!row) throw new HttpError(404, "PLAN_NOT_FOUND");
    return row;
  }

  async table(params: ITDataTableFetchParams): Promise<ITDataTableResponse<PlanView>> {
    const and: Prisma.StudentPlanWhereInput[] = [];
    const studentId = filterText(params.filters, "studentId");
    if (studentId) and.push({ studentId: studentId.contains });
    const status = filterEnum(params.filters, "status", ["ACTIVE", "COMPLETED", "CANCELLED"]);
    if (status) and.push({ status });
    const programName = filterText(params.filters, "program");
    if (programName) and.push({ program: { name: { contains: programName.contains, mode: "insensitive" } } });

    const orderBy = orderByOf(params.sort, { createdAt: "createdAt", startDate: "startDate" }, [{ createdAt: "desc" }]).flat();
    const result = await paginatedQuery<PlanRow>({ model: this.db.studentPlan, where: { AND: and }, orderBy, include, page: params.page, limit: params.limit });
    return { data: result.data.map(toPlanView), total: result.total };
  }

  async getById(id: string): Promise<PlanDetailView> {
    return toPlanDetail(await this.load(id));
  }

  /** Asigna el alumno y genera los cargos (idempotente por `Idempotency-Key`). */
  async create(input: PlanCreateInput, actor: AuthenticatedUser, idempotencyKey?: string): Promise<PlanDetailView & { replayed: boolean }> {
    if (!idempotencyKey) throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY");

    const program = await this.db.program.findUnique({ where: { id: input.programId } });
    if (!program) throw new HttpError(404, "PROGRAM_NOT_FOUND");
    if (!program.active) throw new HttpError(409, "PROGRAM_INACTIVE");
    const student = await this.db.student.findUnique({ where: { id: input.studentId }, select: { id: true, status: true } });
    if (!student) throw new HttpError(404, "STUDENT_NOT_FOUND");
    if (student.status === "BAJA") throw new HttpError(409, "STUDENT_INACTIVE");
    if (input.termId) {
      const term = await this.db.term.findUnique({ where: { id: input.termId }, select: { id: true } });
      if (!term) throw new HttpError(404, "TERM_NOT_FOUND");
    }

    const months = monthsPerPeriod(program.periodType, program.monthsPerPeriod);
    const discount = { percent: input.discountPercent ?? null, amount: input.discountAmount ?? null };
    const schedule = buildChargeSchedule({
      periodCount: program.periodCount,
      monthsPerPeriod: months,
      monthlyFee: Number(program.monthlyFee),
      enrollmentFee: Number(program.enrollmentFee),
    });
    const dueDay = await this.dueDay();

    const { result, replayed } = await this.db.$transaction((tx) =>
      once(tx, idempotencyKey, { userId: actor.id, scope: "plans.create" }, async () => {
        const plan = await tx.studentPlan.create({
          data: {
            studentId: input.studentId,
            programId: input.programId,
            termId: input.termId ?? null,
            startDate: toDbDay(input.startDate),
            periodType: program.periodType,
            periodCount: program.periodCount,
            monthlyFee: program.monthlyFee,
            enrollmentFee: program.enrollmentFee,
            discountPercent: input.discountPercent ?? null,
            discountAmount: input.discountAmount ?? null,
            discountReason: input.discountReason ?? null,
            createdBy: actor.id,
          },
        });
        const conceptIds: Record<ChargeKind, string> = {
          ENROLLMENT: await this.ensureConcept(tx, "ENROLLMENT"),
          MONTHLY: await this.ensureConcept(tx, "MONTHLY"),
        };
        await tx.charge.createMany({
          data: schedule.map((seed) => ({
            studentId: input.studentId,
            conceptId: conceptIds[seed.kind],
            termId: input.termId ?? null,
            planId: plan.id,
            planChargeIndex: seed.index,
            descripcion: chargeDescription(seed),
            monto: applyDiscount(seed.amount, discount),
            fechaVencimiento: toDbDay(dueDayFor(input.startDate, seed.monthOffset, dueDay)),
            createdBy: actor.id,
          })),
        });
        await this.audit?.(
          { action: "STUDENT_PLAN_CREATED", entityType: "StudentPlan", entityId: plan.id, userId: actor.id, userName: actor.username,
            metadata: { programId: input.programId, studentId: input.studentId, charges: schedule.length, discount } },
          tx
        );
        const row = await tx.studentPlan.findUniqueOrThrow({ where: { id: plan.id }, include });
        return toPlanDetail(row);
      })
    );
    return { ...result, replayed };
  }

  /** Cancela el plan y sus cargos pendientes sin pagos (conserva los pagados). */
  async cancel(id: string, reason: string, actor: AuthenticatedUser): Promise<PlanDetailView> {
    const plan = await this.load(id);
    if (plan.status !== "ACTIVE") throw new HttpError(409, "PLAN_NOT_ACTIVE");
    await this.db.$transaction(async (tx) => {
      await tx.charge.updateMany({
        where: { planId: id, status: "PENDIENTE", payments: { none: {} } },
        data: { status: "CANCELADO", cancelledAt: new Date(), cancelReason: reason, cancelledBy: actor.id },
      });
      await tx.studentPlan.update({ where: { id }, data: { status: "CANCELLED" } });
      await this.audit?.(
        { action: "STUDENT_PLAN_CANCELLED", entityType: "StudentPlan", entityId: id, userId: actor.id, userName: actor.username, metadata: { reason } },
        tx
      );
    });
    return this.getById(id);
  }
}
