import { expect, test } from "@playwright/test";
import { curpCheckDigit } from "../../src/core/utils/curp";
import {
  duplicateReason,
  missingColumns,
  parseCsv,
  parseStudentRow,
  parseTeacherRow,
  planRows,
  normalizeHeader,
  readTable,
} from "../../src/modules/migration/models/entity/migration-rules";

/** Reglas puras de M20: lectura de CSV, normalización y validación fila a fila. */

const TODAY = "2026-10-09";
const withCheckDigit = (first17: string) => `${first17}${curpCheckDigit(first17)}`;
const ADULT = withCheckDigit("PELJ900101HDFRXN0");
const MINOR = withCheckDigit("PELJ150101HDFRXN0");

test.describe("CSV y encabezados", () => {
  test("normaliza encabezados (acentos, espacios y mayúsculas)", () => {
    expect(normalizeHeader("Fecha Nacimiento")).toBe("birth_date");
    expect(normalizeHeader("APELLIDO_PATERNO")).toBe("paternal_surname");
    expect(normalizeHeader("  Teléfono ")).toBe("phone");
  });

  test("parsea comillas dobles, escapes y saltos dentro de comillas", () => {
    const rows = parseCsv('a,b\n"con,coma","linea\nnueva"');
    expect(rows).toEqual([
      ["a", "b"],
      ["con,coma", "linea\nnueva"],
    ]);
  });

  test("readTable detecta el delimitador `;` y arma las filas por encabezado", () => {
    const table = readTable("CURP;Nombre\nABC;Ana");
    expect(table.header).toEqual(["curp", "name"]);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({ rowNumber: 2, values: { curp: "ABC", name: "Ana" } });
  });

  test("missingColumns reporta las columnas mínimas faltantes", () => {
    expect(missingColumns("Student", ["name", "paternal_surname", "curp", "birth_date"])).toEqual([]);
    expect(missingColumns("Student", ["name", "curp"])).toEqual(["paternal_surname", "birth_date"]);
  });
});

test.describe("students", () => {
  const base = { name: "Ana", paternal_surname: "Pérez", curp: ADULT, birth_date: "1990-01-01" };

  test("una fila válida produce la clave natural CURP y normaliza campos", () => {
    const parsed = parseStudentRow({ ...base, gender: "f", email: "ANA@X.MX" }, TODAY);
    expect(parsed).toMatchObject({ naturalKey: ADULT });
    if ("reason" in parsed) throw new Error("esperaba registro válido");
    expect(parsed.data).toMatchObject({ gender: "F", email: "ana@x.mx", studentNumber: null, guardians: [] });
  });

  test("CURP inválida y fecha inválida se rechazan con su motivo", () => {
    expect(parseStudentRow({ ...base, curp: "XAXX010101HDFXXX01" }, TODAY)).toMatchObject({ reason: "INVALID_CURP" });
    expect(parseStudentRow({ ...base, birth_date: "2026-13-01" }, TODAY)).toMatchObject({ reason: "INVALID_DATE" });
  });

  test("un menor sin tutor se rechaza; con tutor se registra", () => {
    const minor = { ...base, curp: MINOR, birth_date: "2015-01-01" };
    expect(parseStudentRow(minor, TODAY)).toMatchObject({ reason: "GUARDIAN_REQUIRED" });
    const parsed = parseStudentRow({ ...minor, tutor_name: "Mamá", tutor_relationship: "Madre", tutor_phone: "5512345678" }, TODAY);
    if ("reason" in parsed) throw new Error("esperaba registro válido");
    expect(parsed.data.guardians).toHaveLength(1);
  });

  test("detecta duplicados por CURP dentro del archivo", () => {
    const table = readTable(
      `name,apellido_paterno,curp,fecha_nacimiento\nAna,Pérez,${ADULT},1990-01-01\nOtra,Pérez,${ADULT},1990-01-01`
    );
    const planned = planRows("Student", table, TODAY);
    expect(planned[0].record).toBeDefined();
    expect(planned[1].problem).toMatchObject({ reason: "DUPLICATE_CURP" });
    expect(duplicateReason("Student")).toBe("DUPLICATE_CURP");
  });
});

test.describe("profesores", () => {
  test("clave natural email; correo inválido se rechaza", () => {
    const parsed = parseTeacherRow({ name: "Luis", surnames: "Ramos", email: "LUIS@ESCUELA.MX" });
    if ("reason" in parsed) throw new Error("esperaba registro válido");
    expect(parsed.naturalKey).toBe("luis@escuela.mx");
    expect(parseTeacherRow({ name: "Luis", surnames: "Ramos", email: "no-es-correo" })).toMatchObject({ reason: "INVALID_EMAIL" });
    expect(duplicateReason("Teacher")).toBe("DUPLICATE_EMAIL");
  });
});
