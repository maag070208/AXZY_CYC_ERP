/** Archivos mínimos reconocibles por su firma, para probar el expediente. */
export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
export const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
/** Ejecutable de Windows disfrazado: la extensión miente, el contenido no. */
export const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0)]);
/** Un PDF de 5 MB + 1 byte. */
export const TOO_BIG = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024 + 1 - PDF.length, 0x20)]);
