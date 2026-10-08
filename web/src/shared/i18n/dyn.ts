import type { TFunction } from "i18next";

type LooseTranslate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Traductor para llaves construidas en runtime (p. ej. `roles.${roleKey}`): el
 * tipado estricto de i18next no puede validar una plantilla, así que se relaja
 * aquí y en un solo lugar.
 */
export const dyn =
  (tt: TFunction<any>): LooseTranslate =>
  (key, options) =>
    (tt as LooseTranslate)(key, options);
