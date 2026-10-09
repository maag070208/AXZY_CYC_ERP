import { Router } from "express";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath, z } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  DeactivateUserDto,
  ResetUserPasswordDto,
  SetUserPermissionsDto,
  UserCreateDto,
  UserPermissionsViewSchema,
  UserSchema,
  UserTableResponseSchema,
  UserUpdateDto,
} from "../models/dto/user.dto";
import type { UserController } from "../controllers/user.controller";

const bearer = [{ bearerAuth: [] }];
const idParam = { in: "path" as const, name: "id", required: true, schema: { type: "string" as const } };

export const createUserRouter = (controller: UserController): Router => {
  const router = Router();

  registerPath({
    method: "post",
    path: "/users/query",
    tags: ["Users"],
    summary: "Tabla server-side de usuarios",
    security: bearer,
    request: { body: { required: true, content: { "application/json": { schema: TableQuerySchema } } } },
    responses: {
      200: { description: "Página de usuarios", content: { "application/json": { schema: UserTableResponseSchema } } },
    },
  });

  registerPath({
    method: "get",
    path: "/users",
    tags: ["Users"],
    summary: "Lista de usuarios",
    security: bearer,
    responses: { 200: { description: "Usuarios", content: { "application/json": { schema: z.array(UserSchema) } } } },
  });

  registerPath({
    method: "get",
    path: "/users/{id}",
    tags: ["Users"],
    summary: "Detalle de usuario",
    security: bearer,
    parameters: [idParam],
    responses: { 200: { description: "Usuario", content: { "application/json": { schema: UserSchema } } } },
  });

  registerPath({
    method: "post",
    path: "/users",
    tags: ["Users"],
    summary: "Alta de usuario",
    security: bearer,
    request: { body: { required: true, content: { "application/json": { schema: UserCreateDto } } } },
    responses: {
      201: { description: "Usuario creado", content: { "application/json": { schema: UserSchema } } },
      409: { description: "Username o email duplicado" },
    },
  });

  registerPath({
    method: "patch",
    path: "/users/{id}",
    tags: ["Users"],
    summary: "Edición de usuario (incluye multi-rol)",
    security: bearer,
    parameters: [idParam],
    request: { body: { required: true, content: { "application/json": { schema: UserUpdateDto } } } },
    responses: { 200: { description: "Usuario actualizado", content: { "application/json": { schema: UserSchema } } } },
  });

  registerPath({
    method: "delete",
    path: "/users/{id}",
    tags: ["Users"],
    summary: "Baja lógica de usuario",
    security: bearer,
    parameters: [idParam],
    request: { body: { required: false, content: { "application/json": { schema: DeactivateUserDto } } } },
    responses: { 200: { description: "Usuario dado de baja", content: { "application/json": { schema: UserSchema } } } },
  });

  registerPath({
    method: "post",
    path: "/users/{id}/reactivate",
    tags: ["Users"],
    summary: "Reactiva una cuenta dada de baja",
    security: bearer,
    parameters: [idParam],
    responses: {
      200: { description: "Usuario reactivado", content: { "application/json": { schema: UserSchema } } },
      409: { description: "La cuenta ya estaba activa" },
    },
  });

  registerPath({
    method: "post",
    path: "/users/{id}/unlock",
    tags: ["Users"],
    summary: "Quita el bloqueo por intentos fallidos",
    security: bearer,
    parameters: [idParam],
    responses: {
      200: { description: "Usuario desbloqueado", content: { "application/json": { schema: UserSchema } } },
      409: { description: "La cuenta no estaba bloqueada" },
    },
  });

  registerPath({
    method: "post",
    path: "/users/{id}/reset-password",
    tags: ["Users"],
    summary: "Asigna una contraseña temporal (obliga a cambiarla y cierra sesiones)",
    security: bearer,
    parameters: [idParam],
    request: { body: { required: true, content: { "application/json": { schema: ResetUserPasswordDto } } } },
    responses: {
      200: { description: "Contraseña temporal asignada", content: { "application/json": { schema: UserSchema } } },
      403: { description: "Sin permiso o política ABAC" },
    },
  });

  registerPath({
    method: "get",
    path: "/users/{id}/permissions",
    tags: ["Users"],
    summary: "Roles, excepciones y permisos efectivos del usuario",
    security: bearer,
    parameters: [idParam],
    responses: {
      200: { description: "Permisos del usuario", content: { "application/json": { schema: UserPermissionsViewSchema } } },
    },
  });

  registerPath({
    method: "put",
    path: "/users/{id}/permissions",
    tags: ["Users"],
    summary: "Asigna roles y/o una excepción de permiso",
    security: bearer,
    parameters: [idParam],
    request: { body: { required: true, content: { "application/json": { schema: SetUserPermissionsDto } } } },
    responses: {
      200: { description: "Permisos actualizados", content: { "application/json": { schema: UserPermissionsViewSchema } } },
    },
  });

  registerPath({
    method: "delete",
    path: "/users/{id}/permissions/{permission}",
    tags: ["Users"],
    summary: "Quita una excepción de permiso",
    security: bearer,
    parameters: [idParam, { in: "path" as const, name: "permission", required: true, schema: { type: "string" as const } }],
    responses: {
      200: { description: "Permisos actualizados", content: { "application/json": { schema: UserPermissionsViewSchema } } },
    },
  });

  router.use(authenticate);

  router.post("/query", requiresPermission("users.view"), asyncHandler(controller.table));
  router.get("/", requiresPermission("users.view"), asyncHandler(controller.list));
  router.get("/:id", requiresPermission("users.view"), asyncHandler(controller.getById));
  router.post("/", requiresPermission("users.create"), asyncHandler(controller.create));
  router.patch("/:id", requiresPermission("users.edit"), asyncHandler(controller.update));
  router.delete("/:id", requiresPermission("users.delete"), asyncHandler(controller.deactivate));
  router.post("/:id/reactivate", requiresPermission("users.delete"), asyncHandler(controller.reactivate));
  router.post("/:id/unlock", requiresPermission("users.edit"), asyncHandler(controller.unlock));
  router.post("/:id/reset-password", requiresPermission("users.edit"), asyncHandler(controller.resetPassword));
  router.get("/:id/permissions", requiresPermission("users.permissions"), asyncHandler(controller.listPermissions));
  router.put("/:id/permissions", requiresPermission("users.permissions"), asyncHandler(controller.setPermissions));
  router.delete("/:id/permissions/:permission", requiresPermission("users.permissions"), asyncHandler(controller.removePermission));

  return router;
};
