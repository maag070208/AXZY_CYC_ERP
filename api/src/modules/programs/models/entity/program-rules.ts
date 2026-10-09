/**
 * Reglas **puras** de M22 (programas, plan de estudios y plan de pagos). Sin BD:
 * se prueban de forma unitaria.
 */

export const PERIOD_TYPES = ["BIMONTHLY", "TRIMESTER", "QUADRIMESTER", "SEMESTER"] as const;
export type PeriodTypeValue = (typeof PERIOD_TYPES)[number];

/** Meses que dura cada periodo. */
export const MONTHS_PER_PERIOD: Record<PeriodTypeValue, number> = {
  BIMONTHLY: 2,
  TRIMESTER: 3,
  QUADRIMESTER: 4,
  SEMESTER: 6,
};

/** Meses por periodo (el override de la carrera gana). */
export const monthsPerPeriod = (type: PeriodTypeValue, override?: number | null): number =>
  override && override > 0 ? override : MONTHS_PER_PERIOD[type];

export type ChargeKind = "ENROLLMENT" | "MONTHLY";

export interface ChargeSeed {
  /** Índice consecutivo dentro del plan (0..n), para idempotencia. */
  index: number;
  kind: ChargeKind;
  period: number;
  /** Mes dentro del periodo (solo `MONTHLY`, 1-based). */
  monthInPeriod?: number;
  /** Meses desde el inicio del plan (0 = mes de `startDate`). */
  monthOffset: number;
  /** Monto base (sin descuento). */
  amount: number;
}

export interface ScheduleInput {
  periodCount: number;
  monthsPerPeriod: number;
  monthlyFee: number;
  enrollmentFee: number;
}

/**
 * Calendario de cargos: por cada periodo, **una reinscripción** (si su monto es
 * > 0) + `monthsPerPeriod` **mensualidades**. El índice es consecutivo y estable.
 */
export const buildChargeSchedule = ({
  periodCount,
  monthsPerPeriod,
  monthlyFee,
  enrollmentFee,
}: ScheduleInput): ChargeSeed[] => {
  const charges: ChargeSeed[] = [];
  let index = 0;
  for (let period = 1; period <= periodCount; period += 1) {
    const periodOffset = (period - 1) * monthsPerPeriod;
    if (enrollmentFee > 0) {
      charges.push({ index: index++, kind: "ENROLLMENT", period, monthOffset: periodOffset, amount: enrollmentFee });
    }
    for (let month = 0; month < monthsPerPeriod; month += 1) {
      charges.push({ index: index++, kind: "MONTHLY", period, monthInPeriod: month + 1, monthOffset: periodOffset + month, amount: monthlyFee });
    }
  }
  return charges;
};

export interface Discount {
  percent?: number | null;
  amount?: number | null;
}

/** Aplica descuento: el porcentaje gana si viene; si no, resta el monto. Nunca < 0. */
export const applyDiscount = (base: number, discount: Discount): number => {
  let value = base;
  if (discount.percent != null) value = base * (1 - discount.percent / 100);
  else if (discount.amount != null) value = base - discount.amount;
  return Math.max(0, Math.round(value * 100) / 100);
};

/**
 * Vencimiento: día fijo del mes (`dueDay`) desplazado `monthOffset` meses desde
 * `startDay` (`AAAA-MM-DD`). Se calcula en UTC para no correr por zona horaria.
 */
export const dueDayFor = (startDay: string, monthOffset: number, dueDay: number): string => {
  const [year, month] = startDay.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + monthOffset, dueDay));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

/** Descripción legible del cargo (se guarda en `Charge.descripcion`). */
export const chargeDescription = (seed: ChargeSeed): string =>
  seed.kind === "ENROLLMENT"
    ? `Reinscripción — Periodo ${seed.period}`
    : `Colegiatura — Periodo ${seed.period} · Mes ${seed.monthInPeriod}`;

/** Totales del plan a partir de los cargos generados. */
export const planTotals = (charges: ChargeSeed[]): { charges: number; enrollmentCharges: number; monthlyCharges: number; amount: number } => ({
  charges: charges.length,
  enrollmentCharges: charges.filter((c) => c.kind === "ENROLLMENT").length,
  monthlyCharges: charges.filter((c) => c.kind === "MONTHLY").length,
  amount: Math.round(charges.reduce((sum, c) => sum + c.amount, 0) * 100) / 100,
});
