import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { PermissionService } from "./services/permission.service";
import { PolicyService } from "./services/policy.service";
import { PermissionController } from "./controllers/permission.controller";
import { createPermissionsRoutes } from "./routes/permission.routes";

export { PermissionService } from "./services/permission.service";

export const createPermissionsModule = (audit?: AuditLogger) => {
  const service = new PermissionService(prismaClient, audit);
  const controller = new PermissionController(service, new PolicyService(prismaClient, audit));
  return { router: createPermissionsRoutes(controller), service };
};

export default createPermissionsModule;
