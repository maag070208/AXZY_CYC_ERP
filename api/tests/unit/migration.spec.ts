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
    expect(normalizeHeader("Fecha Nacimiento")).toBe("fecha_nacimiento");
    expect(normalizeHeader("APELLIDO_PATERNO")).toBe("apellido_paterno");
    expect(normalizeHeader("  Teléfono ")).toBe("telefono");
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
    expect(table.header).toEqual(["curp", "nombre"]);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({ rowNumber: 2, values: { curp: "ABC", nombre: "Ana" } });
  });

  test("missingColumns reporta las columnas mínimas faltantes", () => {
    expect(missingColumns("Student", ["nombre", "apellido_paterno", "curp", "fecha_nacimiento"])).toEqual([]);
    expect(missingColumns("Student", ["nombre", "curp"])).toEqual(["apellido_paterno", "fecha_nacimiento"]);
  });
});

test.describe("alumnos", () => {
  const base = { nombre: "Ana", apellido_paterno: "Pérez", curp: ADULT, fecha_nacimiento: "1990-01-01" };

  test("una fila válida produce la clave natural CURP y normaliza campos", () => {
    const parsed = parseStudentRow({ ...base, genero: "f", email: "ANA@X.MX" }, TODAY);
    expect(parsed).toMatchObject({ naturalKey: ADULT });
    if ("reason" in parsed) throw new Error("esperaba registro válido");
    expect(parsed.data).toMatchObject({ genero: "F", email: "ana@x.mx", matricula: null, guardians: [] });
  });

  test("CURP inválida y fecha inválida se rechazan con su motivo", () => {
    expect(parseStudentRow({ ...base, curp: "XAXX010101HDFXXX01" }, TODAY)).toMatchObject({ reason: "INVALID_CURP" });
    expect(parseStudentRow({ ...base, fecha_nacimiento: "2026-13-01" }, TODAY)).toMatchObject({ reason: "INVALID_DATE" });
  });

  test("un menor sin tutor se rechaza; con tutor se registra", () => {
    const minor = { ...base, curp: MINOR, fecha_nacimiento: "2015-01-01" };
    expect(parseStudentRow(minor, TODAY)).toMatchObject({ reason: "GUARDIAN_REQUIRED" });
    const parsed = parseStudentRow({ ...minor, tutor_nombre: "Mamá", tutor_parentesco: "Madre", tutor_telefono: "5512345678" }, TODAY);
    if ("reason" in parsed) throw new Error("esperaba registro válido");
    expect(parsed.data.guardians).toHaveLength(1);
  });

  test("detecta duplicados por CURP dentro del archivo", () => {
    const table = readTable(
      `nombre,apellido_paterno,curp,fecha_nacimiento\nAna,Pérez,${ADULT},1990-01-01\nOtra,Pérez,${ADULT},1990-01-01`
    );
    const planned = planRows("Student", table, TODAY);
    expect(planned[0].record).toBeDefined();
    expect(planned[1].problem).toMatchObject({ reason: "DUPLICATE_CURP" });
    expect(duplicateReason("Student")).toBe("DUPLICATE_CURP");
  });
});

test.describe("profesores", () => {
  test("clave natural email; correo inválido se rechaza", () => {
    const parsed = parseTeacherRow({ nombre: "Luis", apellidos: "Ramos", email: "LUIS@ESCUELA.MX" });
    if ("reason" in parsed) throw new Error("esperaba registro válido");
    expect(parsed.naturalKey).toBe("luis@escuela.mx");
    expect(parseTeacherRow({ nombre: "Luis", apellidos: "Ramos", email: "no-es-correo" })).toMatchObject({ reason: "INVALID_EMAIL" });
    expect(duplicateReason("Teacher")).toBe("DUPLICATE_EMAIL");
  });
});
