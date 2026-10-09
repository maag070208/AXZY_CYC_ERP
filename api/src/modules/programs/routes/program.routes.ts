import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  PlanCreateDto,
  PlanDetailSchema,
  PlanSchema,
  PlanTableResponseSchema,
  ProgramCreateDto,
  ProgramDetailSchema,
  ProgramSchema,
  ProgramSubjectsDto,
  ProgramTableResponseSchema,
  ProgramUpdateDto,
} from "../models/dto/program.dto";
import type { ProgramController } from "../controllers/program.controller";

const bearer = [{ bearerAuth: [] }];
const idParam = (name = "id") => ({ in: "path" as const, name, required: true, schema: { type: "string" as const } });
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });
const tableReq = (schema: ZodTypeAny) => ({
  request: { body: { required: true, content: json(TableQuerySchema) } },
  responses: { 200: { description: "Página", content: json(schema) } },
});

export const createProgramRouter = (controller: ProgramController): Router => {
  registerPath({ method: "post", path: "/programs/query", tags: ["Programs"], summary: "Tabla de carreras (programs.view)", security: bearer, ...tableReq(ProgramTableResponseSchema) });
  registerPath({ method: "get", path: "/programs/{id}", tags: ["Programs"], summary: "Detalle con plan de estudios (programs.view)", security: bearer, parameters: [idParam()], responses: { 200: { description: "Carrera", content: json(ProgramDetailSchema) } } });
  registerPath({ method: "post", path: "/programs", tags: ["Programs"], summary: "Alta de carrera (programs.manage)", security: bearer, request: { body: { required: true, content: json(ProgramCreateDto) } }, responses: { 201: { description: "Carrera", content: json(ProgramDetailSchema) }, 409: { description: "PROGRAM_CODE_TAKEN" } } });
  registerPath({ method: "patch", path: "/programs/{id}", tags: ["Programs"], summary: "Edición de carrera (programs.manage)", security: bearer, parameters: [idParam()], request: { body: { required: true, content: json(ProgramUpdateDto) } }, responses: { 200: { description: "Carrera", content: json(ProgramDetailSchema) } } });
  registerPath({ method: "put", path: "/programs/{id}/subjects", tags: ["Programs"], summary: "Reemplaza el plan de estudios (programs.manage)", security: bearer, parameters: [idParam()], request: { body: { required: true, content: json(ProgramSubjectsDto) } }, responses: { 200: { description: "Carrera", content: json(ProgramDetailSchema) } } });
  registerPath({ method: "delete", path: "/programs/{id}", tags: ["Programs"], summary: "Baja lógica (programs.manage)", security: bearer, parameters: [idParam()], responses: { 200: { description: "Carrera", content: json(ProgramSchema) } } });
  registerPath({ method: "post", path: "/programs/{id}/reactivate", tags: ["Programs"], summary: "Reactiva (programs.manage)", security: bearer, parameters: [idParam()], responses: { 200: { description: "Carrera", content: json(ProgramSchema) } } });

  registerPath({ method: "post", path: "/plans/query", tags: ["Programs"], summary: "Tabla de planes de pago (plans.view)", security: bearer, ...tableReq(PlanTableResponseSchema) });
  registerPath({ method: "get", path: "/plans/{id}", tags: ["Programs"], summary: "Detalle del plan con cargos (plans.view)", security: bearer, parameters: [idParam()], responses: { 200: { description: "Plan", content: json(PlanDetailSchema) } } });
  registerPath({ method: "post", path: "/plans", tags: ["Programs"], summary: "Asigna alumno y genera el plan (plans.manage; Idempotency-Key)", security: bearer, request: { body: { required: true, content: json(PlanCreateDto) } }, responses: { 201: { description: "Plan", content: json(PlanSchema) }, 409: { description: "PROGRAM_INACTIVE / STUDENT_INACTIVE / IDEMPOTENCY_KEY_REUSED" } } });
  registerPath({ method: "post", path: "/plans/{id}/cancel", tags: ["Programs"], summary: "Cancela el plan y sus cargos pendientes (plans.manage)", security: bearer, parameters: [idParam()], responses: { 200: { description: "Plan", content: json(PlanDetailSchema) } } });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("programs.view"), asyncHandler(controller.table));
  router.get("/:id", requiresPermission("programs.view"), asyncHandler(controller.getById));
  router.post("/", requiresPermission("programs.manage"), asyncHandler(controller.create));
  router.patch("/:id", requiresPermission("programs.manage"), asyncHandler(controller.update));
  router.put("/:id/subjects", requiresPermission("programs.manage"), asyncHandler(controller.replaceSubjects));
  router.delete("/:id", requiresPermission("programs.manage"), asyncHandler(controller.deactivate));
  router.post("/:id/reactivate", requiresPermission("programs.manage"), asyncHandler(controller.reactivate));
  return router;
};

export const createPlanRouter = (controller: ProgramController): Router => {
  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("plans.view"), asyncHandler(controller.planTable));
  router.get("/:id", requiresPermission("plans.view"), asyncHandler(controller.planGet));
  router.post("/", requiresPermission("plans.manage"), asyncHandler(controller.planCreate));
  router.post("/:id/cancel", requiresPermission("plans.manage"), asyncHandler(controller.planCancel));
  return router;
};
