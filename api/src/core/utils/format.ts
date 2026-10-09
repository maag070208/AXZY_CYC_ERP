import { BUSINESS_TIMEZONE } from "./day";

/** Formatos para textos dirigidos a personas (notificaciones, avisos). */
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export const formatMoney = (value: number | string | { toString(): string }): string => money.format(Number(value.toString()));

/** `AAAA-MM-DD` → «15 oct 2026». */
export const formatDay = (day: string): string =>
  new Date(`${day}T12:00:00.000Z`).toLocaleDateString("es-MX", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

/** Instante → «15 oct 2026, 08:00» en la zona de la institución. */
export const formatInstant = (date: Date): string =>
  date.toLocaleString("es-MX", { timeZone: BUSINESS_TIMEZONE, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
