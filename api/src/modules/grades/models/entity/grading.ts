import { Prisma } from "@prisma/client";

/**
 * Cálculo de calificaciones (M08), **puro** y en decimal exacto (nunca punto
 * flotante): ponderaciones y calificaciones llegan como `Decimal` de Prisma o
 * números, y el resultado se redondea a 2 decimales con `ROUND_HALF_UP` (D-028).
 */
type Num = Prisma.Decimal | number | string;
const D = (value: Num) => new Prisma.Decimal(value);

export interface WeightedItem {
  id: string;
  ponderacion: Num;
  maxScore: Num;
}

export type ScoreMap = Record<string, Num | null | undefined>;

/** Redondeo comercial a 2 decimales. */
export const round2 = (value: Num): number => D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();

/** Suma de ponderaciones (en %). */
export const weightsTotal = (items: readonly Pick<WeightedItem, "ponderacion">[]): number =>
  round2(items.reduce((sum, item) => sum.plus(D(item.ponderacion)), D(0)));

/** ¿Las ponderaciones suman exactamente 100.00? */
export const weightsComplete = (items: readonly Pick<WeightedItem, "ponderacion">[]): boolean =>
  D(weightsTotal(items)).equals(100);

/**
 * Calificación final = Σ (score / maxScore) × ponderación. Lo no capturado
 * cuenta como 0 en la proyección; `missing` dice cuántos faltan.
 */
export const finalGradeOf = (items: readonly WeightedItem[], scores: ScoreMap): { final: number; missing: number } => {
  let missing = 0;
  const total = items.reduce((sum, item) => {
    const score = scores[item.id];
    if (score === null || score === undefined) {
      missing += 1;
      return sum;
    }
    return sum.plus(D(score).div(D(item.maxScore)).times(D(item.ponderacion)));
  }, D(0));
  return { final: round2(total), missing };
};

export type GradeResult = "ACREDITADO" | "REPROBADO";

/** Regla de aprobación configurable (M11 `MIN_PASSING_GRADE`): `>= umbral` acredita. */
export const resultOf = (final: Num, threshold: Num): GradeResult =>
  D(final).greaterThanOrEqualTo(D(threshold)) ? "ACREDITADO" : "REPROBADO";

/** ¿El valor está en `[0, max]`? */
export const scoreInRange = (score: Num, max: Num): boolean => D(score).greaterThanOrEqualTo(0) && D(score).lessThanOrEqualTo(D(max));

/** ¿Tiene a lo más 2 decimales? (las columnas son `Decimal(…, 2)`). */
export const hasTwoDecimalsAtMost = (value: number): boolean =>
  Number.isFinite(value) && D(value).decimalPlaces() <= 2;
