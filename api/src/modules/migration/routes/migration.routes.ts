import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { HttpError } from "@core/middlewares/error.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import { MAX_MIGRATION_BYTES } from "../models/entity/migration-rules";
import {
  MigrationBatchDetailSchema,
  MigrationBatchTableResponseSchema,
  MigrationResultSchema,
} from "../models/dto/migration.dto";
import type { MigrationController } from "../controllers/migration.controller";

const single = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MIGRATION_BYTES + 1, files: 1 } }).single("file");
const uploadCsv = (req: Request, res: Response, next: NextFunction): void => {
  single(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(new HttpError(400, "FILE_TOO_LARGE", { maxMb: 2 }));
      return;
    }
    next(error instanceof multer.MulterError ? new HttpError(400, "INVALID_BODY") : error);
  });
};

const bearer = [{ bearerAuth: [] }];
const idParam = { in: "path" as const, name: "id", required: true, schema: { type: "string" as const } };
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });

export const createMigrationRouter = (controller: MigrationController): Router => {
  registerPath({
    method: "post",
    path: "/migration/preview",
    tags: ["Migration"],
    summary: "Simulación (`dry-run`) de importación (multipart `file` + `entity`)",
    security: bearer,
    request: { body: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { entity: { type: "string" }, file: { type: "string", format: "binary" } } } } } } },
    responses: { 200: { description: "Reporte sin escribir", content: json(MigrationResultSchema) } },
  });
  registerPath({
    method: "post",
    path: "/migration/execute",
    tags: ["Migration"],
    summary: "Importación real (multipart `file` + `entity` + `checksum`; exige Idempotency-Key y respaldo reciente)",
    security: bearer,
    responses: {
      201: { description: "Lote ejecutado", content: json(MigrationResultSchema) },
      409: { description: "BACKUP_REQUIRED / CHECKSUM_MISMATCH / IDEMPOTENCY_KEY_REUSED" },
    },
  });
  registerPath({
    method: "post",
    path: "/migration/batches/query",
    tags: ["Migration"],
    summary: "Listado server-side de lotes (migration.execute)",
    security: bearer,
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(MigrationBatchTableResponseSchema) } },
  });
  registerPath({
    method: "get",
    path: "/migration/batches/{id}",
    tags: ["Migration"],
    summary: "Detalle de lote (totales y filas rechazadas)",
    security: bearer,
    parameters: [idParam],
    responses: { 200: { description: "Lote", content: json(MigrationBatchDetailSchema) } },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/preview", requiresPermission("migration.execute"), uploadCsv, asyncHandler(controller.preview));
  router.post("/execute", requiresPermission("migration.execute"), uploadCsv, asyncHandler(controller.execute));
  router.post("/batches/query", requiresPermission("migration.execute"), asyncHandler(controller.table));
  router.get("/batches/:id", requiresPermission("migration.execute"), asyncHandler(controller.getBatch));
  return router;
};
