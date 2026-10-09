import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { HttpError } from "@core/middlewares/error.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import {
  DocumentSchema,
  DocumentValidateDto,
  KardexSchema,
  MAX_DOCUMENT_BYTES,
  StudentDocumentsSchema,
} from "../models/dto/document.dto";
import type { DocumentController } from "../controllers/document.controller";

const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });
const studentParam = { in: "path" as const, name: "studentId", required: true, schema: { type: "string" as const } };
const idParam = { in: "path" as const, name: "id", required: true, schema: { type: "string" as const } };

/** `multer` en memoria (el binario nunca toca disco); un byte de más para detectar el exceso. */
const single = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES + 1, files: 1 } }).single("file");
const uploadFile = (req: Request, res: Response, next: NextFunction): void => {
  single(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(new HttpError(400, "FILE_TOO_LARGE", { maxMb: 5 }));
      return;
    }
    next(error instanceof multer.MulterError ? new HttpError(400, "INVALID_BODY") : error);
  });
};

/** Rutas bajo `/students/:studentId` (expediente y kardex del alumno). */
export const createStudentDocumentsRouter = (controller: DocumentController): Router => {
  const router = Router({ mergeParams: true });

  registerPath({
    method: "get", path: "/students/{studentId}/documents", tags: ["Documents"], security: bearer,
    summary: "Expediente del alumno + tipos obligatorios faltantes (documents.view, con alcance)",
    parameters: [studentParam],
    responses: { 200: { description: "Expediente", content: json(StudentDocumentsSchema) } },
  });
  registerPath({
    method: "post", path: "/students/{studentId}/documents", tags: ["Documents"], security: bearer,
    summary: "Sube un documento (multipart: file, documentTypeId, notes?) — PDF/JPG/PNG ≤ 5 MB (documents.upload)",
    parameters: [studentParam],
    request: {
      body: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file", "documentTypeId"],
              properties: {
                file: { type: "string", format: "binary" },
                documentTypeId: { type: "string" },
                notes: { type: "string" },
              },
            },
          },
        },
      },
    },
    responses: {
      201: { description: "Documento PENDING", content: json(DocumentSchema) },
      400: { description: "FILE_REQUIRED / FILE_TYPE_NOT_ALLOWED / FILE_TOO_LARGE" },
      409: { description: "STUDENT_INACTIVE (expediente de solo lectura)" },
      503: { description: "STORAGE_NOT_CONFIGURED" },
    },
  });
  registerPath({
    method: "get", path: "/students/{studentId}/kardex", tags: ["Documents"], security: bearer,
    summary: "Kardex calculado (kardex.view, con alcance)",
    parameters: [studentParam],
    responses: { 200: { description: "Kardex", content: json(KardexSchema) } },
  });

  // `authenticate` por ruta (no `router.use`): este router se monta en
  // `/students/:studentId` y no debe tocar las demás rutas de `/students`.
  router.get("/documents", authenticate, requiresPermission("documents.view"), asyncHandler(controller.list));
  router.post("/documents", authenticate, requiresPermission("documents.upload"), uploadFile, asyncHandler(controller.upload));
  router.get("/kardex", authenticate, requiresPermission("kardex.view"), asyncHandler(controller.getKardex));
  return router;
};

/** Rutas bajo `/documents/:id`. */
export const createDocumentsRouter = (controller: DocumentController): Router => {
  const router = Router();

  registerPath({
    method: "get", path: "/documents/{id}/download", tags: ["Documents"], security: bearer,
    summary: "Descarga autorizada del file privado (documents.view, con alcance)",
    parameters: [idParam],
    responses: { 200: { description: "Archivo" }, 404: { description: "Inexistente o fuera de alcance" } },
  });
  registerPath({
    method: "patch", path: "/documents/{id}/validate", tags: ["Documents"], security: bearer,
    summary: "Valida o rechaza un documento PENDING (documents.validate)",
    parameters: [idParam],
    request: { body: { required: true, content: json(DocumentValidateDto) } },
    responses: { 200: { description: "Documento", content: json(DocumentSchema) }, 409: { description: "DOCUMENT_ALREADY_REVIEWED" } },
  });
  registerPath({
    method: "delete", path: "/documents/{id}", tags: ["Documents"], security: bearer,
    summary: "Baja lógica del documento (documents.delete)",
    parameters: [idParam],
    responses: { 204: { description: "Documento dado de baja" } },
  });

  router.use(authenticate);
  router.get("/:id/download", requiresPermission("documents.view"), asyncHandler(controller.download));
  router.patch("/:id/validate", requiresPermission("documents.validate"), asyncHandler(controller.validate));
  router.delete("/:id", requiresPermission("documents.delete"), asyncHandler(controller.remove));
  return router;
};
