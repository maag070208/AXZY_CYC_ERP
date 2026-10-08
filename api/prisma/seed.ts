import { PrismaClient } from "@prisma/client";
import { seedPermissionsFromFixtures } from "../src/core/permissions/fixtures";
import { hashPassword } from "../src/core/utils/security";

/**
 * Semilla del SGE. NO siembra datos de negocio (M03+): solo hace el backfill
 * insert-missing de permisos, roles y matriz, y crea el administrador inicial si
 * no hay ningún usuario. Idempotente.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  await seedPermissionsFromFixtures(prisma);
  console.log("Catálogo de permisos, roles y matriz listos (insert-missing)");

  const users = await prisma.user.count();
  if (users > 0) {
    console.log(`Seed omitido: la BD ya tiene ${users} usuario(s). No se tocó nada.`);
    return;
  }

  const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
  const password = process.env.INITIAL_ADMIN_PASSWORD ?? "admin12345";
  await prisma.user.create({
    data: {
      username,
      email: `${username}@cyc.local`,
      passwordHash: await hashPassword(password),
      name: "Administrador",
      mustChangePassword: true,
      roles: { create: [{ roleKey: "ADMIN" }] },
    },
  });
  console.log(`Administrador inicial creado: ${username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
