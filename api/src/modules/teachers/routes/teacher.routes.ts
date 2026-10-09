import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  TeacherCreateDto,
  TeacherCreatedSchema,
  TeacherDeactivateDto,
  TeacherSchema,
  TeacherTableResponseSchema,
  TeacherUpdateDto,
} from "../models/dto/teacher.dto";
import type { TeacherController } from "../controllers/teacher.controller";

const bearer = [{ bearerAuth: [] }];
const idParam = { in: "path" as const, name: "id", required: true, schema: { type: "string" as const } };
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });

export const createTeacherRouter = (controller: TeacherController): Router => {
  const router = Router();
  type Extra = Omit<Parameters<typeof registerPath>[0], "method" | "path" | "summary" | "tags" | "security">;
  const doc = (method: "get" | "post" | "patch", path: string, summary: string, extra: Extra) =>
    registerPath({ method, path, tags: ["Teachers"], summary, security: bearer, ...extra });

  doc("post", "/teachers/query", "Tabla server-side de profesores (teachers.view; OWN = su perfil)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(TeacherTableResponseSchema) } },
  });
  doc("post", "/teachers", "Alta: crea profesor + cuenta PROFESOR + invitación (teachers.create)", {
    request: { body: { required: true, content: json(TeacherCreateDto) } },
    responses: {
      201: { description: "Profesor creado", content: json(TeacherCreatedSchema) },
      409: { description: "TEACHER_EMAIL_TAKEN" },
    },
  });
  doc("get", "/teachers/{id}", "Detalle (teachers.view)", {
    parameters: [idParam],
    responses: { 200: { description: "Profesor", content: json(TeacherSchema) } },
  });
  doc("patch", "/teachers/{id}", "Edición; sincroniza nombre/correo/teléfono de la cuenta (teachers.edit)", {
    parameters: [idParam],
    request: { body: { required: true, content: json(TeacherUpdateDto) } },
    responses: { 200: { description: "Profesor", content: json(TeacherSchema) } },
  });
  doc("post", "/teachers/{id}/deactivate", "Baja lógica del profesor y de su cuenta (teachers.edit ALL)", {
    parameters: [idParam],
    request: { body: { required: false, content: json(TeacherDeactivateDto) } },
    responses: { 200: { description: "Profesor inactivo", content: json(TeacherSchema) } },
  });
  doc("post", "/teachers/{id}/reactivate", "Reactiva profesor y cuenta (teachers.edit ALL)", {
    parameters: [idParam],
    responses: { 200: { description: "Profesor activo", content: json(TeacherSchema) } },
  });
  doc("post", "/teachers/{id}/resend-invitation", "Reenvía la invitación pendiente (teachers.edit)", {
    parameters: [idParam],
    responses: { 200: { description: "Invitación reenviada" }, 409: { description: "INVITATION_NOT_PENDING" } },
  });

  router.use(authenticate);
  router.post("/query", requiresPermission("teachers.view"), asyncHandler(controller.table));
  router.post("/", requiresPermission("teachers.create"), asyncHandler(controller.create));
  router.get("/:id", requiresPermission("teachers.view"), asyncHandler(controller.getById));
  router.patch("/:id", requiresPermission("teachers.edit"), asyncHandler(controller.update));
  router.post("/:id/deactivate", requiresPermission("teachers.edit"), asyncHandler(controller.deactivate));
  router.post("/:id/reactivate", requiresPermission("teachers.edit"), asyncHandler(controller.reactivate));
  router.post("/:id/resend-invitation", requiresPermission("teachers.edit"), asyncHandler(controller.resendInvitation));
  return router;
};
