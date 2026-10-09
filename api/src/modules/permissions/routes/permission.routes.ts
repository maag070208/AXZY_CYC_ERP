import { Router } from "express";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import {
  PermissionCatalogCreateSchema,
  PermissionCatalogListSchema,
  PermissionCatalogSchema,
  PermissionCatalogUpdateSchema,
  PermissionMatrixUpdateSchema,
  RoleCreateSchema,
  RoleListSchema,
  RoleSchema,
  RoleUpdateSchema,
  RolesAdminResponseSchema,
} from "../models/dto/permission.dto";
import {
  PolicyActionSchema,
  PolicyCreateDto,
  PolicySchema,
  PolicyUpdateDto,
} from "../models/dto/policy.dto";
import type { PermissionController } from "../controllers/permission.controller";

const bearer = [{ bearerAuth: [] }];

export const createPermissionsRoutes = (controller: PermissionController): Router => {
  const router = Router();

  registerPath({
    method: "get",
    path: "/permissions/catalog",
    tags: ["Permissions"],
    summary: "Catálogo de permisos activos",
    security: bearer,
    responses: {
      200: { description: "Permisos activos", content: { "application/json": { schema: PermissionCatalogListSchema } } },
    },
  });

  registerPath({
    method: "get",
    path: "/permissions/roles",
    tags: ["Permissions"],
    summary: "Roles con su número de usuarios",
    security: bearer,
    responses: {
      200: { description: "Roles", content: { "application/json": { schema: RoleListSchema } } },
    },
  });

  registerPath({
    method: "get",
    path: "/permissions/admin",
    tags: ["Permissions"],
    summary: "Roles, catálogo completo y matriz (roles.manage)",
    security: bearer,
    responses: {
      200: { description: "Datos de administración", content: { "application/json": { schema: RolesAdminResponseSchema } } },
    },
  });

  registerPath({
    method: "put",
    path: "/permissions/matrix",
    tags: ["Permissions"],
    summary: "Actualiza celdas de la matriz rol → permiso → alcance (roles.manage)",
    security: bearer,
    request: { body: { required: true, content: { "application/json": { schema: PermissionMatrixUpdateSchema } } } },
    responses: {
      200: { description: "Matriz actualizada", content: { "application/json": { schema: { type: "object" } } } },
      409: { description: "Conflicto (anti-lockout de roles.manage)" },
    },
  });

  registerPath({
    method: "post",
    path: "/permissions/roles",
    tags: ["Permissions"],
    summary: "Crear rol (roles.manage)",
    security: bearer,
    request: { body: { required: true, content: { "application/json": { schema: RoleCreateSchema } } } },
    responses: {
      201: { description: "Rol creado", content: { "application/json": { schema: RoleSchema } } },
      409: { description: "Clave duplicada" },
    },
  });

  registerPath({
    method: "patch",
    path: "/permissions/roles/{key}",
    tags: ["Permissions"],
    summary: "Editar rol (roles.manage)",
    security: bearer,
    parameters: [{ in: "path", name: "key", required: true, schema: { type: "string" } }],
    request: { body: { required: true, content: { "application/json": { schema: RoleUpdateSchema } } } },
    responses: {
      200: { description: "Rol actualizado", content: { "application/json": { schema: RoleSchema } } },
      409: { description: "Rol de sistema o anti-lockout" },
    },
  });

  registerPath({
    method: "delete",
    path: "/permissions/roles/{key}",
    tags: ["Permissions"],
    summary: "Eliminar rol (roles.manage)",
    security: bearer,
    parameters: [{ in: "path", name: "key", required: true, schema: { type: "string" } }],
    responses: {
      204: { description: "Rol eliminado" },
      409: { description: "Rol de sistema o con usuarios" },
    },
  });

  registerPath({
    method: "post",
    path: "/permissions/catalog",
    tags: ["Permissions"],
    summary: "Crear permiso del catálogo (roles.manage)",
    security: bearer,
    request: { body: { required: true, content: { "application/json": { schema: PermissionCatalogCreateSchema } } } },
    responses: {
      201: { description: "Permiso creado", content: { "application/json": { schema: PermissionCatalogSchema } } },
    },
  });

  registerPath({
    method: "patch",
    path: "/permissions/catalog/{key}",
    tags: ["Permissions"],
    summary: "Editar permiso del catálogo (roles.manage)",
    security: bearer,
    parameters: [{ in: "path", name: "key", required: true, schema: { type: "string" } }],
    request: { body: { required: true, content: { "application/json": { schema: PermissionCatalogUpdateSchema } } } },
    responses: {
      200: { description: "Permiso actualizado", content: { "application/json": { schema: PermissionCatalogSchema } } },
    },
  });

  registerPath({
    method: "post",
    path: "/permissions/reload",
    tags: ["Permissions"],
    summary: "Recarga catálogo y matriz desde la BD (roles.manage)",
    security: bearer,
    responses: {
      200: { description: "Caches recargadas", content: { "application/json": { schema: { type: "object" } } } },
    },
  });

  const idParam = { in: "path" as const, name: "id", required: true, schema: { type: "string" as const } };

  registerPath({
    method: "get",
    path: "/permissions/policies/actions",
    tags: ["Permissions"],
    summary: "Acciones que admiten políticas ABAC y sus campos (roles.manage)",
    security: bearer,
    responses: {
      200: { description: "Registro de acciones", content: { "application/json": { schema: PolicyActionSchema.array() } } },
    },
  });

  registerPath({
    method: "get",
    path: "/permissions/policies",
    tags: ["Permissions"],
    summary: "Políticas ABAC (roles.manage)",
    security: bearer,
    responses: {
      200: { description: "Políticas", content: { "application/json": { schema: PolicySchema.array() } } },
    },
  });

  registerPath({
    method: "post",
    path: "/permissions/policies",
    tags: ["Permissions"],
    summary: "Crear política ABAC (roles.manage)",
    security: bearer,
    request: { body: { required: true, content: { "application/json": { schema: PolicyCreateDto } } } },
    responses: {
      201: { description: "Política creada", content: { "application/json": { schema: PolicySchema } } },
      400: { description: "Acción o campo no registrado" },
      409: { description: "Clave duplicada" },
    },
  });

  registerPath({
    method: "patch",
    path: "/permissions/policies/{id}",
    tags: ["Permissions"],
    summary: "Editar política ABAC (roles.manage)",
    security: bearer,
    parameters: [idParam],
    request: { body: { required: true, content: { "application/json": { schema: PolicyUpdateDto } } } },
    responses: {
      200: { description: "Política actualizada", content: { "application/json": { schema: PolicySchema } } },
    },
  });

  registerPath({
    method: "delete",
    path: "/permissions/policies/{id}",
    tags: ["Permissions"],
    summary: "Eliminar política ABAC (roles.manage)",
    security: bearer,
    parameters: [idParam],
    responses: { 204: { description: "Política eliminada" } },
  });

  router.use(authenticate);

  // Roles y catálogo activo: solo requieren sesión (la web los usa para nombres y selectores).
  router.get("/catalog", asyncHandler(controller.catalog));
  router.get("/roles", asyncHandler(controller.roles));

  router.get("/admin", requiresPermission("roles.manage"), asyncHandler(controller.admin));
  router.put("/matrix", requiresPermission("roles.manage"), asyncHandler(controller.matrix));
  router.post("/roles", requiresPermission("roles.manage"), asyncHandler(controller.createRole));
  router.patch("/roles/:key", requiresPermission("roles.manage"), asyncHandler(controller.updateRole));
  router.delete("/roles/:key", requiresPermission("roles.manage"), asyncHandler(controller.deleteRole));
  router.post("/catalog", requiresPermission("roles.manage"), asyncHandler(controller.createCatalog));
  router.patch("/catalog/:key", requiresPermission("roles.manage"), asyncHandler(controller.updateCatalog));
  router.post("/reload", requiresPermission("roles.manage"), asyncHandler(controller.reload));
  router.get("/policies/actions", requiresPermission("roles.manage"), asyncHandler(controller.policyActions));
  router.get("/policies", requiresPermission("roles.manage"), asyncHandler(controller.listPolicies));
  router.post("/policies", requiresPermission("roles.manage"), asyncHandler(controller.createPolicy));
  router.patch("/policies/:id", requiresPermission("roles.manage"), asyncHandler(controller.updatePolicy));
  router.delete("/policies/:id", requiresPermission("roles.manage"), asyncHandler(controller.deletePolicy));

  return router;
};
