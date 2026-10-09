import { Router } from "express";
import type { ZodTypeAny } from "zod";
import {
  authenticate,
  requiresAnyPermission,
  requiresPermission,
} from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath, z } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  TermCreateDto,
  TermSchema,
  TermTableResponseSchema,
  TermUpdateDto,
} from "../models/dto/catalog.dto";
import { SettingSchema, SettingsUpdateSchema } from "../models/dto/settings.dto";
import type {
  CatalogController,
  SettingsController,
  TermController,
} from "../controllers/config.controller";

const bearer = [{ bearerAuth: [] }];
const idParam = { in: "path" as const, name: "id", required: true, schema: { type: "string" as const } };
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });

export const createSettingsRouter = (controller: SettingsController): Router => {
  const router = Router();

  registerPath({
    method: "get",
    path: "/settings",
    tags: ["Config"],
    summary: "Parámetros generales (config.view)",
    security: bearer,
    responses: { 200: { description: "Parámetros", content: json(z.array(SettingSchema)) } },
  });
  registerPath({
    method: "put",
    path: "/settings",
    tags: ["Config"],
    summary: "Actualiza parámetros `{ KEY: value }` (config.manage)",
    security: bearer,
    request: { body: { required: true, content: json(SettingsUpdateSchema) } },
    responses: {
      200: { description: "Parámetros actualizados", content: json(z.array(SettingSchema)) },
      400: { description: "Clave desconocida o valor inválido" },
    },
  });

  router.use(authenticate);
  router.get("/", requiresPermission("config.view"), asyncHandler(controller.list));
  router.put("/", requiresPermission("config.manage"), asyncHandler(controller.update));
  return router;
};

export interface CatalogRouteSpec {
  /** Ruta base sin barra (`levels`). */
  path: string;
  tag: string;
  label: string;
  /** Permisos de lectura (basta uno). */
  view: readonly string[];
  manage: string;
  itemSchema: ZodTypeAny;
  tableSchema: ZodTypeAny;
  createSchema: ZodTypeAny;
  updateSchema: ZodTypeAny;
}

export const createCatalogRouter = (controller: CatalogController, spec: CatalogRouteSpec): Router => {
  const router = Router();
  const base = `/${spec.path}`;

  registerPath({
    method: "post",
    path: `${base}/query`,
    tags: [spec.tag],
    summary: `Tabla server-side de ${spec.label} (${spec.view.join(" | ")})`,
    security: bearer,
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(spec.tableSchema) } },
  });
  registerPath({
    method: "get",
    path: base,
    tags: [spec.tag],
    summary: `Lista de ${spec.label} activos para selects (?all=true incluye inactivos)`,
    security: bearer,
    parameters: [{ in: "query", name: "all", required: false, schema: { type: "boolean" } }],
    responses: { 200: { description: "Registros", content: json(z.array(spec.itemSchema)) } },
  });
  registerPath({
    method: "get",
    path: `${base}/{id}`,
    tags: [spec.tag],
    summary: `Detalle de ${spec.label}`,
    security: bearer,
    parameters: [idParam],
    responses: { 200: { description: "Registro", content: json(spec.itemSchema) } },
  });
  registerPath({
    method: "post",
    path: base,
    tags: [spec.tag],
    summary: `Alta de ${spec.label} (${spec.manage})`,
    security: bearer,
    request: { body: { required: true, content: json(spec.createSchema) } },
    responses: {
      201: { description: "Creado", content: json(spec.itemSchema) },
      409: { description: "Nombre duplicado" },
    },
  });
  registerPath({
    method: "patch",
    path: `${base}/{id}`,
    tags: [spec.tag],
    summary: `Edición de ${spec.label} (${spec.manage})`,
    security: bearer,
    parameters: [idParam],
    request: { body: { required: true, content: json(spec.updateSchema) } },
    responses: { 200: { description: "Actualizado", content: json(spec.itemSchema) } },
  });
  registerPath({
    method: "delete",
    path: `${base}/{id}`,
    tags: [spec.tag],
    summary: `Desactivación lógica de ${spec.label} (${spec.manage})`,
    security: bearer,
    parameters: [idParam],
    responses: { 200: { description: "Desactivado", content: json(spec.itemSchema) } },
  });

  const canView = requiresAnyPermission(spec.view);
  const canManage = requiresPermission(spec.manage);

  router.use(authenticate);
  router.post("/query", canView, asyncHandler(controller.table));
  router.get("/", canView, asyncHandler(controller.options));
  router.get("/:id", canView, asyncHandler(controller.getById));
  router.post("/", canManage, asyncHandler(controller.create));
  router.patch("/:id", canManage, asyncHandler(controller.update));
  router.delete("/:id", canManage, asyncHandler(controller.deactivate));
  return router;
};

export const createTermRouter = (controller: TermController): Router => {
  const router = Router();

  registerPath({
    method: "post",
    path: "/terms/query",
    tags: ["Catalogs"],
    summary: "Tabla server-side de ciclos escolares (terms.view)",
    security: bearer,
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(TermTableResponseSchema) } },
  });
  registerPath({
    method: "get",
    path: "/terms",
    tags: ["Catalogs"],
    summary: "Lista de ciclos escolares (terms.view)",
    security: bearer,
    responses: { 200: { description: "Ciclos", content: json(z.array(TermSchema)) } },
  });
  registerPath({
    method: "get",
    path: "/terms/active",
    tags: ["Catalogs"],
    summary: "Ciclo escolar activo o null (terms.view)",
    security: bearer,
    responses: { 200: { description: "Ciclo activo", content: json(TermSchema.nullable()) } },
  });
  registerPath({
    method: "post",
    path: "/terms",
    tags: ["Catalogs"],
    summary: "Alta de ciclo escolar (terms.manage)",
    security: bearer,
    request: { body: { required: true, content: json(TermCreateDto) } },
    responses: { 201: { description: "Creado", content: json(TermSchema) } },
  });
  registerPath({
    method: "patch",
    path: "/terms/{id}",
    tags: ["Catalogs"],
    summary: "Edición de ciclo escolar (terms.manage)",
    security: bearer,
    parameters: [idParam],
    request: { body: { required: true, content: json(TermUpdateDto) } },
    responses: { 200: { description: "Actualizado", content: json(TermSchema) } },
  });
  registerPath({
    method: "put",
    path: "/terms/{id}/activate",
    tags: ["Catalogs"],
    summary: "Activa el ciclo y desactiva el anterior (terms.manage)",
    security: bearer,
    parameters: [idParam],
    responses: {
      200: { description: "Ciclo activo", content: json(TermSchema) },
      409: { description: "Ya era el activo" },
    },
  });

  router.use(authenticate);
  router.post("/query", requiresPermission("terms.view"), asyncHandler(controller.table));
  router.get("/", requiresPermission("terms.view"), asyncHandler(controller.options));
  router.get("/active", requiresPermission("terms.view"), asyncHandler(controller.active));
  router.post("/", requiresPermission("terms.manage"), asyncHandler(controller.create));
  router.patch("/:id", requiresPermission("terms.manage"), asyncHandler(controller.update));
  router.put("/:id/activate", requiresPermission("terms.manage"), asyncHandler(controller.activate));
  return router;
};
