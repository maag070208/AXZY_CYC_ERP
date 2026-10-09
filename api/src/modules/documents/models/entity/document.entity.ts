import type { KardexEntry } from "../dto/document.dto";

/** Tipos de archivo admitidos, reconocidos por su contenido (magic bytes). */
export const FILE_SIGNATURES: ReadonlyArray<{ mime: string; ext: string; bytes: number[] }> = [
  { mime: "application/pdf", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
];

/** Tipo real del archivo por su firma, o `null` si no es PDF/PNG/JPG. **Pura.** */
export const detectFileType = (buffer: Buffer): { mime: string; ext: string } | null => {
  const match = FILE_SIGNATURES.find((sig) => sig.bytes.every((byte, i) => buffer[i] === byte));
  return match ? { mime: match.mime, ext: match.ext } : null;
};

/**
 * Fuente académica del kardex (cursos, calificaciones y estatus por ciclo).
 * M07/M08 la implementan; mientras no existan, el kardex no tiene renglones.
 */
export type KardexSource = (studentId: string) => Promise<KardexEntry[]>;
