import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  MarkReadDto,
  NotificationSchema,
  NotificationTableResponseSchema,
  PreferenceDto,
  PreferenceSchema,
  PreferenceTableResponseSchema,
  SendDto,
  TemplateCreateDto,
  TemplateSchema,
  TemplateTableResponseSchema,
  TemplateUpdateDto,
} from "../models/dto/notification.dto";
import type { NotificationController } from "../controllers/notification.controller";

const bearer = [{ bearerAuth: [] }];
const param = (name: string) => ({ in: "path" as const, name, required: true, schema: { type: "string" as const } });
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });
type Extra = Omit<Parameters<typeof registerPath>[0], "method" | "path" | "summary" | "tags" | "security" | "responses"> &
  Partial<Pick<Parameters<typeof registerPath>[0], "responses">>;
const doc = (method: "get" | "post" | "patch" | "put" | "delete", path: string, summary: string, extra: Extra = {}) =>
  registerPath({ method, path, tags: ["Notifications"], summary, security: bearer, responses: { 200: { description: "OK" } }, ...extra });
const table = (response: ZodTypeAny) => ({
  request: { body: { required: true, content: json(TableQuerySchema) } },
  responses: { 200: { description: "Página", content: json(response) } },
});

export const createNotificationRouters = (c: NotificationController) => {
  doc("post", "/notification-templates/query", "Tabla de plantillas (notifications.view)", table(TemplateTableResponseSchema));
  doc("get", "/notification-templates/{id}", "Detalle de plantilla (notifications.view)", { parameters: [param("id")], responses: { 200: { description: "Plantilla", content: json(TemplateSchema) } } });
  doc("post", "/notification-templates", "Alta de plantilla (notifications.manage)", {
    request: { body: { required: true, content: json(TemplateCreateDto) } },
    responses: { 201: { description: "Plantilla", content: json(TemplateSchema) }, 409: { description: "TEMPLATE_DUPLICATE" } },
  });
  doc("patch", "/notification-templates/{id}", "Edición de plantilla (notifications.manage)", { parameters: [param("id")], request: { body: { required: true, content: json(TemplateUpdateDto) } } });
  doc("delete", "/notification-templates/{id}", "Baja lógica de plantilla (notifications.manage)", { parameters: [param("id")] });
  doc("post", "/notification-templates/{id}/reactivate", "Reactiva una plantilla (notifications.manage)", { parameters: [param("id")] });

  doc("post", "/notifications/query", "Historial del outbox (notifications.view)", table(NotificationTableResponseSchema));
  doc("post", "/notifications/send", "Encola un aviso manual o de prueba (notifications.manage; Idempotency-Key opcional)", {
    request: { body: { required: true, content: json(SendDto) } },
    responses: { 201: { description: "Notificación", content: json(NotificationSchema) }, 400: { description: "NOTIFICATION_VARIABLES_MISSING / NOTIFICATION_RECIPIENT_INVALID" } },
  });
  doc("post", "/notifications/{id}/retry", "Reencola una fallida u omitida (notifications.manage)", { parameters: [param("id")] });
  doc("post", "/notifications/drain", "Procesa la cola ahora (notifications.manage)");
  doc("get", "/notifications/mine", "Mi bandeja interna con no leídas (cualquier sesión)");
  doc("post", "/notifications/mine/read", "Marca como leídas (cualquier sesión, solo las propias)", { request: { body: { required: true, content: json(MarkReadDto) } } });

  doc("post", "/notification-preferences/query", "Bajas por destinatario y canal (notifications.view)", table(PreferenceTableResponseSchema));
  doc("put", "/notification-preferences", "Da de baja o reincorpora un destinatario (notifications.manage)", {
    request: { body: { required: true, content: json(PreferenceDto) } },
    responses: { 200: { description: "Preferencia", content: json(PreferenceSchema) } },
  });

  const templates = Router();
  templates.use(authenticate);
  templates.post("/query", requiresPermission("notifications.view"), asyncHandler(c.templateTable));
  templates.post("/", requiresPermission("notifications.manage"), asyncHandler(c.createTemplate));
  templates.get("/:id", requiresPermission("notifications.view"), asyncHandler(c.getTemplate));
  templates.patch("/:id", requiresPermission("notifications.manage"), asyncHandler(c.updateTemplate));
  templates.delete("/:id", requiresPermission("notifications.manage"), asyncHandler(c.deactivateTemplate));
  templates.post("/:id/reactivate", requiresPermission("notifications.manage"), asyncHandler(c.reactivateTemplate));

  const notifications = Router();
  notifications.use(authenticate);
  // La bandeja propia no requiere permiso: cada quien lee solo lo suyo.
  notifications.get("/mine", asyncHandler(c.mine));
  notifications.post("/mine/read", asyncHandler(c.markRead));
  notifications.post("/query", requiresPermission("notifications.view"), asyncHandler(c.table));
  notifications.post("/send", requiresPermission("notifications.manage"), asyncHandler(c.send));
  notifications.post("/drain", requiresPermission("notifications.manage"), asyncHandler(c.drain));
  notifications.post("/:id/retry", requiresPermission("notifications.manage"), asyncHandler(c.retry));

  const preferences = Router();
  preferences.use(authenticate);
  preferences.post("/query", requiresPermission("notifications.view"), asyncHandler(c.preferenceTable));
  preferences.put("/", requiresPermission("notifications.manage"), asyncHandler(c.setPreference));

  return { templates, notifications, preferences };
};
