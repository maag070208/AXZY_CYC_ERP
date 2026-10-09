/**
 * Días del calendario (`@db.Date`) como `AAAA-MM-DD`, sin corrimiento de zona.
 * La institución opera en `America/Mexico_City` (D-006).
 */
export const BUSINESS_TIMEZONE = "America/Mexico_City";

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `AAAA-MM-DD` → `Date` a medianoche UTC (lo que Prisma guarda en `@db.Date`). */
export const toDbDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

/** `@db.Date` → `AAAA-MM-DD`. */
export const fromDbDay = (date: Date): string => date.toISOString().slice(0, 10);

/** ¿Es un día real del calendario? (rechaza 2026-02-30). */
export const isRealDay = (day: string): boolean => {
  if (!DAY_PATTERN.test(day)) return false;
  const date = toDbDay(day);
  return !Number.isNaN(date.getTime()) && fromDbDay(date) === day;
};

/** Hoy en la zona de la institución, como `AAAA-MM-DD`. */
export const todayInBusinessZone = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

/** Edad cumplida en años a la fecha `today` (ambos `AAAA-MM-DD`). */
export const ageOn = (birthDay: string, today: string): number => {
  const [by, bm, bd] = birthDay.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
};
