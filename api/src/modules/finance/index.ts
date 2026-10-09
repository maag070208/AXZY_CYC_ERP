import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import type { StudentService } from "@modules/students";
import { FeeConceptService } from "./services/fee-concept.service";
import { ChargeService } from "./services/charge.service";
import { PaymentService } from "./services/payment.service";
import { FinanceController } from "./controllers/finance.controller";
import {
  createChargeRouter,
  createFeeConceptRouter,
  createPaymentRouter,
  createStudentFinanceRouter,
} from "./routes/finance.routes";

/** M09 — colegiaturas y pagos manuales. Recibe el servicio de alumnos (alcance). */
export const createFinanceModule = (students: StudentService, audit?: AuditLogger) => {
  const controller = new FinanceController(
    new FeeConceptService(prismaClient, audit),
    new ChargeService(students, prismaClient, audit),
    new PaymentService(prismaClient, audit)
  );
  return {
    routers: {
      feeConcepts: createFeeConceptRouter(controller),
      charges: createChargeRouter(controller),
      payments: createPaymentRouter(controller),
      student: createStudentFinanceRouter(controller),
    },
  };
};

export default createFinanceModule;
