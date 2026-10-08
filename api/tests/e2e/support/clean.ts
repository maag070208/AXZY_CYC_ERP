import { assertSafeDatabase } from "./env";
import { clearAuthE2E, db } from "./db";

/**
 * Borra todo lo que crean las suites E2E (API y web). Solo toca filas con el
 * prefijo de prueba. Uso: `npm run test:e2e:clean` (lo invoca el
 * `globalTeardown` de la web).
 */
const main = async (): Promise<void> => {
  assertSafeDatabase();
  const users = await clearAuthE2E();
  console.log(`[e2e] limpieza: ${users} usuario(s) e2e_ borrados`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
