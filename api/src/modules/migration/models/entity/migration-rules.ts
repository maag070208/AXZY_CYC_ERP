/**
 * Reglas **puras** de M20 (migración de históricos): lectura de CSV, normalización
 * de encabezados, validación fila a fila y detección de duplicados por clave
 * natural. Sin BD: se prueban de forma unitaria.
 */
import { ageOn, isRealDay } from "@core/utils/day";
import { isValidCurp, normalizeCurp } from "@core/utils/curp";

export const MIGRATION_ENTITIES = ["Student", "Teacher"] as const;
export type MigrationEntity = (typeof MIGRATION_ENTITIES)[number];
export const isMigrationEntity = (value: string): value is MigrationEntity =>
  (MIGRATION_ENTITIES as readonly string[]).includes(value);

/** Límites de la primera entrega (CSV en memoria). */
export const MAX_MIGRATION_ROWS = 5000;
export const MAX_MIGRATION_BYTES = 2 * 1024 * 1024;
/** Máxima antigüedad del respaldo previo exigido para una importación real. */
export const MAX_BACKUP_AGE_HOURS = 24;

export interface SourceRow {
  /** Número de fila en el archivo (1 = encabezado). */
  rowNumber: number;
  values: Record<string, string>;
}
export interface SourceTable {
  header: string[];
  rows: SourceRow[];
}

export interface ParsedRecord {
  naturalKey: string;
  data: Record<string, unknown>;
}

export interface RowProblem {
  reason: string;
  value: string | null;
}

export interface PlanRow {
  rowNumber: number;
  naturalKey: string | null;
  /** Presente si la fila es válida. */
  record?: ParsedRecord;
  /** Presente si la fila se rechaza. */
  problem?: RowProblem;
}

export interface RowRejection {
  rowNumber: number;
  entity: MigrationEntity;
  naturalKey: string | null;
  reason: string;
  value: string | null;
}

export interface PlanResult {
  checksum: string;
  read: number;
  accepted: ParsedRecord[];
  rejected: RowRejection[];
}

// --- CSV ---------------------------------------------------------------------

/** Separa un CSV (RFC 4180: comillas dobles, `""` escapado, saltos dentro de comillas). */
export const parseCsv = (text: string, delimiter = ","): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
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

/** Detector de delimitador: `;` si el encabezado lo trae y no hay `,`. */
export const detectDelimiter = (firstLine: string): string =>
  firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";

/** Alias de encabezados de origen (español/inglés) → clave interna en inglés. */
const HEADER_ALIASES: Record<string, string> = {
  nombre: "name",
  nombres: "name",
  apellido_paterno: "paternal_surname",
  apellido_materno: "maternal_surname",
  fecha_nacimiento: "birth_date",
  fecha_ingreso: "enrollment_date",
  genero: "gender",
  telefono: "phone",
  direccion: "address",
  matricula: "student_number",
  apellidos: "surnames",
  especialidad: "specialty",
  tutor_nombre: "tutor_name",
  tutor_parentesco: "tutor_relationship",
  tutor_telefono: "tutor_phone",
};

/** Encabezado normalizado a `snake_case` sin acentos ni espacios, con alias. */
export const normalizeHeader = (value: string): string => {
  const key = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return HEADER_ALIASES[key] ?? key;
};

/** Columnas mínimas por entidad (los encabezados del archivo deben cubrirlas). */
export const REQUIRED_COLUMNS: Record<MigrationEntity, readonly string[]> = {
  Student: ["name", "paternal_surname", "curp", "birth_date"],
  Teacher: ["name", "surnames", "email"],
};

const cell = (values: Record<string, string>, key: string): string => (values[key] ?? "").trim();
const optional = (values: Record<string, string>, key: string): string | null => cell(values, key) || null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\-\s]{7,20}$/;
const GENDERS = ["M", "F", "OTHER"] as const;

/** Construye la tabla del CSV: encabezado normalizado y filas indexadas. */
export const readTable = (text: string): SourceTable => {
  const parsed = parseCsv(text, detectDelimiter(text.split(/\r?\n/, 1)[0] ?? ""));
  if (parsed.length === 0) return { header: [], rows: [] };
  const header = parsed[0].map(normalizeHeader);
  const rows: SourceRow[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const values: Record<string, string> = {};
    header.forEach((key, index) => {
      if (key) values[key] = parsed[i][index] ?? "";
    });
    rows.push({ rowNumber: i + 1, values });
  }
  return { header, rows };
};

/** Columnas mínimas que faltan en el encabezado (vacío si está completo). */
export const missingColumns = (entity: MigrationEntity, header: readonly string[]): string[] =>
  REQUIRED_COLUMNS[entity].filter((column) => !header.includes(column));

// --- Validación por entidad ---------------------------------------------------

const problem = (reason: string, value: string | null = null): RowProblem => ({ reason, value });

/** Valida y normaliza una fila de alumno; clave natural = CURP. */
export const parseStudentRow = (values: Record<string, string>, today: string): ParsedRecord | RowProblem => {
  const firstNames = cell(values, "name");
  if (!firstNames) return problem("REQUIRED_FIELD", "name");
  const paternalSurname = cell(values, "paternal_surname");
  if (!paternalSurname) return problem("REQUIRED_FIELD", "paternal_surname");

  const curpRaw = cell(values, "curp");
  if (!curpRaw) return problem("REQUIRED_FIELD", "curp");
  const curp = normalizeCurp(curpRaw);
  if (!isValidCurp(curp)) return problem("INVALID_CURP", curpRaw);

  const birthDate = cell(values, "birth_date");
  if (!birthDate || !isRealDay(birthDate)) return problem("INVALID_DATE", birthDate || "birth_date");
  if (birthDate > today) return problem("INVALID_DATE", birthDate);

  const enrollmentDate = optional(values, "enrollment_date") ?? today;
  if (!isRealDay(enrollmentDate)) return problem("INVALID_DATE", enrollmentDate);

  const genderRaw = optional(values, "gender");
  // El origen suele venir en español: `OTRO` se acepta como alias de `OTHER`.
  const gender = genderRaw?.toUpperCase() === "OTRO" ? "OTHER" : genderRaw;
  if (gender && !(GENDERS as readonly string[]).includes(gender.toUpperCase())) return problem("INVALID_FORMAT", gender);

  const email = optional(values, "email");
  if (email && !EMAIL.test(email)) return problem("INVALID_EMAIL", email);
  const phone = optional(values, "phone");
  if (phone && !PHONE.test(phone)) return problem("INVALID_PHONE", phone);

  const studentNumber = optional(values, "student_number");
  if (studentNumber && !/^[A-Za-z0-9-]{4,20}$/.test(studentNumber)) return problem("INVALID_FORMAT", studentNumber);

  // Tutor opcional: si se declara un nombre, se exigen parentesco y teléfono.
  const tutorName = optional(values, "tutor_name");
  const tutorRelationship = optional(values, "tutor_relationship");
  const tutorPhone = optional(values, "tutor_phone");
  const tutorEmail = optional(values, "tutor_email");
  if (tutorName && (!tutorRelationship || !tutorPhone)) return problem("REQUIRED_FIELD", "tutor_relationship/phone");
  if (tutorEmail && !EMAIL.test(tutorEmail)) return problem("INVALID_EMAIL", tutorEmail);
  if (!tutorName && ageOn(birthDate, today) < 18) return problem("GUARDIAN_REQUIRED", curp);

  const guardians = tutorName
    ? [{ name: tutorName, relationship: tutorRelationship, phone: tutorPhone, email: tutorEmail, isPaymentResponsible: true }]
    : [];

  return {
    naturalKey: curp,
    data: {
      firstNames,
      paternalSurname,
      maternalSurname: optional(values, "maternal_surname"),
      curp,
      birthDate,
      enrollmentDate,
      gender: gender ? gender.toUpperCase() : null,
      email: email ? email.toLowerCase() : null,
      phone,
      address: optional(values, "address"),
      studentNumber,
      guardians,
    },
  };
};

/** Valida y normaliza una fila de profesor; clave natural = email. */
export const parseTeacherRow = (values: Record<string, string>): ParsedRecord | RowProblem => {
  const firstNames = cell(values, "name");
  if (!firstNames) return problem("REQUIRED_FIELD", "name");
  const surnames = cell(values, "surnames");
  if (!surnames) return problem("REQUIRED_FIELD", "surnames");
  const emailRaw = cell(values, "email");
  if (!emailRaw) return problem("REQUIRED_FIELD", "email");
  const email = emailRaw.toLowerCase();
  if (!EMAIL.test(email) || email.length > 150) return problem("INVALID_EMAIL", emailRaw);

  const phone = optional(values, "phone");
  if (phone && !PHONE.test(phone)) return problem("INVALID_PHONE", phone);

  return {
    naturalKey: email,
    data: {
      firstNames,
      surnames,
      email,
      phone,
      specialty: optional(values, "specialty"),
    },
  };
};

/** Código de duplicado por entidad (dentro del archivo). */
export const duplicateReason = (entity: MigrationEntity): string =>
  entity === "Student" ? "DUPLICATE_CURP" : "DUPLICATE_EMAIL";

/** Plan fila a fila: marca rechazos y duplicados internos (sin BD). */
export const planRows = (entity: MigrationEntity, table: SourceTable, today: string): PlanRow[] => {
  const seen = new Set<string>();
  const parse = entity === "Student" ? (values: Record<string, string>) => parseStudentRow(values, today) : parseTeacherRow;
  return table.rows.map(({ rowNumber, values }) => {
    const parsed = parse(values);
    if ("reason" in parsed) return { rowNumber, naturalKey: null, problem: parsed };
    if (seen.has(parsed.naturalKey)) {
      return { rowNumber, naturalKey: parsed.naturalKey, problem: problem(duplicateReason(entity), parsed.naturalKey) };
    }
    seen.add(parsed.naturalKey);
    return { rowNumber, naturalKey: parsed.naturalKey, record: parsed };
  });
};
