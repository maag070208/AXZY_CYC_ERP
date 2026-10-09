import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { NotificationService } from "./services/notification.service";
import { NotificationController } from "./controllers/notification.controller";
import { createNotificationRouters } from "./routes/notification.routes";

export { NotificationService } from "./services/notification.service";
export { setProvider, type NotificationProvider } from "./providers/provider";

/** M19: plantillas, outbox con reintentos, preferencias y bandeja interna. */
export const createNotificationsModule = (audit?: AuditLogger) => {
  const service = new NotificationService(prismaClient, audit);
  return { routers: createNotificationRouters(new NotificationController(service)), service };
};

export default createNotificationsModule;
