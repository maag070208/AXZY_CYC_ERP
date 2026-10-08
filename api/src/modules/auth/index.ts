import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { AuthService } from "./services/auth.service";
import { AuthController } from "./controllers/auth.controller";
import { createAuthRouter } from "./routes/auth.routes";

export { AuthService } from "./services/auth.service";
export { AuthController } from "./controllers/auth.controller";

export const createAuthModule = (audit?: AuditLogger) => {
  const service = new AuthService(prismaClient, audit);
  const controller = new AuthController(service);
  return { router: createAuthRouter(controller), service };
};

export default createAuthModule;
