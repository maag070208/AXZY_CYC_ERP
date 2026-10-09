import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { StudentService } from "./services/student.service";
import { MovementService } from "./services/movement.service";
import { StudentController } from "./controllers/student.controller";
import { createStudentRouter } from "./routes/student.routes";

export { StudentService } from "./services/student.service";
export { formatMatricula } from "./services/student.service";
export { MovementService } from "./services/movement.service";
export { studentContacts } from "./services/contacts";

/** M03 (alumnos) + M05 (bajas y reingresos, subdominio de alumnos). */
export const createStudentsModule = (audit?: AuditLogger) => {
  const students = new StudentService(prismaClient, audit);
  const movements = new MovementService(students, prismaClient, audit);
  const router = createStudentRouter(new StudentController(students, movements));
  return { router, students, movements };
};

export default createStudentsModule;
