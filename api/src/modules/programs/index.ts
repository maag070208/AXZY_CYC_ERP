import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { ProgramService } from "./services/program.service";
import { PlanService } from "./services/plan.service";
import { ProgramController } from "./controllers/program.controller";
import { createPlanRouter, createProgramRouter } from "./routes/program.routes";

/** M22 — programas (carreras), plan de estudios y plan de pagos. */
export const createProgramsModule = (audit?: AuditLogger) => {
  const programs = new ProgramService(prismaClient, audit);
  const plans = new PlanService(prismaClient, audit);
  const controller = new ProgramController(programs, plans);
  return { routers: { programs: createProgramRouter(controller), plans: createPlanRouter(controller) }, programs, plans };
};

export default createProgramsModule;
