/**
 * Respaldo de la base (y de los archivos, con el driver `local`) — M12.
 *
 * Uso:  pnpm backup [--container=NAME]
 *
 * Qué hace, en orden:
 *   1. `pg_dump` en formato custom → `BACKUP_DIR/cyc-AAAAMMDD-HHmmss.dump`.
 *   2. Escribe su `sha256` junto al dump (lo verifica `pnpm restore`).
 *   3. Si el almacenamiento es local, empaqueta el directorio privado
 *      (`…-files.tar.gz`): el expediente no vive en la base.
 *   4. Borra los respaldos con más de `BACKUP_RETENTION_DAYS` días.
 *   5. Registra la fecha en `settings.MIGRATION_LAST_BACKUP_AT` (M20 exige un
 *      respaldo reciente antes de importar).
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_CONTAINER, mask, parseTarget, run, runPg } from "./pg-tools";

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR ?? "backups");
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS ?? "30", 10);
const STORAGE_DIR = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "storage/private");
const PREFIX = "cyc-";

const stamp = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const sha256 = (file: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });

const prune = (now: Date): number => {
  const limit = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    const file = path.join(BACKUP_DIR, name);
    if (name.startsWith(PREFIX) && fs.statSync(file).mtimeMs < limit) {
      fs.rmSync(file);
      removed++;
    }
  }
  return removed;
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const container = process.argv.find((arg) => arg.startsWith("--container="))?.split("=")[1] ?? DEFAULT_CONTAINER;
  const target = parseTarget(url);
  const now = new Date();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const dump = path.join(BACKUP_DIR, `${PREFIX}${stamp(now)}.dump`);
  console.log(`Respaldando ${mask(url)} → ${dump}`);
  const output = fs.createWriteStream(dump);
  await runPg("pg_dump", ["-Fc", "--no-owner"], target, container, { stdout: output });
  await new Promise((resolve) => output.end(resolve));
  const size = fs.statSync(dump).size;
  if (size === 0) throw new Error("El respaldo quedó vacío");
  const checksum = await sha256(dump);
  fs.writeFileSync(`${dump}.sha256`, `${checksum}  ${path.basename(dump)}\n`);
  console.log(`Base: ${(size / 1024).toFixed(1)} KB · sha256 ${checksum}`);

  if (process.env.STORAGE_DRIVER !== "s3" && fs.existsSync(STORAGE_DIR) && fs.readdirSync(STORAGE_DIR).length > 0) {
    const files = dump.replace(/\.dump$/, "-files.tar.gz");
    await run("tar", ["-czf", files, "-C", STORAGE_DIR, "."]);
    console.log(`Archivos: ${files}`);
  } else {
    console.log("Archivos: sin directorio local que respaldar (S3 se respalda con el versionado del bucket)");
  }

  const removed = prune(now);
  if (removed) console.log(`Retención: ${removed} archivo(s) con más de ${RETENTION_DAYS} días eliminados`);

  const prisma = new PrismaClient();
  try {
    await prisma.setting.updateMany({ where: { key: "MIGRATION_LAST_BACKUP_AT" }, data: { value: now.toISOString() } });
  } finally {
    await prisma.$disconnect();
  }
  console.log("Respaldo terminado.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
