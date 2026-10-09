/**
 * Restaura un respaldo hecho con `pnpm backup` en la base de `DATABASE_URL` — M12.
 *
 * Uso:  pnpm restore <ruta/al/respaldo.dump> [--yes] [--container=NAME]
 *
 *   --yes             Autoriza una base que NO es local (producción). Sin esto,
 *                     el comando se niega a tocar una base remota.
 *   --container=NAME  Contenedor de Postgres (por omisión `cyc-postgres`).
 *
 * Qué hace, en orden:
 *   1. Verifica el `sha256` del dump si existe su archivo `.sha256`.
 *   2. Vacía el esquema `public` y lo restaura: la base queda EXACTAMENTE como
 *      el respaldo, no mezclada.
 *   3. `prisma migrate deploy`: aplica las migraciones que el respaldo no traía.
 *   4. Reporta conteos para validar contra el origen.
 *
 * La API debe estar detenida durante la carga. Los archivos del expediente se
 * restauran aparte (`tar -xzf …-files.tar.gz -C <STORAGE_LOCAL_DIR>`).
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_CONTAINER, isLocalHost, mask, parseTarget, run, runPg } from "./pg-tools";

const USAGE = "Uso: pnpm restore <respaldo.dump> [--yes] [--container=NAME]";

const sha256 = (file: string): string => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file) throw new Error(USAGE);
  const dump = path.resolve(file);
  if (!fs.existsSync(dump)) throw new Error(`No existe el respaldo: ${dump}`);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const container = args.find((arg) => arg.startsWith("--container="))?.split("=")[1] ?? DEFAULT_CONTAINER;
  const target = parseTarget(url);

  if (!isLocalHost(target) && !args.includes("--yes")) {
    throw new Error(`La base ${mask(url)} no es local. Si de verdad quieres reemplazarla, repite el comando con --yes.`);
  }

  const sidecar = `${dump}.sha256`;
  if (fs.existsSync(sidecar)) {
    const expected = fs.readFileSync(sidecar, "utf8").trim().split(/\s+/)[0];
    if (sha256(dump) !== expected) throw new Error("El sha256 del respaldo no coincide: el archivo está dañado o incompleto.");
    console.log("sha256 verificado.");
  }

  console.log(`Restaurando ${dump} → ${mask(url)}`);
  await runPg("psql", ["-v", "ON_ERROR_STOP=1", "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"], target, container);
  await runPg("pg_restore", ["--no-owner", "--no-privileges", "--exit-on-error"], target, container, { stdin: fs.createReadStream(dump) });

  console.log("Aplicando migraciones pendientes…");
  await run("npx", ["prisma", "migrate", "deploy"], { stdout: process.stdout });

  const prisma = new PrismaClient();
  try {
    const [users, students, enrollments, grades, payments] = await Promise.all([
      prisma.user.count(),
      prisma.student.count(),
      prisma.enrollment.count(),
      prisma.grade.count(),
      prisma.payment.count(),
    ]);
    console.log(`Restaurado: ${users} usuarios · ${students} alumnos · ${enrollments} inscripciones · ${grades} calificaciones · ${payments} pagos`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
