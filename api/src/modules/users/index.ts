import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { UserService } from "./services/user.service";
import { UserPermissionsService } from "./services/user-permissions.service";
import { UserController } from "./controllers/user.controller";
import { createUserRouter } from "./routes/user.routes";

export { UserService } from "./services/user.service";
export { UserPermissionsService } from "./services/user-permissions.service";

export const createUserModule = (audit?: AuditLogger) => {
  const users = new UserService(prismaClient, audit);
  const permissions = new UserPermissionsService(prismaClient, audit);
  const controller = new UserController(users, permissions);
  return createUserRouter(controller);
};

export default createUserModule;
