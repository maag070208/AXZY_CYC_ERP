import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  AssessmentCreateDto,
  AssessmentSchema,
  AssessmentTableResponseSchema,
  AssessmentUpdateDto,
  GradebookSchema,
  GradeCaptureDto,
  GradeSchema,
  GradeTableResponseSchema,
} from "../models/dto/grade.dto";
import type { AssessmentController, GradeController } from "../controllers/grade.controller";

const bearer = [{ bearerAuth: [] }];
const param = (name: string) => ({ in: "path" as const, name, required: true, schema: { type: "string" as const } });
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });
type Extra = Omit<Parameters<typeof registerPath>[0], "method" | "path" | "summary" | "tags" | "security">;
const doc = (method: "get" | "post" | "patch" | "delete", path: string, summary: string, extra: Extra) =>
  registerPath({ method, path, tags: ["Grades"], summary, security: bearer, ...extra });

export const createAssessmentRouter = (controller: AssessmentController): Router => {
  doc("post", "/assessments/query", "Tabla de instrumentos (filtro groupId; assessments.view con alcance)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(AssessmentTableResponseSchema) } },
  });
  doc("post", "/assessments", "Alta de instrumento (assessments.manage; suma de ponderaciones ≤ 100)", {
    request: { body: { required: true, content: json(AssessmentCreateDto) } },
    responses: { 201: { description: "Instrumento", content: json(AssessmentSchema) }, 409: { description: "WEIGHTS_EXCEED_100 · GROUP_CLOSED" } },
  });
  doc("get", "/assessments/{id}", "Detalle (assessments.view)", {
    parameters: [param("id")],
    responses: { 200: { description: "Instrumento", content: json(AssessmentSchema) } },
  });
  doc("patch", "/assessments/{id}", "Edición (assessments.manage)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(AssessmentUpdateDto) } },
    responses: { 200: { description: "Instrumento", content: json(AssessmentSchema) } },
  });
  doc("delete", "/assessments/{id}", "Baja lógica (assessments.manage)", {
    parameters: [param("id")],
    responses: { 200: { description: "Instrumento inactivo", content: json(AssessmentSchema) } },
  });
  doc("post", "/assessments/{id}/grades", "Captura en lote (grades.capture; upsert por inscripción)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(GradeCaptureDto) } },
    responses: {
      200: { description: "Calificaciones persistidas", content: json(GradeSchema.array()) },
      400: { description: "SCORE_OUT_OF_RANGE · ENROLLMENT_NOT_IN_GROUP" },
      409: { description: "NOT_ENROLLED · GROUP_CLOSED" },
    },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("assessments.view"), asyncHandler(controller.table));
  router.post("/", requiresPermission("assessments.manage"), asyncHandler(controller.create));
  router.get("/:id", requiresPermission("assessments.view"), asyncHandler(controller.getById));
  router.patch("/:id", requiresPermission("assessments.manage"), asyncHandler(controller.update));
  router.delete("/:id", requiresPermission("assessments.manage"), asyncHandler(controller.deactivate));
  router.post("/:id/grades", requiresPermission("grades.capture"), asyncHandler(controller.capture));
  return router;
};

export const createGradeRouter = (controller: GradeController): Router => {
  doc("post", "/grades/query", "Tabla de calificaciones (filtros groupId, assessmentId, studentId)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(GradeTableResponseSchema) } },
  });
  doc("get", "/grades/export", "Exporta el libro del grupo a .xlsx (?groupId=; grades.export)", {
    responses: { 200: { description: "Archivo .xlsx" } },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("grades.view"), asyncHandler(controller.table));
  router.get("/export", requiresPermission("grades.export"), asyncHandler(controller.export));
  return router;
};

/** Montado en `/groups/:groupId` antes del router de grupos (auth por ruta). */
export const createGroupGradesRouter = (controller: GradeController): Router => {
  doc("get", "/groups/{groupId}/gradebook", "Libro de calificaciones con proyección de la final (grades.view)", {
    parameters: [param("groupId")],
    responses: { 200: { description: "Libro", content: json(GradebookSchema) } },
  });
  doc("post", "/groups/{groupId}/close", "Cierra el grupo: final, estatus y kardex (assessments.manage)", {
    parameters: [param("groupId")],
    responses: {
      200: { description: "Libro cerrado", content: json(GradebookSchema) },
      409: { description: "WEIGHTS_NOT_100 · GRADES_INCOMPLETE · GROUP_CLOSED" },
    },
  });

  const router = Router({ mergeParams: true });
  router.get("/gradebook", authenticate, requiresPermission("grades.view"), asyncHandler(controller.gradebook));
  router.post("/close", authenticate, requiresPermission("assessments.manage"), asyncHandler(controller.close));
  return router;
};
