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
