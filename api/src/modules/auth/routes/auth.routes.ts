import { Router } from "express";
import { authenticate } from "@core/middlewares/auth.middleware";
import { loginRateLimit, publicRateLimit } from "@core/middlewares/rate-limit.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import {
  AuthMeSchema,
  ChangePasswordInputSchema,
  ForgotPasswordInputSchema,
  LoginInputSchema,
  LoginResponseSchema,
  LogoutInputSchema,
  OkResponseSchema,
  RefreshInputSchema,
  RefreshResponseSchema,
  ResetPasswordInputSchema,
} from "../models/dto/auth.dto";
import type { AuthController } from "../controllers/auth.controller";

const bearer = [{ bearerAuth: [] }];

export const createAuthRouter = (controller: AuthController): Router => {
  const router = Router();

  registerPath({
    method: "post",
    path: "/auth/login",
    tags: ["Auth"],
    summary: "Inicia sesión",
    request: { body: { required: true, content: { "application/json": { schema: LoginInputSchema } } } },
    responses: {
      200: { description: "Tokens y usuario", content: { "application/json": { schema: LoginResponseSchema } } },
      400: { description: "Datos inválidos" },
      401: { description: "Credenciales inválidas o cuenta desactivada" },
      429: { description: "Cuenta bloqueada temporalmente o demasiados intentos desde la misma IP" },
    },
  });

  registerPath({
    method: "post",
    path: "/auth/refresh",
    tags: ["Auth"],
    summary: "Rota el refresh y emite un nuevo access",
    request: { body: { required: true, content: { "application/json": { schema: RefreshInputSchema } } } },
    responses: {
      200: { description: "Nuevos tokens", content: { "application/json": { schema: RefreshResponseSchema } } },
      401: { description: "Refresh inválido o expirado" },
    },
  });

  registerPath({
    method: "get",
    path: "/auth/me",
    tags: ["Auth"],
    summary: "Sesión actual (usuario, roles y permisos)",
    security: bearer,
    responses: {
      200: { description: "Usuario autenticado", content: { "application/json": { schema: AuthMeSchema } } },
      401: { description: "Token inválido o sesión inactiva" },
    },
  });

  registerPath({
    method: "post",
    path: "/auth/logout",
    tags: ["Auth"],
    summary: "Revoca el refresh vigente",
    security: bearer,
    request: { body: { required: false, content: { "application/json": { schema: LogoutInputSchema } } } },
    responses: { 204: { description: "Sesión cerrada" } },
  });

  registerPath({
    method: "post",
    path: "/auth/forgot-password",
    tags: ["Auth"],
    summary: "Solicita recuperación de contraseña",
    request: { body: { required: true, content: { "application/json": { schema: ForgotPasswordInputSchema } } } },
    responses: { 200: { description: "Siempre responde 200", content: { "application/json": { schema: OkResponseSchema } } } },
  });

  registerPath({
    method: "post",
    path: "/auth/reset-password",
    tags: ["Auth"],
    summary: "Restablece la contraseña con token de un uso",
    request: { body: { required: true, content: { "application/json": { schema: ResetPasswordInputSchema } } } },
    responses: {
      200: { description: "Contraseña restablecida", content: { "application/json": { schema: OkResponseSchema } } },
      422: { description: "Token de recuperación inválido" },
    },
  });

  registerPath({
    method: "post",
    path: "/auth/change-password",
    tags: ["Auth"],
    summary: "Cambia la contraseña propia (revoca sesiones y emite tokens nuevos)",
    security: bearer,
    request: { body: { required: true, content: { "application/json": { schema: ChangePasswordInputSchema } } } },
    responses: {
      200: { description: "Tokens nuevos", content: { "application/json": { schema: RefreshResponseSchema } } },
      422: { description: "Contraseña actual incorrecta o repetida" },
    },
  });

  // Rutas públicas (antes de `authenticate`).
  router.post("/login", loginRateLimit, asyncHandler(controller.login));
  router.post("/refresh", asyncHandler(controller.refresh));
  router.post("/forgot-password", publicRateLimit, asyncHandler(controller.forgotPassword));
  router.post("/reset-password", publicRateLimit, asyncHandler(controller.resetPassword));

  // Rutas protegidas.
  router.get("/me", authenticate, asyncHandler(controller.me));
  router.post("/logout", authenticate, asyncHandler(controller.logout));
  router.post("/change-password", authenticate, asyncHandler(controller.changePassword));

  return router;
};
