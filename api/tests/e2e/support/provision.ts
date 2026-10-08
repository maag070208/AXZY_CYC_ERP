import { E2E, assertSafeDatabase } from "./env";
import { createAuthUser, db } from "./db";

/**
 * Provisiona los usuarios fijos que usa la suite de navegador (`web/tests/e2e`):
 * `e2e_admin`, `e2e_control` y `e2e_profesor`, uno por rol base. Idempotente:
 * si ya existen se recrean (contraseña y roles conocidos, sin bloqueo).
 *
 * Uso: `npm run test:e2e:provision` (lo invoca el `globalSetup` de la web).
 */
const FIXED_USERS = [
  { username: "e2e_admin", name: "E2E Admin", roleKey: "ADMIN" },
  { username: "e2e_control", name: "E2E Control Escolar", roleKey: "CONTROL_ESCOLAR" },
  { username: "e2e_profesor", name: "E2E Profesor", roleKey: "PROFESOR" },
] as const;

const main = async (): Promise<void> => {
  assertSafeDatabase();
  for (const user of FIXED_USERS) {
    await createAuthUser({ ...user, password: E2E.password });
  }
  console.log(`[e2e] provisionados: ${FIXED_USERS.map((u) => u.username).join(", ")}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
