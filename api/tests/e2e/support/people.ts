/**
 * Datos de personas para las suites: CURP válidas (con dígito verificador) y
 * únicas por corrida.
 */
const DICTIONARY = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";

const checkDigit = (first17: string): number => {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += DICTIONARY.indexOf(first17[i]) * (18 - i);
  return (10 - (sum % 10)) % 10;
};

let counter = 0;

/** CURP válida y distinta en cada llamada; `birth` es `AAAA-MM-DD`. */
export const makeCurp = (birth: string, sex: "H" | "M" = "H"): string => {
  counter += 1;
  const seed = Date.now() + counter * 7919 + Math.floor(Math.random() * 1000);
  const c = (n: number) => CONSONANTS[Math.floor(seed / n) % CONSONANTS.length];
  const homoclave = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"[seed % 34];
  const [y, m, d] = birth.split("-");
  const first17 = `EEXX${y.slice(2)}${m}${d}${sex}DF${c(1)}${c(21)}${c(441)}${homoclave}`;
  return `${first17}${checkDigit(first17)}`;
};

/** `AAAA-MM-DD` de hace `years` años. */
export const yearsAgo = (years: number): string => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
};
