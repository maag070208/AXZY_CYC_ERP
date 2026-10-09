/**
 * Validación de CURP según el formato oficial de RENAPO: estructura (iniciales,
 * fecha, sexo, entidad, consonantes internas) y **dígito verificador**. Pura.
 */

const STATES =
  "AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE";

export const CURP_PATTERN = new RegExp(
  `^[A-Z][AEIOUX][A-Z]{2}\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])[HMX](${STATES})[B-DF-HJ-NP-TV-Z]{3}[A-Z\\d]\\d$`
);

const DICTIONARY = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

/** Dígito verificador de los primeros 17 caracteres. */
export const curpCheckDigit = (first17: string): number => {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += DICTIONARY.indexOf(first17[i]) * (18 - i);
  return (10 - (sum % 10)) % 10;
};

/** Normaliza (mayúsculas, sin espacios). */
export const normalizeCurp = (value: string): string => value.trim().toUpperCase();

/** ¿La CURP tiene formato válido y su dígito verificador cuadra? */
export const isValidCurp = (value: string): boolean => {
  const curp = normalizeCurp(value);
  if (!CURP_PATTERN.test(curp)) return false;
  return curpCheckDigit(curp.slice(0, 17)) === Number(curp[17]);
};
