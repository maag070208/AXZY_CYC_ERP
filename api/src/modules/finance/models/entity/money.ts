import { Prisma } from "@prisma/client";

/**
 * Reglas de dinero de M09, **puras** y en decimal exacto (nunca punto
 * flotante): totales, saldo, estatus del cargo, recargo por mora y folio.
 */
type Num = Prisma.Decimal | number | string;
const D = (value: Num) => new Prisma.Decimal(value);

export type ChargeStatusValue = "PENDING" | "PARTIAL" | "PAID" | "CANCELLED";

/** Redondeo comercial a centavos. */
export const money = (value: Num): number => D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();

/** Total a pagar del cargo: `monto - descuento`. */
export const chargeTotal = (amount: Num, discount: Num): number => money(D(amount).minus(D(discount)));

/** Suma de montos (pagos vigentes, cargos…). */
export const sumOf = (values: readonly Num[]): number => money(values.reduce<Prisma.Decimal>((a, v) => a.plus(D(v)), D(0)));

/** Saldo pendiente (nunca negativo). */
export const balanceOf = (total: Num, paid: Num): number => money(Prisma.Decimal.max(D(total).minus(D(paid)), 0));

/** Estatus del cargo según lo pagado (un cargo cancelado se queda cancelado). */
export const chargeStatusOf = (total: Num, paid: Num, cancelled = false): ChargeStatusValue => {
  if (cancelled) return "CANCELLED";
  if (D(paid).greaterThanOrEqualTo(D(total))) return "PAID";
  if (D(paid).greaterThan(0)) return "PARTIAL";
  return "PENDING";
};

/** ¿Tiene a lo más 2 decimales? (`Decimal(12,2)`). */
export const isCents = (value: number): boolean => Number.isFinite(value) && D(value).decimalPlaces() <= 2;

/** Días naturales entre dos días `AAAA-MM-DD` (`to - from`). */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export interface LateFeeRule {
  enabled: boolean;
  /** Fracción diaria sobre el saldo (0.001 = 0.1 % por día). */
  dailyRate: number;
  graceDays: number;
}

/**
 * Recargo por mora (D-033): `saldo × dailyRate × (díasVencidos − graceDays)`,
 * redondeado a centavos. 0 si está desactivado, si no hay saldo o si aún está
 * dentro de los días de gracia.
 */
export const lateFeeOf = (saldo: Num, dueDay: string, asOf: string, rule: LateFeeRule): number => {
  if (!rule.enabled || rule.dailyRate <= 0 || D(saldo).lessThanOrEqualTo(0)) return 0;
  const days = daysBetween(dueDay, asOf) - rule.graceDays;
  if (days <= 0) return 0;
  return money(D(saldo).times(D(rule.dailyRate)).times(days));
};

/** `REC-AAAA-NNNNNN`. */
export const formatFolio = (year: number, sequence: number): string => `REC-${year}-${String(sequence).padStart(6, "0")}`;

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
