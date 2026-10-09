import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  AttemptEventDto,
  ExamCreateDto,
  ExamDetailSchema,
  ExamQuestionsDto,
  ExamTableResponseSchema,
  ExamUpdateDto,
  ReviewDto,
  SaveAnswersDto,
  SubmitAttemptDto,
} from "../models/dto/exam.dto";
import type { ExamController } from "../controllers/exam.controller";

const bearer = [{ bearerAuth: [] }];
const param = (name: string) => ({ in: "path" as const, name, required: true, schema: { type: "string" as const } });
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });
type Extra = Omit<Parameters<typeof registerPath>[0], "method" | "path" | "summary" | "tags" | "security" | "responses"> &
  Partial<Pick<Parameters<typeof registerPath>[0], "responses">>;
const docFor = (tag: string) => (method: "get" | "post" | "patch" | "put" | "delete", path: string, summary: string, extra: Extra = {}) =>
  registerPath({ method, path, tags: [tag], summary, security: bearer, responses: { 200: { description: "OK" } }, ...extra });

export const createExamRouters = (c: ExamController) => {
  const doc = docFor("Online exams");
  doc("post", "/online-exams/query", "Tabla de exámenes (exams.view; AREA = sus grupos, OWN = publicados de sus grupos)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(ExamTableResponseSchema) } },
  });
  doc("get", "/online-exams/available", "Mis exámenes (alumno): intentos usados y si puedo iniciar (attempts.take)");
  doc("post", "/online-exams", "Alta en borrador (exams.manage)", {
    request: { body: { required: true, content: json(ExamCreateDto) } },
    responses: { 201: { description: "Examen", content: json(ExamDetailSchema) } },
  });
  doc("get", "/online-exams/{id}", "Detalle con preguntas (exams.view)", { parameters: [param("id")], responses: { 200: { description: "Examen", content: json(ExamDetailSchema) } } });
  doc("patch", "/online-exams/{id}", "Configuración (exams.manage); con intentos solo instrucciones, cierre y mostrar resultado", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(ExamUpdateDto) } },
    responses: { 200: { description: "Examen", content: json(ExamDetailSchema) }, 409: { description: "EXAM_PUBLISHED_LOCKED" } },
  });
  doc("delete", "/online-exams/{id}", "Elimina un borrador (exams.manage)", { parameters: [param("id")], responses: { 204: { description: "Eliminado" } } });
  doc("post", "/online-exams/{id}/questions", "Fija las preguntas y sus puntos (exams.manage)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(ExamQuestionsDto) } },
    responses: { 200: { description: "Examen", content: json(ExamDetailSchema) }, 409: { description: "EXAM_PUBLISHED_LOCKED" } },
  });
  doc("delete", "/online-exams/{id}/questions/{questionId}", "Quita una pregunta (exams.manage)", { parameters: [param("id"), param("questionId")] });
  doc("post", "/online-exams/{id}/publish", "Publica (exams.publish)", { parameters: [param("id")] });
  doc("post", "/online-exams/{id}/close", "Cierra y termina los intentos abiertos (exams.manage)", { parameters: [param("id")] });
  doc("post", "/online-exams/{id}/start", "Inicia o reanuda un intento (attempts.take)", {
    parameters: [param("id")],
    responses: { 201: { description: "Intento nuevo" }, 200: { description: "Intento reanudado" }, 409: { description: "EXAM_NOT_AVAILABLE" } },
  });
  doc("get", "/online-exams/{id}/results", "Resultados por alumno (attempts.view AREA/ALL)", { parameters: [param("id")] });

  const exams = Router();
  exams.use(authenticate);
  exams.post("/query", requiresPermission("exams.view"), asyncHandler(c.table));
  exams.get("/available", requiresPermission("attempts.take"), asyncHandler(c.available));
  exams.post("/", requiresPermission("exams.manage"), asyncHandler(c.create));
  exams.get("/:id", requiresPermission("exams.view"), asyncHandler(c.getById));
  exams.patch("/:id", requiresPermission("exams.manage"), asyncHandler(c.update));
  exams.delete("/:id", requiresPermission("exams.manage"), asyncHandler(c.remove));
  exams.post("/:id/questions", requiresPermission("exams.manage"), asyncHandler(c.setQuestions));
  exams.delete("/:id/questions/:questionId", requiresPermission("exams.manage"), asyncHandler(c.removeQuestion));
  exams.post("/:id/publish", requiresPermission("exams.publish"), asyncHandler(c.publish));
  exams.post("/:id/close", requiresPermission("exams.manage"), asyncHandler(c.close));
  exams.post("/:id/start", requiresPermission("attempts.take"), asyncHandler(c.start));
  exams.get("/:id/results", requiresPermission("attempts.view"), asyncHandler(c.results));

  const adoc = docFor("Attempts");
  adoc("get", "/attempts/{id}", "Intento: el alumno ve el suyo (sin claves); el personal, la revisión (attempts.view)", { parameters: [param("id")] });
  adoc("put", "/attempts/{id}/answers", "Guardado automático (attempts.take)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(SaveAnswersDto) } },
    responses: { 200: { description: "{ saved, savedAt, remainingSeconds }" }, 409: { description: "ATTEMPT_CLOSED" } },
  });
  adoc("post", "/attempts/{id}/submit", "Envía y califica (attempts.take)", {
    parameters: [param("id")],
    request: { body: { required: false, content: json(SubmitAttemptDto) } },
    responses: { 200: { description: "Intento cerrado" } },
  });
  adoc("post", "/attempts/{id}/events", "Cambio de pestaña (attempts.take)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(AttemptEventDto) } },
    responses: { 200: { description: "{ focusLosses }" } },
  });
  adoc("patch", "/attempts/{id}/review", "Revisión manual de una abierta (attempts.review)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(ReviewDto) } },
    responses: { 200: { description: "{ attemptId, score, pendingCount, grade }" } },
  });
  adoc("post", "/attempts/{id}/regrade", "Recalifica y reescribe el Grade (attempts.review)", { parameters: [param("id")] });

  const attempts = Router();
  attempts.use(authenticate);
  attempts.get("/:id", requiresPermission("attempts.view"), asyncHandler(c.getAttempt));
  attempts.put("/:id/answers", requiresPermission("attempts.take"), asyncHandler(c.saveAnswers));
  attempts.post("/:id/submit", requiresPermission("attempts.take"), asyncHandler(c.submit));
  attempts.post("/:id/events", requiresPermission("attempts.take"), asyncHandler(c.event));
  attempts.patch("/:id/review", requiresPermission("attempts.review"), asyncHandler(c.review));
  attempts.post("/:id/regrade", requiresPermission("attempts.review"), asyncHandler(c.regrade));
  return { exams, attempts };
};
