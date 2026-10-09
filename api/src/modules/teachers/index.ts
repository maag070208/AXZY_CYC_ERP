import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { TeacherService } from "./services/teacher.service";
import { TeacherController } from "./controllers/teacher.controller";
import { createTeacherRouter } from "./routes/teacher.routes";

export { TeacherService } from "./services/teacher.service";
export { usernameBase } from "./services/teacher.service";

/** M04 — profesores y su cuenta TEACHER. */
export const createTeachersModule = (audit?: AuditLogger) => {
  const teachers = new TeacherService(prismaClient, audit);
  return { router: createTeacherRouter(new TeacherController(teachers)), teachers };
};

export default createTeachersModule;
