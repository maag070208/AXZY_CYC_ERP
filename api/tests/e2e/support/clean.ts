import { assertSafeDatabase } from "./env";
import { clearAccessE2E, clearAuthE2E, clearCatalogsE2E, clearStudentsE2E, clearTeachersE2E, db } from "./db";

/**
 * Borra todo lo que crean las suites E2E (API y web). Solo toca filas con el
 * prefijo de prueba. Uso: `npm run test:e2e:clean` (lo invoca el
 * `globalTeardown` de la web).
 */
const main = async (): Promise<void> => {
  assertSafeDatabase();
  const students = await clearStudentsE2E();
  const teachers = await clearTeachersE2E();
  const users = await clearAuthE2E();
  const { roles, policies } = await clearAccessE2E();
  const catalogs = await clearCatalogsE2E();
  console.log(
    `[e2e] limpieza: ${users} usuario(s), ${students} alumno(s), ${teachers} profesor(es), ${roles} rol(es), ` +
      `${policies} política(s), ${catalogs} registro(s) de catálogo`
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
