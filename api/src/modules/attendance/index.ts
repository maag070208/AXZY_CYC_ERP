import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { AttendanceService } from "./services/attendance.service";
import { JustificationService } from "./services/justification.service";
import { AttendanceController } from "./controllers/attendance.controller";
import { createAttendanceRouters } from "./routes/attendance.routes";

/** M18: sesiones, pase de lista, porcentajes con alerta y justificantes. */
export const createAttendanceModule = (audit?: AuditLogger) => {
  const attendance = new AttendanceService(prismaClient, audit);
  const justifications = new JustificationService(attendance, prismaClient, audit);
  return { routers: createAttendanceRouters(new AttendanceController(attendance, justifications)), attendance, justifications };
};

export default createAttendanceModule;
