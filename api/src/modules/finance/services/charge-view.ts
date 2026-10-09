import type { Prisma } from "@prisma/client";
import { scopeWhere, type UserPermissions } from "@core/permissions";
import { fromDbDay, todayInBusinessZone } from "@core/utils/day";
import { fullName } from "@modules/students/services/student.service";
import type { ChargeView } from "../models/dto/finance.dto";
import { balanceOf, chargeTotal, sumOf } from "../models/entity/money";

export const chargeInclude = {
  student: { select: { matricula: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true } },
  concept: { select: { nombre: true, tipo: true } },
  term: { select: { name: true } },
  payments: { where: { cancelledAt: null }, select: { monto: true } },
} satisfies Prisma.ChargeInclude;

export type ChargeRow = Prisma.ChargeGetPayload<{ include: typeof chargeInclude }>;

/** Vista del cargo con total, pagado, saldo y vencimiento calculados. */
export const toChargeView = (row: ChargeRow, today = todayInBusinessZone()): ChargeView => {
  const total = chargeTotal(row.monto, row.descuento);
  const pagado = sumOf(row.payments.map((p) => p.monto));
  const saldo = row.status === "CANCELADO" ? 0 : balanceOf(total, pagado);
  const fechaVencimiento = fromDbDay(row.fechaVencimiento);
  return {
    id: row.id,
    studentId: row.studentId,
    matricula: row.student.matricula,
    studentNombre: fullName(row.student),
    conceptId: row.conceptId,
    conceptNombre: row.concept.nombre,
    conceptTipo: row.concept.tipo,
    termId: row.termId,
    termNombre: row.term?.name ?? null,
    descripcion: row.descripcion,
    monto: Number(row.monto),
    descuento: Number(row.descuento),
    total,
    pagado,
    saldo,
    fechaVencimiento,
    vencido: saldo > 0 && fechaVencimiento < today,
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
