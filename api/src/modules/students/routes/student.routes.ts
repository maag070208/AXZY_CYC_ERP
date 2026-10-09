import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath, z } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  MovementInputDto,
  MovementResultSchema,
  MovementSchema,
  StudentCreateDto,
  StudentSchema,
  StudentTableResponseSchema,
  StudentUpdateDto,
} from "../models/dto/student.dto";
import type { StudentController } from "../controllers/student.controller";

const bearer = [{ bearerAuth: [] }];
const idParam = { in: "path" as const, name: "id", required: true, schema: { type: "string" as const } };
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });

export const createStudentRouter = (controller: StudentController): Router => {
  const router = Router();
  type RouteExtra = Omit<Parameters<typeof registerPath>[0], "method" | "path" | "summary">;
  const doc = (method: "get" | "post" | "patch" | "delete", path: string, summary: string, extra: Omit<RouteExtra, "tags" | "security">) =>
    registerPath({ method, path, tags: ["Students"], summary, security: bearer, ...extra });

  doc("post", "/students/query", "Tabla server-side de alumnos (students.view, con alcance)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(StudentTableResponseSchema) } },
  });
  doc("get", "/students/summary", "Totales activos/baja dentro del alcance", {
    responses: { 200: { description: "Totales", content: json(z.object({ total: z.number(), active: z.number(), withdrawn: z.number() })) } },
  });
  doc("post", "/students/export", "Exporta a Excel con los filtros vigentes (students.export)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Archivo .xlsx" } },
  });
  doc("post", "/students", "Alta de alumno con tutores; genera la matrícula (students.create)", {
    request: { body: { required: true, content: json(StudentCreateDto) } },
    responses: {
      201: { description: "Alumno creado", content: json(StudentSchema) },
      409: { description: "DUPLICATE_CURP / DUPLICATE_STUDENT (confirmable) / DUPLICATE_MATRICULA" },
    },
  });
  doc("get", "/students/{id}", "Detalle con tutores (students.view)", {
    parameters: [idParam],
    responses: { 200: { description: "Alumno", content: json(StudentSchema) }, 404: { description: "Fuera de alcance o inexistente" } },
  });
  doc("patch", "/students/{id}", "Edición (tutores reemplazan a los actuales; la matrícula no cambia)", {
    parameters: [idParam],
    request: { body: { required: true, content: json(StudentUpdateDto) } },
    responses: { 200: { description: "Alumno", content: json(StudentSchema) } },
  });
  doc("delete", "/students/{id}", "Baja lógica con motivo (students.delete); registra el movimiento", {
    parameters: [idParam],
    request: { body: { required: true, content: json(MovementInputDto) } },
    responses: { 200: { description: "Baja registrada", content: json(MovementResultSchema) } },
  });
  doc("post", "/students/{id}/withdrawal", "Baja con motivo (students.movements)", {
    parameters: [idParam],
    request: { body: { required: true, content: json(MovementInputDto) } },
    responses: { 200: { description: "Baja registrada", content: json(MovementResultSchema) }, 409: { description: "STUDENT_INACTIVE" } },
  });
  doc("post", "/students/{id}/reentry", "Reingreso con motivo; conserva la matrícula (students.movements)", {
    parameters: [idParam],
    request: { body: { required: true, content: json(MovementInputDto) } },
    responses: { 200: { description: "Reingreso registrado", content: json(MovementResultSchema) }, 409: { description: "STUDENT_ALREADY_ACTIVE" } },
  });
  doc("get", "/students/{id}/movements", "Historial de movimientos (students.movements)", {
    parameters: [idParam],
    responses: { 200: { description: "Movimientos", content: json(z.array(MovementSchema)) } },
  });

  router.use(authenticate);
  router.post("/query", requiresPermission("students.view"), asyncHandler(controller.table));
  router.get("/summary", requiresPermission("students.view"), asyncHandler(controller.summary));
  router.post("/export", requiresPermission("students.export"), asyncHandler(controller.export));
  router.post("/", requiresPermission("students.create"), asyncHandler(controller.create));
  router.get("/:id", requiresPermission("students.view"), asyncHandler(controller.getById));
  router.patch("/:id", requiresPermission("students.edit"), asyncHandler(controller.update));
  router.delete("/:id", requiresPermission("students.delete"), asyncHandler(controller.remove));
  router.post("/:id/withdrawal", requiresPermission("students.movements"), asyncHandler(controller.withdraw));
  router.post("/:id/reentry", requiresPermission("students.movements"), asyncHandler(controller.reenter));
  router.get("/:id/movements", requiresPermission("students.movements"), asyncHandler(controller.listMovements));
  return router;
};
