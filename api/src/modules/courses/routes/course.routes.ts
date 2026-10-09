import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  ChangeGroupDto,
  CourseCreateDto,
  CourseSchema,
  CourseTableResponseSchema,
  CourseUpdateDto,
  EnrollDto,
  EnrollmentDropDto,
  EnrollmentSchema,
  EnrollmentTableResponseSchema,
  GroupCreateDto,
  GroupSchema,
  GroupTableResponseSchema,
  GroupUpdateDto,
} from "../models/dto/course.dto";
import type { CourseController, EnrollmentController, GroupController } from "../controllers/course.controller";

const bearer = [{ bearerAuth: [] }];
const idParam = { in: "path" as const, name: "id", required: true, schema: { type: "string" as const } };
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });
type Extra = Omit<Parameters<typeof registerPath>[0], "method" | "path" | "summary" | "tags" | "security">;
const docFor =
  (tag: string) =>
  (method: "get" | "post" | "patch" | "delete", path: string, summary: string, extra: Extra) =>
    registerPath({ method, path, tags: [tag], summary, security: bearer, ...extra });

export const createCourseRouter = (controller: CourseController): Router => {
  const doc = docFor("Courses");
  doc("post", "/courses/query", "Tabla server-side de cursos (courses.view; AREA = cursos de sus grupos)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(CourseTableResponseSchema) } },
  });
  doc("get", "/courses/options", "Cursos activos para selectores (courses.view)", {
    responses: { 200: { description: "Lista" } },
  });
  doc("post", "/courses", "Alta de curso (courses.manage)", {
    request: { body: { required: true, content: json(CourseCreateDto) } },
    responses: { 201: { description: "Curso", content: json(CourseSchema) }, 409: { description: "COURSE_CODE_TAKEN" } },
  });
  doc("get", "/courses/{id}", "Detalle (courses.view)", {
    parameters: [idParam],
    responses: { 200: { description: "Curso", content: json(CourseSchema) } },
  });
  doc("patch", "/courses/{id}", "Edición (courses.manage)", {
    parameters: [idParam],
    request: { body: { required: true, content: json(CourseUpdateDto) } },
    responses: { 200: { description: "Curso", content: json(CourseSchema) } },
  });
  doc("delete", "/courses/{id}", "Baja lógica (courses.manage)", {
    parameters: [idParam],
    responses: { 200: { description: "Curso inactivo", content: json(CourseSchema) } },
  });
  doc("post", "/courses/{id}/reactivate", "Reactiva el curso (courses.manage)", {
    parameters: [idParam],
    responses: { 200: { description: "Curso activo", content: json(CourseSchema) } },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("courses.view"), asyncHandler(controller.table));
  router.get("/options", requiresPermission("courses.view"), asyncHandler(controller.options));
  router.post("/", requiresPermission("courses.manage"), asyncHandler(controller.create));
  router.get("/:id", requiresPermission("courses.view"), asyncHandler(controller.getById));
  router.patch("/:id", requiresPermission("courses.manage"), asyncHandler(controller.update));
  router.delete("/:id", requiresPermission("courses.manage"), asyncHandler(controller.deactivate));
  router.post("/:id/reactivate", requiresPermission("courses.manage"), asyncHandler(controller.reactivate));
  return router;
};

export const createGroupRouter = (controller: GroupController): Router => {
  const doc = docFor("Groups");
  doc("post", "/groups/query", "Tabla server-side de grupos (groups.view; AREA = sus grupos, OWN = donde está inscrito)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(GroupTableResponseSchema) } },
  });
  doc("get", "/groups/options", "Grupos abiertos para selectores (?termId=&courseId=)", {
    responses: { 200: { description: "Lista" } },
  });
  doc("post", "/groups", "Alta de grupo (groups.manage)", {
    request: { body: { required: true, content: json(GroupCreateDto) } },
    responses: { 201: { description: "Grupo", content: json(GroupSchema) }, 409: { description: "GROUP_NAME_TAKEN · COURSE_INACTIVE · TEACHER_INACTIVE" } },
  });
  doc("get", "/groups/{id}", "Detalle con cupo e inscritos (groups.view)", {
    parameters: [idParam],
    responses: { 200: { description: "Grupo", content: json(GroupSchema) } },
  });
  doc("patch", "/groups/{id}", "Edición: profesor, cupo, horario, aula (groups.manage)", {
    parameters: [idParam],
    request: { body: { required: true, content: json(GroupUpdateDto) } },
    responses: { 200: { description: "Grupo", content: json(GroupSchema) }, 409: { description: "CUPO_BELOW_ENROLLED · GROUP_CLOSED" } },
  });
  doc("delete", "/groups/{id}", "Baja lógica (sin inscritos) (groups.manage)", {
    parameters: [idParam],
    responses: { 200: { description: "Grupo inactivo", content: json(GroupSchema) }, 409: { description: "GROUP_HAS_ENROLLMENTS" } },
  });
  doc("post", "/groups/{id}/reactivate", "Reactiva el grupo (groups.manage)", {
    parameters: [idParam],
    responses: { 200: { description: "Grupo activo", content: json(GroupSchema) } },
  });
  doc("post", "/groups/{id}/enroll", "Inscribe un alumno (enrollments.create; transacción serializable)", {
    parameters: [idParam],
    request: { body: { required: true, content: json(EnrollDto) } },
    responses: {
      201: { description: "Inscripción", content: json(EnrollmentSchema) },
      409: { description: "GROUP_FULL · ALREADY_ENROLLED · SCHEDULE_CONFLICT · STUDENT_INACTIVE · CONCURRENT_UPDATE" },
    },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("groups.view"), asyncHandler(controller.table));
  router.get("/options", requiresPermission("groups.view"), asyncHandler(controller.options));
  router.post("/", requiresPermission("groups.manage"), asyncHandler(controller.create));
  router.get("/:id", requiresPermission("groups.view"), asyncHandler(controller.getById));
  router.patch("/:id", requiresPermission("groups.manage"), asyncHandler(controller.update));
  router.delete("/:id", requiresPermission("groups.manage"), asyncHandler(controller.deactivate));
  router.post("/:id/reactivate", requiresPermission("groups.manage"), asyncHandler(controller.reactivate));
  router.post("/:id/enroll", requiresPermission("enrollments.create"), asyncHandler(controller.enroll));
  return router;
};

export const createEnrollmentRouter = (controller: EnrollmentController): Router => {
  const doc = docFor("Enrollments");
  doc("post", "/enrollments/query", "Tabla server-side de inscripciones (filtros groupId, studentId, termId, status)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(EnrollmentTableResponseSchema) } },
  });
  doc("delete", "/enrollments/{id}", "Baja lógica de la inscripción (enrollments.delete)", {
    parameters: [idParam],
    request: { body: { required: false, content: json(EnrollmentDropDto) } },
    responses: { 200: { description: "Inscripción en BAJA", content: json(EnrollmentSchema) } },
  });
  doc("post", "/enrollments/{id}/change-group", "Cambio de grupo atómico (enrollments.edit)", {
    parameters: [idParam],
    request: { body: { required: true, content: json(ChangeGroupDto) } },
    responses: { 200: { description: "Nueva inscripción", content: json(EnrollmentSchema) } },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("enrollments.view"), asyncHandler(controller.table));
  router.delete("/:id", requiresPermission("enrollments.delete"), asyncHandler(controller.drop));
  router.post("/:id/change-group", requiresPermission("enrollments.edit"), asyncHandler(controller.changeGroup));
  return router;
};
