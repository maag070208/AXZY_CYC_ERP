import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { AssessmentService } from "./services/assessment.service";
import { GradeService } from "./services/grade.service";
import { AssessmentController, GradeController } from "./controllers/grade.controller";
import { createAssessmentRouter, createGradeRouter, createGroupGradesRouter } from "./routes/grade.routes";

export { GradeService } from "./services/grade.service";

/** M08 — instrumentos de evaluación y calificaciones (captura manual). */
export const createGradesModule = (audit?: AuditLogger) => {
  const assessments = new AssessmentService(prismaClient, audit);
  const grades = new GradeService(prismaClient, audit);
  const gradeController = new GradeController(grades);
  return {
    routers: {
      assessments: createAssessmentRouter(new AssessmentController(assessments, grades)),
      grades: createGradeRouter(gradeController),
      groupGrades: createGroupGradesRouter(gradeController),
    },
    grades,
  };
};

export default createGradesModule;
