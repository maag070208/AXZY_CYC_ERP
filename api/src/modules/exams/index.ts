import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { ExamService } from "./services/exam.service";
import { AttemptService } from "./services/attempt.service";
import { ExamController } from "./controllers/exam.controller";
import { createExamRouters } from "./routes/exam.routes";

/** M15 (exámenes en línea) + M16 (aplicación) + M17 (calificación automática). */
export const createExamsModule = (audit?: AuditLogger) => {
  const exams = new ExamService(prismaClient, audit);
  const attempts = new AttemptService(exams, prismaClient, audit);
  return { routers: createExamRouters(new ExamController(exams, attempts)), attempts };
};

export default createExamsModule;
