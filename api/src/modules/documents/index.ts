import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import type { StudentService } from "@modules/students";
import { DocumentService } from "./services/document.service";
import { KardexService } from "./services/kardex.service";
import { DocumentController } from "./controllers/document.controller";
import { createDocumentsRouter, createStudentDocumentsRouter } from "./routes/document.routes";

export { KardexService } from "./services/kardex.service";
export type { KardexSource } from "./models/entity/document.entity";

/** M06 — expediente documental y kardex calculado. Recibe el servicio de alumnos (alcance). */
export const createDocumentsModule = (students: StudentService, audit?: AuditLogger) => {
  const documents = new DocumentService(students, prismaClient, audit);
  const kardex = new KardexService(students, prismaClient);
  const controller = new DocumentController(documents, kardex);
  return {
    studentRouter: createStudentDocumentsRouter(controller),
    documentsRouter: createDocumentsRouter(controller),
    documents,
    kardex,
  };
};

export default createDocumentsModule;
