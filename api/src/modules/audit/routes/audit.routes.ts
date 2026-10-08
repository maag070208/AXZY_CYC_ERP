import { Router } from "express";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import { AuditLogSchema, AuditLogTableResponseSchema } from "../models/dto/audit.dto";
import type { AuditController } from "../controllers/audit.controller";

const bearer = [{ bearerAuth: [] }];

export const createAuditRouter = (controller: AuditController): Router => {
  const router = Router();

  registerPath({
    method: "post",
    path: "/audit/query",
    tags: ["Audit"],
    summary: "Bitácora paginada (contrato tabla)",
    security: bearer,
    request: { body: { required: true, content: { "application/json": { schema: TableQuerySchema } } } },
    responses: {
      200: {
        description: "Página de bitácora",
        content: { "application/json": { schema: AuditLogTableResponseSchema } },
      },
    },
  });

  registerPath({
    method: "get",
    path: "/audit",
    tags: ["Audit"],
    summary: "Bitácora con filtros",
    security: bearer,
    parameters: [
      { in: "query", name: "action", required: false, schema: { type: "string" } },
      { in: "query", name: "entityType", required: false, schema: { type: "string" } },
      { in: "query", name: "entityId", required: false, schema: { type: "string" } },
      { in: "query", name: "userId", required: false, schema: { type: "string" } },
      { in: "query", name: "from", required: false, schema: { type: "string", format: "date-time" } },
      { in: "query", name: "to", required: false, schema: { type: "string", format: "date-time" } },
      { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1 } },
      { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1 } },
    ],
    responses: {
      200: { description: "Bitácora", content: { "application/json": { schema: { type: "object" } } } },
    },
  });

  registerPath({
    method: "get",
    path: "/audit/{id}",
    tags: ["Audit"],
    summary: "Registro de bitácora por id",
    security: bearer,
    parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
    responses: {
      200: { description: "Registro", content: { "application/json": { schema: AuditLogSchema } } },
      404: { description: "No encontrado" },
    },
  });

  router.use(authenticate, requiresPermission("audit.view"));

  router.post("/query", asyncHandler(controller.query));
  router.get("/", asyncHandler(controller.list));
  router.get("/:id", asyncHandler(controller.getOne));

  return router;
};
