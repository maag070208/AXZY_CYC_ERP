import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { MigrationService } from "./services/migration.service";
import { MigrationController } from "./controllers/migration.controller";
import { createMigrationRouter } from "./routes/migration.routes";

/** M20 — migración de datos históricos. */
export const createMigrationModule = (audit?: AuditLogger) => {
  const service = new MigrationService(prismaClient, audit);
  return { router: createMigrationRouter(new MigrationController(service)), service };
};

export default createMigrationModule;
