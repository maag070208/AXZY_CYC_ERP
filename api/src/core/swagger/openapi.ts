import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry";
import { env } from "@core/config/env.config";

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

export const buildOpenApiDocument = () => {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "CYC API — Sistema de Gestión Escolar",
      version: "1.0.0",
      description:
        "API del SGE (Módulo M02). Autenticación JWT (Bearer) con access + refresh rotado. " +
        "Roles base: ADMIN, CONTROL_ESCOLAR, PROFESOR, ALUMNO.",
    },
    servers: [
      {
        url: `/api/v1`,
        description: env.NODE_ENV,
      },
    ],
    tags: [
      { name: "Auth", description: "Autenticación y sesión" },
      { name: "Users", description: "Usuarios y roles" },
      { name: "Permissions", description: "Roles, permisos y matriz" },
      { name: "Audit", description: "Bitácora" },
      { name: "Health", description: "Salud del servicio" },
    ],
  });
};
