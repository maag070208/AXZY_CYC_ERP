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
  { username: "e2e_control", name: "E2E Control Escolar", roleKey: "SCHOOL_CONTROL" },
  { username: "e2e_profesor", name: "E2E Profesor", roleKey: "TEACHER" },
] as const;

const main = async (): Promise<void> => {
  assertSafeDatabase();
  for (const user of FIXED_USERS) {
    await createAuthUser({ ...user, password: E2E.password });
  }
  // `e2e_profesor` también es profesor (M04): las suites académicas (M07/M08)
  // le asignan grupos y entran con él para capturar calificaciones.
  const teacher = await db.user.findUniqueOrThrow({ where: { username: "e2e_profesor" }, select: { id: true } });
  await db.teacher.upsert({
    where: { userId: teacher.id },
    create: { nombres: "E2E", apellidos: "Profesor", email: "e2e_profesor@e2e.local", userId: teacher.id },
    update: { status: "ACTIVO" },
  });
  console.log(`[e2e] provisionados: ${FIXED_USERS.map((u) => u.username).join(", ")}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
