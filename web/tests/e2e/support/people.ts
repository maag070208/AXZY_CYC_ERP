/** CURP válidas (con dígito verificador) y únicas por corrida para la suite web. */
const DICTIONARY = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";

let counter = 0;

export const makeCurp = (birth: string, sex: "H" | "M" = "H"): string => {
  counter += 1;
  const seed = Date.now() + counter * 7919 + Math.floor(Math.random() * 1000);
  const c = (n: number) => CONSONANTS[Math.floor(seed / n) % CONSONANTS.length];
  const [y, m, d] = birth.split("-");
  const first17 = `EEXX${y.slice(2)}${m}${d}${sex}DF${c(1)}${c(21)}${c(441)}${"ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"[seed % 34]}`;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += DICTIONARY.indexOf(first17[i]) * (18 - i);
  return `${first17}${(10 - (sum % 10)) % 10}`;
};

/** `dd/mm/aaaa` para escribir en `ITDatePicker` a partir de `AAAA-MM-DD`. */
export const typedDate = (day: string): string => {
  const [y, m, d] = day.split("-");
  return `${d}${m}${y}`;
};
