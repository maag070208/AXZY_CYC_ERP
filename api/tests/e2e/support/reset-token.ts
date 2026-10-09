import { randomBytes } from "node:crypto";
import { assertSafeDatabase } from "./env";
import { createResetToken, db } from "./db";

/**
 * Emite un token de recuperación conocido para un usuario E2E y lo imprime en
 * stdout. El token real solo viaja por correo; la suite web lo usa para probar
 * la pantalla `/reset-password` de punta a punta.
 *
 * Uso: `npm run --silent test:e2e:reset-token -- <username>`
 */
const main = async (): Promise<void> => {
  assertSafeDatabase();
  const username = process.argv[2];
  if (!username?.startsWith("e2e_")) throw new Error("Solo se emiten tokens para usuarios e2e_");
  const user = await db.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) throw new Error(`No existe el usuario ${username}`);
  const token = randomBytes(24).toString("hex");
  await createResetToken(user.id, token);
  process.stdout.write(token);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
