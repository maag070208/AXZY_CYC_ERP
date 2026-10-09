import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { ExecutiveService } from "./services/executive.service";
import { ReportService } from "./services/report.service";
import { ReportController } from "./controllers/report.controller";
import { createReportRouters } from "./routes/report.routes";

/** M10 y M21 — reportes operativos, indicadores ejecutivos y tableros (solo lectura). */
export const createReportsModule = (audit?: AuditLogger) => {
  const executive = new ExecutiveService(prismaClient);
  const service = new ReportService(prismaClient, executive);
  return { routers: createReportRouters(new ReportController(service, executive, audit, prismaClient)) };
};

export default createReportsModule;
