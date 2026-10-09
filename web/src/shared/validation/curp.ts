import { i18n } from "@shared/i18n";

const STATES =
  "AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE";
const CURP_PATTERN = new RegExp(
  `^[A-Z][AEIOUX][A-Z]{2}\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])[HMX](${STATES})[B-DF-HJ-NP-TV-Z]{3}[A-Z\\d]\\d$`
);
const DICTIONARY = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

/** ¿Estructura oficial y dígito verificador correctos? (mismo algoritmo que la API). */
export const isValidCurp = (value: string): boolean => {
  const curp = value.trim().toUpperCase();
  if (!CURP_PATTERN.test(curp)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += DICTIONARY.indexOf(curp[i]) * (18 - i);
  return (10 - (sum % 10)) % 10 === Number(curp[17]);
};

/** Validador de formulario: `null` si es válida o está vacía. */
export const validateCurp = (value: string | null | undefined): string | null => {
  if (value == null || value.trim() === "") return null;
  return isValidCurp(value) ? null : i18n.t("common:validation.invalidCurp");
};
