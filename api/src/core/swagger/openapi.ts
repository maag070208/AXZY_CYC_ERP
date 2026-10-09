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
        "API del SGE (M02 acceso y bitácora, M11 configuración y catálogos). Autenticación JWT (Bearer) con access + refresh rotado. " +
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
      { name: "Config", description: "Parámetros generales (M11)" },
      { name: "Catalogs", description: "Catálogos base (M11)" },
      { name: "Students", description: "Alumnos (M03) y bajas/reingresos (M05)" },
      { name: "Teachers", description: "Profesores (M04)" },
      { name: "Documents", description: "Expediente documental y kardex (M06)" },
      { name: "Health", description: "Salud del servicio" },
    ],
  });
};
