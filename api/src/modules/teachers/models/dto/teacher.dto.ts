import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";

const phone = z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, "INVALID_PHONE");
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullable().optional().or(z.literal("").transform(() => null));

const fields = {
  firstNames: z.string().trim().min(1, "REQUIRED_FIELD").max(100),
  surnames: z.string().trim().min(1, "REQUIRED_FIELD").max(150),
  email: z.string().trim().toLowerCase().email("INVALID_EMAIL").max(150),
  phone: optional(phone),
  specialty: optional(z.string().trim().max(120)),
};

export const TeacherCreateDto = z.object(fields).strict().openapi("TeacherCreateInput");
registry.register("TeacherCreateInput", TeacherCreateDto);
export type TeacherCreateInput = z.infer<typeof TeacherCreateDto>;

export const TeacherUpdateDto = z
  .object(fields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("TeacherUpdateInput");
registry.register("TeacherUpdateInput", TeacherUpdateDto);
export type TeacherUpdateInput = z.infer<typeof TeacherUpdateDto>;

export const TeacherDeactivateDto = z
  .object({ reason: z.string().trim().min(3, "REASON_MIN_LENGTH").max(500).optional() })
  .strict()
  .openapi("TeacherDeactivateInput");
registry.register("TeacherDeactivateInput", TeacherDeactivateDto);

export const TeacherSchema = z
  .object({
    id: z.string(),
    firstNames: z.string(),
    surnames: z.string(),
    nombreCompleto: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    specialty: z.string().nullable(),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    account: z
      .object({
        userId: z.string(),
        username: z.string(),
        active: z.boolean(),
        /** La persona aún no define su contraseña (invitación pendiente). */
        pendingInvitation: z.boolean(),
        lastLoginAt: z.string().nullable(),
      })
      .nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Teacher");
registry.register("Teacher", TeacherSchema);
export type TeacherView = z.infer<typeof TeacherSchema>;

export const TeacherCreatedSchema = TeacherSchema.extend({ invitationQueued: z.boolean() }).openapi("TeacherCreated");
registry.register("TeacherCreated", TeacherCreatedSchema);

export const TeacherTableResponseSchema = paginatedTableResponseSchema(TeacherSchema, "TeacherTableResponse");
