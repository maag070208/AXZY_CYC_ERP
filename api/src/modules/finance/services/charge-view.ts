import type { Prisma } from "@prisma/client";
import { scopeWhere, type UserPermissions } from "@core/permissions";
import { fromDbDay, todayInBusinessZone } from "@core/utils/day";
import { fullName } from "@modules/students/services/student.service";
import type { ChargeView } from "../models/dto/finance.dto";
import { balanceOf, chargeTotal, sumOf } from "../models/entity/money";

export const chargeInclude = {
  student: { select: { studentNumber: true, firstNames: true, paternalSurname: true, maternalSurname: true } },
  concept: { select: { name: true, type: true } },
  term: { select: { name: true } },
  payments: { where: { cancelledAt: null }, select: { amount: true } },
} satisfies Prisma.ChargeInclude;

export type ChargeRow = Prisma.ChargeGetPayload<{ include: typeof chargeInclude }>;

/** Vista del cargo con total, pagado, saldo y vencimiento calculados. */
export const toChargeView = (row: ChargeRow, today = todayInBusinessZone()): ChargeView => {
  const total = chargeTotal(row.amount, row.discount);
  const pagado = sumOf(row.payments.map((p) => p.amount));
  const saldo = row.status === "CANCELLED" ? 0 : balanceOf(total, pagado);
  const dueDate = fromDbDay(row.dueDate);
  return {
    id: row.id,
    studentId: row.studentId,
    studentNumber: row.student.studentNumber,
    studentNombre: fullName(row.student),
    conceptId: row.conceptId,
    conceptNombre: row.concept.name,
    conceptTipo: row.concept.type,
    termId: row.termId,
    termNombre: row.term?.name ?? null,
    description: row.description,
    amount: Number(row.amount),
    discount: Number(row.discount),
    total,
    pagado,
    saldo,
    dueDate,
    vencido: saldo > 0 && dueDate < today,
    status: row.status,
    parentChargeId: row.parentChargeId,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
  };
};

/** Alcance de `charges.view`: OWN = los cargos del alumno vinculado a la cuenta. */
export const chargeScope = (user: UserPermissions) =>
  scopeWhere<Prisma.ChargeWhereInput>(user, {
    resource: "students",
    permission: "charges.view",
    own: (u) => ({ student: { userId: u.id } }),
    byIds: (ids) => ({ studentId: { in: ids } }),
    or: (filters) => ({ OR: filters }),
    none: { id: { in: [] } },
  });
