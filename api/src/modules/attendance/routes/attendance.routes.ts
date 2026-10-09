import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { HttpError } from "@core/middlewares/error.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import { MAX_JUSTIFICATION_BYTES } from "../models/entity/attendance-rules";
import {
  AnnulDto,
  GroupSummarySchema,
  JustificationSchema,
  JustificationTableResponseSchema,
  ResolveDto,
  RollCallDto,
  SessionCreateDto,
  SessionRollSchema,
  SessionSchema,
  StudentAttendanceSchema,
} from "../models/dto/attendance.dto";
import type { AttendanceController } from "../controllers/attendance.controller";

const bearer = [{ bearerAuth: [] }];
const param = (name: string) => ({ in: "path" as const, name, required: true, schema: { type: "string" as const } });
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });
type Extra = Omit<Parameters<typeof registerPath>[0], "method" | "path" | "summary" | "tags" | "security" | "responses"> &
  Partial<Pick<Parameters<typeof registerPath>[0], "responses">>;
const doc = (method: "get" | "post" | "patch" | "put" | "delete", path: string, summary: string, extra: Extra = {}) =>
  registerPath({ method, path, tags: ["Attendance"], summary, security: bearer, responses: { 200: { description: "OK" } }, ...extra });

/** `multer` en memoria con un byte de más para detectar el exceso (5 MB). */
const single = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_JUSTIFICATION_BYTES + 1, files: 1 } }).single("file");
const uploadFile = (req: Request, res: Response, next: NextFunction) =>
  single(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return next(new HttpError(400, "FILE_TOO_LARGE", { maxMb: 5 }));
    next(error instanceof multer.MulterError ? new HttpError(400, "INVALID_BODY") : error);
  });

export const createAttendanceRouters = (c: AttendanceController) => {
  doc("get", "/groups/{groupId}/sessions", "Sesiones del grupo (attendance.view AREA/ALL)", {
    parameters: [param("groupId")],
    responses: { 200: { description: "Sesiones", content: json(SessionSchema.array()) } },
  });
  doc("post", "/groups/{groupId}/sessions", "Crea una sesión (attendance.manage)", {
    parameters: [param("groupId")],
    request: { body: { required: true, content: json(SessionCreateDto) } },
    responses: { 201: { description: "Sesión", content: json(SessionSchema) }, 409: { description: "SESSION_DUPLICATE / GROUP_CLOSED" } },
  });
  doc("get", "/groups/{groupId}/attendance-summary", "Porcentaje por alumno y alerta (attendance.view; OWN = su renglón)", {
    parameters: [param("groupId")],
    responses: { 200: { description: "Resumen", content: json(GroupSummarySchema) } },
  });
  doc("get", "/attendance-sessions/{id}", "Pase de lista de la sesión (attendance.view AREA/ALL)", {
    parameters: [param("id")],
    responses: { 200: { description: "Pase", content: json(SessionRollSchema) } },
  });
  doc("put", "/attendance-sessions/{id}/attendance", "Guarda el pase (attendance.manage): todos los inscritos, upsert", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(RollCallDto) } },
    responses: { 200: { description: "{ sessionId, saved, skipped }" }, 400: { description: "ATTENDANCE_INCOMPLETE / INVALID_REFERENCE" } },
  });
  doc("delete", "/attendance-sessions/{id}", "Anula la sesión con motivo (attendance.manage)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(AnnulDto) } },
  });
  doc("get", "/students/{studentId}/attendance", "Asistencia del alumno por grupo con detalle (attendance.view)", {
    parameters: [param("studentId")],
    responses: { 200: { description: "Asistencia", content: json(StudentAttendanceSchema) } },
  });
  doc("post", "/justifications", "Solicita un justificante: multipart attendanceId, motivo y file opcional (attendance.justify)", {
    responses: { 201: { description: "Justificante", content: json(JustificationSchema) }, 409: { description: "JUSTIFICATION_ONLY_ABSENCE / JUSTIFICATION_EXISTS" } },
  });
  doc("post", "/justifications/query", "Bandeja de justificantes (attendance.justify; OWN = los propios)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(JustificationTableResponseSchema) } },
  });
  doc("patch", "/justifications/{id}/resolve", "Aprueba o rechaza (attendance.justify AREA/ALL)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(ResolveDto) } },
    responses: { 200: { description: "Justificante", content: json(JustificationSchema) }, 409: { description: "JUSTIFICATION_ALREADY_RESOLVED" } },
  });
  doc("get", "/justifications/{id}/file", "Descarga el archivo (attendance.view)", { parameters: [param("id")] });

  // Montado en `/groups/:groupId` junto a otros routers: autentica por ruta.
  const group = Router({ mergeParams: true });
  group.get("/sessions", authenticate, requiresPermission("attendance.view"), asyncHandler(c.listSessions));
  group.post("/sessions", authenticate, requiresPermission("attendance.manage"), asyncHandler(c.createSession));
  group.get("/attendance-summary", authenticate, requiresPermission("attendance.view"), asyncHandler(c.groupSummary));

  const sessions = Router();
  sessions.use(authenticate);
  sessions.get("/:id", requiresPermission("attendance.view"), asyncHandler(c.getRoll));
  sessions.put("/:id/attendance", requiresPermission("attendance.manage"), asyncHandler(c.saveRoll));
  sessions.delete("/:id", requiresPermission("attendance.manage"), asyncHandler(c.annul));

  const student = Router({ mergeParams: true });
  student.get("/attendance", authenticate, requiresPermission("attendance.view"), asyncHandler(c.studentSummary));

  const justifications = Router();
  justifications.use(authenticate);
  justifications.post("/query", requiresPermission("attendance.justify"), asyncHandler(c.justificationsTable));
  justifications.post("/", requiresPermission("attendance.justify"), uploadFile, asyncHandler(c.createJustification));
  justifications.patch("/:id/resolve", requiresPermission("attendance.justify"), asyncHandler(c.resolve));
  justifications.get("/:id/file", requiresPermission("attendance.view"), asyncHandler(c.file));

  return { group, sessions, student, justifications };
};
