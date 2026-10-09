const pad = (n: number) => String(n).padStart(2, "0");

/** `Date` local → día del calendario `AAAA-MM-DD` (sin corrimiento a UTC). */
export const toDay = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** `AAAA-MM-DD` → `Date` local a medianoche. */
export const fromDay = (day: string): Date => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** `AAAA-MM-DD` legible en el idioma de la interfaz. */
export const formatDay = (day: string | null | undefined, locale: string): string =>
  day ? fromDay(day).toLocaleDateString(locale, { dateStyle: "medium" }) : "—";

/** Instante ISO → valor de `<input type="datetime-local">` en la zona local. */
export const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${toDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Valor de `<input type="datetime-local">` → instante ISO (UTC); "" → null. */
export const fromLocalInput = (value: string): string | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Instante ISO legible (fecha y hora) en el idioma de la interfaz. */
export const formatInstant = (iso: string | null | undefined, locale: string): string =>
  iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "—";
