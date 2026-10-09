import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { HttpError } from "@core/middlewares/error.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  ImportResultSchema,
  QuestionCreateDto,
  QuestionSchema,
  QuestionTableResponseSchema,
  QuestionUpdateDto,
} from "../models/dto/question.dto";
import type { QuestionController } from "../controllers/question.controller";

const MAX_CSV_BYTES = 1024 * 1024;
const single = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CSV_BYTES + 1, files: 1 } }).single("file");
const uploadCsv = (req: Request, res: Response, next: NextFunction): void => {
  single(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(new HttpError(400, "FILE_TOO_LARGE", { maxMb: 1 }));
      return;
    }
    next(error instanceof multer.MulterError ? new HttpError(400, "INVALID_BODY") : error);
  });
};

const bearer = [{ bearerAuth: [] }];
const idParam = { in: "path" as const, name: "id", required: true, schema: { type: "string" as const } };
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });
type Extra = Omit<Parameters<typeof registerPath>[0], "method" | "path" | "summary" | "tags" | "security">;
const doc = (method: "get" | "post" | "patch" | "delete", path: string, summary: string, extra: Extra) =>
  registerPath({ method, path, tags: ["Questions"], summary, security: bearer, ...extra });

export const createQuestionRouter = (controller: QuestionController): Router => {
  doc("post", "/questions/query", "Tabla de reactivos (questions.view; AREA = cursos de sus grupos)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(QuestionTableResponseSchema) } },
  });
  doc("post", "/questions", "Alta de reactivo con opciones (questions.create)", {
    request: { body: { required: true, content: json(QuestionCreateDto) } },
    responses: { 201: { description: "Reactivo", content: json(QuestionSchema) }, 400: { description: "QUESTION_OPTION_*" } },
  });
  doc("post", "/questions/import", "Importación CSV (multipart `file`; ?preview=true no guarda; aplicar exige Idempotency-Key)", {
    parameters: [
      { in: "query", name: "preview", required: false, schema: { type: "string", enum: ["true", "false"] } },
      { in: "header", name: "Idempotency-Key", required: false, schema: { type: "string" } },
    ],
    responses: { 200: { description: "Vista previa", content: json(ImportResultSchema) }, 201: { description: "Importados", content: json(ImportResultSchema) } },
  });
  doc("get", "/questions/{id}", "Detalle con opciones (questions.view)", {
    parameters: [idParam],
    responses: { 200: { description: "Reactivo", content: json(QuestionSchema) } },
  });
  doc("patch", "/questions/{id}", "Edición (questions.edit); bloqueado si ya se respondió", {
    parameters: [idParam],
    request: { body: { required: true, content: json(QuestionUpdateDto) } },
    responses: { 200: { description: "Reactivo", content: json(QuestionSchema) }, 409: { description: "QUESTION_IN_USE" } },
  });
  doc("delete", "/questions/{id}", "Desactivación lógica (questions.edit)", {
    parameters: [idParam],
    responses: { 200: { description: "Reactivo inactivo", content: json(QuestionSchema) } },
  });
  doc("post", "/questions/{id}/reactivate", "Reactiva (questions.edit)", {
    parameters: [idParam],
    responses: { 200: { description: "Reactivo activo", content: json(QuestionSchema) } },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("questions.view"), asyncHandler(controller.table));
  router.post("/import", requiresPermission("questions.import"), uploadCsv, asyncHandler(controller.import));
  router.post("/", requiresPermission("questions.create"), asyncHandler(controller.create));
  router.get("/:id", requiresPermission("questions.view"), asyncHandler(controller.getById));
  router.patch("/:id", requiresPermission("questions.edit"), asyncHandler(controller.update));
  router.delete("/:id", requiresPermission("questions.edit"), asyncHandler(controller.deactivate));
  router.post("/:id/reactivate", requiresPermission("questions.edit"), asyncHandler(controller.reactivate));
  return router;
};
