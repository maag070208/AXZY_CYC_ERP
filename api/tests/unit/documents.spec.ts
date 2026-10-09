import { test, expect } from "@playwright/test";
import { detectFileType } from "../../src/modules/documents/models/entity/document.entity";
import { averageOf } from "../../src/modules/documents/services/kardex.service";

/** M06 puro: tipo real de archivo por firma y promedio del kardex. */

test("reconoce PDF, PNG y JPG por su firma y rechaza lo demás", () => {
  expect(detectFileType(Buffer.from("%PDF-1.7 ..."))?.mime).toBe("application/pdf");
  expect(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe("png");
  expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0]))?.ext).toBe("jpg");
  expect(detectFileType(Buffer.from("MZ\x90\x00"))).toBeNull(); // ejecutable
  expect(detectFileType(Buffer.from("PK\x03\x04"))).toBeNull(); // zip/docx
  expect(detectFileType(Buffer.from("%PD"))).toBeNull(); // truncado
  expect(detectFileType(Buffer.alloc(0))).toBeNull();
});

test("el promedio del kardex solo cuenta cursos cerrados con calificación final", () => {
  const entry = (estatus: "ACREDITADO" | "REPROBADO" | "EN_CURSO" | "BAJA", calificacionFinal: number | null) => ({
    termId: "t", termNombre: "2026-A", courseId: "c", courseNombre: "Motores", grupo: "A",
    calificaciones: [], ponderaciones: [], calificacionFinal, estatus,
  });
  expect(averageOf([])).toBeNull();
  expect(averageOf([entry("EN_CURSO", 90), entry("BAJA", null)])).toBeNull();
  expect(averageOf([entry("ACREDITADO", 90), entry("REPROBADO", 55), entry("EN_CURSO", 100)])).toBe(72.5);
  expect(averageOf([entry("ACREDITADO", 85), entry("ACREDITADO", 90), entry("ACREDITADO", 88)])).toBe(87.67);
});
