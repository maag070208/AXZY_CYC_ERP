import { createApp } from "./app";
import { env as config } from "@core/config/env.config";
import { logger } from "@core/utils/logger";
import { prismaClient } from "@core/config/database";
import { seedPermissionsFromFixtures } from "@core/permissions";
import { hashPassword } from "@core/utils/security";

const app = createApp();

/**
 * Backfill insert-missing de permisos, roles y matriz. NO siembra datos de
 * negocio: si falla, la API arranca con catálogo/matriz vacíos y todo queda
 * cerrado (fail-closed).
 */
const bootstrapAuth = async (): Promise<void> => {
  try {
    await seedPermissionsFromFixtures(prismaClient);
    logger.info("Catálogo/roles/matriz de permisos cargados (fixtures insert-missing)");
  } catch (error) {
    logger.error(
      `No se pudo cargar el catálogo de permisos; la API arranca sin permisos (todo 403): ${String(error)}`
    );
  }

  // Administrador inicial: SOLO si no hay ningún usuario.
  try {
    const users = await prismaClient.user.count();
    if (users > 0) return;

    const username = config.INITIAL_ADMIN_USERNAME;
    const passwordHash = await hashPassword(config.INITIAL_ADMIN_PASSWORD);
    await prismaClient.user.create({
      data: {
        username,
        email: `${username}@cyc.local`,
        passwordHash,
        name: "Administrador",
        mustChangePassword: true,
        roles: { create: [{ roleKey: "ADMIN" }] },
      },
    });
    logger.info(`Administrador inicial creado: ${username} (cambia la contraseña al primer acceso)`);
  } catch (error) {
    logger.error(`No se pudo crear el administrador inicial: ${String(error)}`);
  }
};

if (process.env.NODE_ENV !== "test") {
  void (async () => {
    await bootstrapAuth();
    app.listen(config.PORT, "0.0.0.0", () => {
      logger.info(`API running on port ${config.PORT} (${config.NODE_ENV})`);
    });
  })();
}

export { app, bootstrapAuth };
