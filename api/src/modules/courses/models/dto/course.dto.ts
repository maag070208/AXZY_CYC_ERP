import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { isRealDay } from "@core/utils/day";
import { TIME_PATTERN, WEEK_DAYS, hasInternalOverlap, minutesOf } from "../entity/schedule";

const day = z.string().refine(isRealDay, "INVALID_DATE");
/** Texto opcional: `""` (o solo espacios) se guarda como `null`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const uuid = z.string().uuid();

// --- Cursos -------------------------------------------------------------------

const courseFields = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "REQUIRED_FIELD")
    .max(30)
    .regex(/^[A-Z0-9][A-Z0-9._-]*$/, "CLAVE_FORMAT"),
  name: z.string().trim().min(1, "NOMBRE_REQUIRED").max(150),
  levelId: uuid.nullable().optional(),
  description: optionalText(1000),
};

export const CourseCreateDto = z.object(courseFields).strict().openapi("CourseCreateInput");
registry.register("CourseCreateInput", CourseCreateDto);
export type CourseCreateInput = z.infer<typeof CourseCreateDto>;

export const CourseUpdateDto = z
  .object(courseFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("CourseUpdateInput");
registry.register("CourseUpdateInput", CourseUpdateDto);
export type CourseUpdateInput = z.infer<typeof CourseUpdateDto>;

export const CourseSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    levelId: z.string().nullable(),
    levelNombre: z.string().nullable(),
    description: z.string().nullable(),
    active: z.boolean(),
    groupsCount: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Course");
registry.register("Course", CourseSchema);
export type CourseView = z.infer<typeof CourseSchema>;
export const CourseTableResponseSchema = paginatedTableResponseSchema(CourseSchema, "CourseTableResponse");

// --- Grupos -------------------------------------------------------------------

export const ScheduleSlotSchema = z
  .object({
    dia: z.enum(WEEK_DAYS),
    horaInicio: z.string().regex(TIME_PATTERN, "INVALID_TIME"),
    horaFin: z.string().regex(TIME_PATTERN, "INVALID_TIME"),
  })
  .strict()
  .refine((s) => minutesOf(s.horaInicio) < minutesOf(s.horaFin), { message: "SCHEDULE_RANGE", path: ["horaFin"] })
  .openapi("ScheduleSlot");

const schedule = z
  .array(ScheduleSlotSchema)
  .min(1, "SCHEDULE_REQUIRED")
  .max(21)
  .refine((slots) => !hasInternalOverlap(slots), { message: "SCHEDULE_OVERLAP" });

const groupFields = {
  courseId: uuid,
  termId: uuid,
  teacherId: uuid.nullable().optional(),
  name: z.string().trim().min(1, "NOMBRE_REQUIRED").max(60),
  capacity: z.number().int().min(1).max(500),
  schedule: schedule,
  classroom: optionalText(60),
};

export const GroupCreateDto = z.object(groupFields).strict().openapi("GroupCreateInput");
registry.register("GroupCreateInput", GroupCreateDto);
export type GroupCreateInput = z.infer<typeof GroupCreateDto>;

/** Curso y ciclo no cambian: un grupo de otro curso es otro grupo. */
const { courseId: _c, termId: _t, ...editable } = groupFields;
export const GroupUpdateDto = z
  .object(editable)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("GroupUpdateInput");
registry.register("GroupUpdateInput", GroupUpdateDto);
export type GroupUpdateInput = z.infer<typeof GroupUpdateDto>;

export const GroupSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    courseId: z.string(),
    courseClave: z.string(),
    courseNombre: z.string(),
    termId: z.string(),
    termNombre: z.string(),
    termActivo: z.boolean(),
    teacherId: z.string().nullable(),
    teacherNombre: z.string().nullable(),
    capacity: z.number().int(),
    inscritos: z.number().int(),
    disponibles: z.number().int(),
    schedule: z.array(ScheduleSlotSchema),
    classroom: z.string().nullable(),
    active: z.boolean(),
    closedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Group");
registry.register("Group", GroupSchema);
export type GroupView = z.infer<typeof GroupSchema>;
export const GroupTableResponseSchema = paginatedTableResponseSchema(GroupSchema, "GroupTableResponse");

// --- Inscripciones ------------------------------------------------------------

export const EnrollDto = z
  .object({ studentId: uuid, date: day.optional() })
  .strict()
  .openapi("EnrollInput");
registry.register("EnrollInput", EnrollDto);
export type EnrollInput = z.infer<typeof EnrollDto>;

export const EnrollmentDropDto = z
  .object({ reason: z.string().trim().min(3, "REASON_MIN_LENGTH").max(500).optional() })
  .strict()
  .openapi("EnrollmentDropInput");
registry.register("EnrollmentDropInput", EnrollmentDropDto);

export const ChangeGroupDto = z.object({ toGroupId: uuid }).strict().openapi("ChangeGroupInput");
registry.register("ChangeGroupInput", ChangeGroupDto);

export const ENROLLMENT_STATUSES = ["ENROLLED", "WITHDRAWN", "PASSED", "FAILED"] as const;

export const EnrollmentSchema = z
  .object({
    id: z.string(),
    studentId: z.string(),
    studentNumber: z.string(),
    studentNombre: z.string(),
    studentStatus: z.enum(["ACTIVE", "WITHDRAWN"]),
    groupId: z.string(),
    groupNombre: z.string(),
    courseNombre: z.string(),
    termNombre: z.string(),
    date: z.string(),
    status: z.enum(ENROLLMENT_STATUSES),
    finalGrade: z.number().nullable(),
    withdrawnAt: z.string().nullable(),
    withdrawalReason: z.string().nullable(),
    transferredToId: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Enrollment");
registry.register("Enrollment", EnrollmentSchema);
export type EnrollmentView = z.infer<typeof EnrollmentSchema>;
export const EnrollmentTableResponseSchema = paginatedTableResponseSchema(
  EnrollmentSchema,
  "EnrollmentTableResponse"
);
