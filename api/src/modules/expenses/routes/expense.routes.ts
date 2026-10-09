import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import { CancelDto } from "@modules/finance/models/dto/finance.dto";
import {
  ExpenseCreateDto,
  ExpenseSchema,
  ExpenseSummarySchema,
  ExpenseTableResponseSchema,
  ExpenseUpdateDto,
} from "../models/dto/expense.dto";
import type { ExpenseController } from "../controllers/expense.controller";

const bearer = [{ bearerAuth: [] }];
const param = (name: string) => ({ in: "path" as const, name, required: true, schema: { type: "string" as const } });
const query = (name: string, description: string) => ({
  in: "query" as const, name, required: false, description, schema: { type: "string" as const },
});
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });
type Extra = Omit<Parameters<typeof registerPath>[0], "method" | "path" | "summary" | "tags" | "security">;
const doc = (method: "get" | "post" | "patch" | "delete", path: string, summary: string, extra: Extra) =>
  registerPath({ method, path, tags: ["Expenses"], summary, security: bearer, ...extra });

/** M23 — gastos institucionales. Todo exige alcance institucional (ALL). */
export const createExpenseRouter = (c: ExpenseController): Router => {
  doc("post", "/expenses/query", "Tabla de gastos (expenses.view)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(ExpenseTableResponseSchema) } },
  });
  doc("get", "/expenses/summary", "Totales del ciclo por tipo y por mes (expenses.view)", {
    parameters: [query("termId", "Ciclo; `all` para no acotar")],
    responses: { 200: { description: "Resumen", content: json(ExpenseSummarySchema) } },
  });
  doc("get", "/expenses/{id}", "Detalle (expenses.view)", {
    parameters: [param("id")],
    responses: { 200: { description: "Gasto", content: json(ExpenseSchema) }, 404: { description: "EXPENSE_NOT_FOUND" } },
  });
  doc("post", "/expenses", "Alta de gasto (expenses.manage)", {
    request: { body: { required: true, content: json(ExpenseCreateDto) } },
    responses: { 201: { description: "Gasto", content: json(ExpenseSchema) }, 400: { description: "DUE_DATE_BEFORE_DATE" } },
  });
  doc("patch", "/expenses/{id}", "Edición (expenses.manage)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(ExpenseUpdateDto) } },
    responses: {
      200: { description: "Gasto", content: json(ExpenseSchema) },
      400: { description: "DUE_DATE_BEFORE_DATE" },
      409: { description: "EXPENSE_CANCELLED" },
    },
  });
  doc("delete", "/expenses/{id}", "Cancelación lógica con motivo (expenses.manage)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(CancelDto) } },
    responses: { 200: { description: "Gasto cancelado", content: json(ExpenseSchema) }, 409: { description: "EXPENSE_ALREADY_CANCELLED" } },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("expenses.view"), asyncHandler(c.table));
  router.get("/summary", requiresPermission("expenses.view"), asyncHandler(c.summary));
  router.post("/", requiresPermission("expenses.manage"), asyncHandler(c.create));
  router.get("/:id", requiresPermission("expenses.view"), asyncHandler(c.get));
  router.patch("/:id", requiresPermission("expenses.manage"), asyncHandler(c.update));
  router.delete("/:id", requiresPermission("expenses.manage"), asyncHandler(c.cancel));
  return router;
};
