import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { ReportService } from "./services/report.service";
import { ReportController } from "./controllers/report.controller";
import { createReportRouters } from "./routes/report.routes";

/** M10 — reportes operativos y tablero (solo lectura). */
export const createReportsModule = (audit?: AuditLogger) => {
  const service = new ReportService(prismaClient);
  return { routers: createReportRouters(new ReportController(service, audit, prismaClient)) };
};

export default createReportsModule;
