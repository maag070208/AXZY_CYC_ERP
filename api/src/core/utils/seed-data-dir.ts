import fs from "node:fs";
import path from "node:path";

/**
 * Resuelve el directorio `prisma/seed-data` sin depender del cwd ni de si el
 * código corre desde `src` (ts-node) o desde `dist` (build de producción).
 *
 * Orden de búsqueda:
 *   1. env `CYC_SEED_DATA_DIR`.
 *   2. `process.cwd()/prisma/seed-data` (dev, seed, Docker).
 *   3. Caminando hacia arriba desde `__dirname`.
 */
export const resolveSeedDataDir = (baseDir?: string): string => {
  const candidates: string[] = [];
  if (process.env.CYC_SEED_DATA_DIR) candidates.push(process.env.CYC_SEED_DATA_DIR);
  candidates.push(path.join(process.cwd(), "prisma", "seed-data"));
  if (baseDir) {
    let dir = baseDir;
    for (let i = 0; i < 5; i++) {
      candidates.push(path.join(dir, "seed-data"));
      candidates.push(path.join(dir, "prisma", "seed-data"));
      dir = path.dirname(dir);
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  // Si nada existe, devuelve el candidato canónico: el error de lectura será
  // explícito y con la ruta esperada.
  return path.join(process.cwd(), "prisma", "seed-data");
};
