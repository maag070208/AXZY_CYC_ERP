/** `1234.5` → `$1,234.50` (pesos mexicanos, en el idioma de la interfaz). */
export const formatMoney = (value: number | null | undefined, locale = "es-MX"): string =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat(locale.startsWith("en") ? "en-US" : "es-MX", { style: "currency", currency: "MXN" }).format(value);

/** Redondeo a centavos para comparar montos capturados. */
export const cents = (value: number): number => Math.round(value * 100) / 100;

/** ¿Número positivo con máximo dos decimales? */
export const isValidAmount = (value: number): boolean =>
  Number.isFinite(value) && value > 0 && Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
