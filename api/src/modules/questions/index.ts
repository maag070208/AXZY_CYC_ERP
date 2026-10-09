import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { QuestionService } from "./services/question.service";
import { QuestionController } from "./controllers/question.controller";
import { createQuestionRouter } from "./routes/question.routes";

/** M14 — banco de reactivos. */
export const createQuestionsModule = (audit?: AuditLogger) => {
  const service = new QuestionService(prismaClient, audit);
  return { router: createQuestionRouter(new QuestionController(service)) };
};

export default createQuestionsModule;
