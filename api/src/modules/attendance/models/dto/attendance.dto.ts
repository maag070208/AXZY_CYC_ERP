import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { isRealDay } from "@core/utils/day";
import { ATTENDANCE_STATUSES, JUSTIFICATION_STATUSES } from "../entity/attendance-rules";

const day = z.string().refine(isRealDay, "INVALID_DATE");
const hour = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "INVALID_FORMAT");
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional();

export const SessionCreateDto = z
  .object({ fecha: day, hora: hour.nullable().optional(), tema: optionalText(200) })
  .strict()
  .openapi("AttendanceSessionCreateInput");
registry.register("AttendanceSessionCreateInput", SessionCreateDto);
export type SessionCreateInput = z.infer<typeof SessionCreateDto>;

export const RollCallDto = z
  .object({
    items: z
      .array(z.object({ enrollmentId: z.string().uuid(), status: z.enum(ATTENDANCE_STATUSES) }).strict())
      .min(1, "REQUIRED_FIELD")
      .max(500)
      .refine((rows) => new Set(rows.map((r) => r.enrollmentId)).size === rows.length, { message: "DUPLICATE_RECORD" }),
  })
  .strict()
  .openapi("RollCallInput");
registry.register("RollCallInput", RollCallDto);
export type RollCallInput = z.infer<typeof RollCallDto>;

export const AnnulDto = z
  .object({ motivo: z.string().trim().min(3, "REASON_MIN_LENGTH").max(300) })
  .strict()
  .openapi("AttendanceSessionAnnulInput");
registry.register("AttendanceSessionAnnulInput", AnnulDto);

export const JustificationFieldsDto = z
  .object({ attendanceId: z.string().uuid(), motivo: z.string().trim().min(5, "REASON_MIN_LENGTH").max(1000) })
  .strict();
export type JustificationFields = z.infer<typeof JustificationFieldsDto>;

export const ResolveDto = z
  .object({ status: z.enum(["APROBADA", "RECHAZADA"]), nota: optionalText(500) })
  .strict()
  .openapi("JustificationResolveInput");
registry.register("JustificationResolveInput", ResolveDto);
export type ResolveInput = z.infer<typeof ResolveDto>;

// --- vistas -------------------------------------------------------------------

export const SessionSchema = z
  .object({
    id: z.string(),
    groupId: z.string(),
    fecha: z.string(),
    hora: z.string().nullable(),
    tema: z.string().nullable(),
    registrados: z.number().int(),
    faltas: z.number().int(),
    annulled: z.boolean(),
    deleteReason: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("AttendanceSession");
registry.register("AttendanceSession", SessionSchema);
export type SessionView = z.infer<typeof SessionSchema>;

export const RollRowSchema = z.object({
  enrollmentId: z.string(),
  studentId: z.string(),
  matricula: z.string(),
  nombre: z.string(),
  attendanceId: z.string().nullable(),
  status: z.enum(ATTENDANCE_STATUSES).nullable(),
  justification: z.enum(JUSTIFICATION_STATUSES).nullable(),
  /** Con justificante pendiente o aprobado el pase no lo modifica. */
  locked: z.boolean(),
});

export const SessionRollSchema = SessionSchema.extend({
  group: z.object({ id: z.string(), nombre: z.string(), courseNombre: z.string(), termNombre: z.string(), closed: z.boolean() }),
  rows: z.array(RollRowSchema),
}).openapi("AttendanceSessionRoll");
registry.register("AttendanceSessionRoll", SessionRollSchema);
export type SessionRollView = z.infer<typeof SessionRollSchema>;

export const SummaryRowSchema = z.object({
  enrollmentId: z.string(),
  studentId: z.string(),
  matricula: z.string(),
  nombre: z.string(),
  sesiones: z.number().int(),
  presentes: z.number().int(),
  retardos: z.number().int(),
  faltas: z.number().int(),
  justificadas: z.number().int(),
  porcentaje: z.number().nullable(),
  alerta: z.boolean(),
});
export type SummaryRow = z.infer<typeof SummaryRowSchema>;

export const GroupSummarySchema = z
  .object({ groupId: z.string(), threshold: z.number(), sesiones: z.number().int(), promedio: z.number().nullable(), enAlerta: z.number().int(), rows: z.array(SummaryRowSchema) })
  .openapi("GroupAttendanceSummary");
registry.register("GroupAttendanceSummary", GroupSummarySchema);
export type GroupSummaryView = z.infer<typeof GroupSummarySchema>;

export const StudentAttendanceSchema = z
  .object({
    studentId: z.string(),
    threshold: z.number(),
    groups: z.array(
      SummaryRowSchema.omit({ studentId: true, matricula: true, nombre: true }).extend({
        groupId: z.string(),
        grupo: z.string(),
        curso: z.string(),
        ciclo: z.string(),
        records: z.array(
          z.object({
            attendanceId: z.string(),
            sessionId: z.string(),
            fecha: z.string(),
            hora: z.string().nullable(),
            status: z.enum(ATTENDANCE_STATUSES),
            justification: z.object({ id: z.string(), status: z.enum(JUSTIFICATION_STATUSES), nota: z.string().nullable() }).nullable(),
          })
        ),
      })
    ),
  })
  .openapi("StudentAttendance");
registry.register("StudentAttendance", StudentAttendanceSchema);
export type StudentAttendanceView = z.infer<typeof StudentAttendanceSchema>;

export const JustificationSchema = z
  .object({
    id: z.string(),
    attendanceId: z.string(),
    status: z.enum(JUSTIFICATION_STATUSES),
    motivo: z.string(),
    nota: z.string().nullable(),
    hasFile: z.boolean(),
    archivoNombre: z.string().nullable(),
    fecha: z.string(),
    hora: z.string().nullable(),
    groupId: z.string(),
    grupo: z.string(),
    curso: z.string(),
    studentId: z.string(),
    matricula: z.string(),
    nombre: z.string(),
    resolvedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Justification");
registry.register("Justification", JustificationSchema);
export type JustificationView = z.infer<typeof JustificationSchema>;
export const JustificationTableResponseSchema = paginatedTableResponseSchema(JustificationSchema, "JustificationTableResponse");
