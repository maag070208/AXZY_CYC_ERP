import { t } from "@core/i18n";

/**
 * Reglas **puras** de reactivos (M14 §4.1–4.5, 4.7) y lectura del CSV de
 * importación. Sin BD: se prueban de forma unitaria.
 */
export const QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "MULTIPLE_ANSWER", "OPEN"] as const;
export type QuestionTypeValue = (typeof QUESTION_TYPES)[number];
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type DifficultyValue = (typeof DIFFICULTIES)[number];

export interface OptionInput {
  text: string;
  isCorrect: boolean;
}

export type OptionRuleError =
  | "QUESTION_OPTION_REQUIRED"
  | "QUESTION_OPTION_COUNT_INVALID"
  | "QUESTION_MULTIPLE_CORRECT"
  | "QUESTION_OPEN_NO_OPTIONS";

/** `null` si las opciones son válidas para el tipo; si no, el código del error. */
export const optionRuleError = (type: QuestionTypeValue, options: readonly OptionInput[]): OptionRuleError | null => {
  const correct = options.filter((o) => o.isCorrect).length;
  switch (type) {
    case "OPEN":
      return options.length > 0 ? "QUESTION_OPEN_NO_OPTIONS" : null;
    case "TRUE_FALSE":
      if (options.length !== 2) return "QUESTION_OPTION_COUNT_INVALID";
      if (correct === 0) return "QUESTION_OPTION_REQUIRED";
      return correct > 1 ? "QUESTION_MULTIPLE_CORRECT" : null;
    case "MULTIPLE_CHOICE":
      if (options.length < 2 || options.length > 10) return "QUESTION_OPTION_COUNT_INVALID";
      if (correct === 0) return "QUESTION_OPTION_REQUIRED";
      return correct > 1 ? "QUESTION_MULTIPLE_CORRECT" : null;
    case "MULTIPLE_ANSWER":
      if (options.length < 2 || options.length > 10) return "QUESTION_OPTION_COUNT_INVALID";
      return correct === 0 ? "QUESTION_OPTION_REQUIRED" : null;
  }
};

// --- CSV ---------------------------------------------------------------------

/** Separa un CSV (RFC 4180: comillas dobles, `""` escapado, saltos dentro de comillas). */
export const parseCsv = (text: string, delimiter = ","): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
};

export const CSV_COLUMNS = ["course", "topic", "type", "text", "points", "difficulty", "options", "correct"] as const;

/** Alias de encabezados de origen (español) → columna canónica. */
const CSV_HEADER_ALIASES: Record<string, string> = {
  curso: "course",
  opciones: "options",
  correctas: "correct",
  tema: "topic",
  enunciado: "text",
  texto: "text",
  puntos: "points",
  dificultad: "difficulty",
  tipo: "type",
};

export interface CsvQuestion {
  row: number;
  courseCode: string;
  topic: string | null;
  type: QuestionTypeValue;
  text: string;
  points: number;
  difficulty: DifficultyValue | null;
  options: Array<OptionInput & { sortOrder: number }>;
}

export interface CsvRejection {
  row: number;
  code: string;
  message: string;
}

const norm = (value: string) =>
  value.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_");

/** Alias de etiquetas de origen (español) → valores de enum en inglés. */
const TYPE_ALIASES: Record<string, QuestionTypeValue> = {
  OPCION_MULTIPLE: "MULTIPLE_CHOICE",
  VERDADERO_FALSO: "TRUE_FALSE",
  MULTIPLE_RESPUESTA: "MULTIPLE_ANSWER",
  ABIERTA: "OPEN",
};
const DIFFICULTY_ALIASES: Record<string, DifficultyValue> = {
  FACIL: "EASY",
  MEDIA: "MEDIUM",
  DIFICIL: "HARD",
};

/**
 * Lee el CSV de importación (cabecera obligatoria, `,` o `;`). Cada fila se
 * valida por separado: las inválidas van a `rejected` sin abortar el lote.
 * `options` y `correct` se separan con `|`; `correct` son posiciones
 * (1 = primera opción). En TRUE_FALSE las opciones por omisión son
 * «Verdadero|Falso». Los encabezados en español se aceptan por alias.
 */
export const readQuestionsCsv = (text: string): { rows: CsvQuestion[]; rejected: CsvRejection[]; total: number } => {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const table = parseCsv(text, delimiter);
  if (table.length === 0) throw new Error(t("csv.empty"));
  const header = table[0].map((h) => {
    const key = h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return CSV_HEADER_ALIASES[key] ?? key;
  });
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(t("csv.missingColumns", { columns: missing.join(", ") }));
  const at = (cells: string[], key: (typeof CSV_COLUMNS)[number]) => (cells[header.indexOf(key)] ?? "").trim();

  const rows: CsvQuestion[] = [];
  const rejected: CsvRejection[] = [];
  table.slice(1).forEach((cells, index) => {
    const row = index + 2;
    const reject = (code: string, message: string) => rejected.push({ row, code, message });
    const typeRaw = norm(at(cells, "type"));
    const type = (TYPE_ALIASES[typeRaw] ?? typeRaw) as QuestionTypeValue;
    if (!QUESTION_TYPES.includes(type)) return reject("VALIDATION_ERROR", t("csv.invalidType", { value: at(cells, "type") }));
    const text = at(cells, "text");
    if (text.length < 3) return reject("VALIDATION_ERROR", t("csv.textRequired"));
    const courseCode = at(cells, "course").toUpperCase();
    if (!courseCode) return reject("VALIDATION_ERROR", t("csv.courseRequired"));
    const points = Number(at(cells, "points").replace(",", "."));
    if (!Number.isFinite(points) || points <= 0 || Math.abs(Math.round(points * 100) - points * 100) > 1e-6) {
      return reject("VALIDATION_ERROR", t("csv.invalidPoints"));
    }
    const rawDifficulty = at(cells, "difficulty");
    const difficulty = rawDifficulty ? (DIFFICULTY_ALIASES[norm(rawDifficulty)] ?? (norm(rawDifficulty) as DifficultyValue)) : null;
    if (difficulty && !DIFFICULTIES.includes(difficulty)) return reject("VALIDATION_ERROR", t("csv.invalidDifficulty", { value: rawDifficulty }));
    let texts = at(cells, "options").split("|").map((o) => o.trim()).filter(Boolean);
    if (type === "TRUE_FALSE" && texts.length === 0) texts = [t("csv.trueOption"), t("csv.falseOption")];
    const correctPositions = new Set(
      at(cells, "correct").split("|").map((c) => c.trim()).filter(Boolean).map(Number)
    );
    if ([...correctPositions].some((n) => !Number.isInteger(n) || n < 1 || n > texts.length)) {
      return reject("VALIDATION_ERROR", t("csv.invalidCorrect"));
    }
    const options = texts.map((text, i) => ({ text, isCorrect: correctPositions.has(i + 1), sortOrder: i + 1 }));
    const error = optionRuleError(type, options);
    if (error) return reject(error, t("csv.invalidOptions", { type }));
    rows.push({ row, courseCode, topic: at(cells, "topic") || null, type, text, points, difficulty, options });
  });
  return { rows, rejected, total: table.length - 1 };
};
