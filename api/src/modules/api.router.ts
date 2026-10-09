import { Router } from "express";
import { prismaClient } from "@core/config/database";
import { registerPath } from "@core/swagger/registry";
import { createAuthModule } from "./auth";
import { createUserModule } from "./users";
import { createPermissionsModule } from "./permissions";
import { createAuditModule, type AuditPort } from "./audit";
import { createConfigModule } from "./config";
import { createStudentsModule } from "./students";
import { createTeachersModule } from "./teachers";
import { createDocumentsModule } from "./documents";
import { createCoursesModule } from "./courses";
import { createGradesModule } from "./grades";

// Puerto de auditoría (DIP): cada módulo recibe solo `createLog`, no el servicio.
const { router: auditRouter, service: auditService } = createAuditModule();
const auditPort: AuditPort = {
  createLog: (input, client) => auditService.createLog(input, client),
};

const authRouter = createAuthModule(auditPort.createLog).router;
const userRouter = createUserModule(auditPort.createLog);
const permissionsRouter = createPermissionsModule(auditPort.createLog).router;
const config = createConfigModule(auditPort.createLog);
const students = createStudentsModule(auditPort.createLog);
const teachers = createTeachersModule(auditPort.createLog);
const documents = createDocumentsModule(students.students, auditPort.createLog);
const courses = createCoursesModule(auditPort.createLog);
const grades = createGradesModule(auditPort.createLog);

// Puertos entre módulos: la baja del alumno (M05) cancela sus inscripciones
// (M07) y el kardex (M06) lee las calificaciones (M08).
students.movements.setEnrollmentCanceller(courses.enrollments.cancelForStudent);
documents.kardex.setSource(grades.grades.kardexSource);

const apiRouter = Router();

/** Momento de arranque del módulo, para reportar `uptimeSeconds`. */
const startedAt = Date.now();

registerPath({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Liveness probe",
  description: "Devuelve 200 si el proceso responde. No toca la base de datos.",
  responses: {
    200: { description: "Servicio vivo", content: { "application/json": { schema: { type: "object" } } } },
  },
});

registerPath({
  method: "get",
  path: "/health/ready",
  tags: ["Health"],
  summary: "Readiness probe (checa la BD)",
  description: "Hace un `SELECT 1`; responde 200 si la BD responde y 503 si no.",
  responses: {
    200: { description: "Servicio listo", content: { "application/json": { schema: { type: "object" } } } },
    503: { description: "BD no disponible", content: { "application/json": { schema: { type: "object" } } } },
  },
});

apiRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cyc-api",
    version: "1.0.0",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    ts: new Date().toISOString(),
  });
});

apiRouter.get("/health/ready", async (_req, res) => {
  try {
    await prismaClient.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up", ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", db: "down", ts: new Date().toISOString() });
  }
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/permissions", permissionsRouter);
apiRouter.use("/audit", auditRouter);
apiRouter.use("/settings", config.routers.settings);
apiRouter.use("/levels", config.routers.levels);
apiRouter.use("/terms", config.routers.terms);
apiRouter.use("/cancellation-reasons", config.routers.cancellationReasons);
apiRouter.use("/document-types", config.routers.documentTypes);
// Expediente y kardex antes que `/students` para no autenticar dos veces.
apiRouter.use("/students/:studentId", documents.studentRouter);
apiRouter.use("/students", students.router);
apiRouter.use("/documents", documents.documentsRouter);
apiRouter.use("/teachers", teachers.router);
apiRouter.use("/courses", courses.routers.courses);
// Libro y cierre (M08) antes que `/groups` para no autenticar dos veces.
apiRouter.use("/groups/:groupId", grades.routers.groupGrades);
apiRouter.use("/groups", courses.routers.groups);
apiRouter.use("/enrollments", courses.routers.enrollments);
apiRouter.use("/assessments", grades.routers.assessments);
apiRouter.use("/grades", grades.routers.grades);

export { auditService };
export default apiRouter;
