import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { ExpenseService } from "./services/expense.service";
import { ExpenseController } from "./controllers/expense.controller";
import { createExpenseRouter } from "./routes/expense.routes";

/** M23 — gastos institucionales (egresos). Solo lectura y captura manual. */
export const createExpensesModule = (audit?: AuditLogger) => {
  const expenses = new ExpenseService(prismaClient, audit);
  return { expenses, router: createExpenseRouter(new ExpenseController(expenses)) };
};

export default createExpensesModule;
