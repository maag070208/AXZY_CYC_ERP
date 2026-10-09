import { prismaClient } from "@core/config/database";
import type { AuditLogger } from "@modules/audit";
import { CourseService } from "./services/course.service";
import { GroupService } from "./services/group.service";
import { EnrollmentService } from "./services/enrollment.service";
import { registerAcademicScopes } from "./services/academic-scope";
import { CourseController, EnrollmentController, GroupController } from "./controllers/course.controller";
import { createCourseRouter, createEnrollmentRouter, createGroupRouter } from "./routes/course.routes";

export { GroupService } from "./services/group.service";
export { EnrollmentService } from "./services/enrollment.service";
export * from "./services/academic-scope";

/** M07 — cursos, grupos e inscripciones. Registra el ámbito AREA académico. */
export const createCoursesModule = (audit?: AuditLogger) => {
  registerAcademicScopes(prismaClient);
  const courses = new CourseService(prismaClient, audit);
  const groups = new GroupService(prismaClient, audit);
  const enrollments = new EnrollmentService(prismaClient, audit);
  return {
    routers: {
      courses: createCourseRouter(new CourseController(courses)),
      groups: createGroupRouter(new GroupController(groups, enrollments)),
      enrollments: createEnrollmentRouter(new EnrollmentController(enrollments)),
    },
    groups,
    enrollments,
  };
};

export default createCoursesModule;
