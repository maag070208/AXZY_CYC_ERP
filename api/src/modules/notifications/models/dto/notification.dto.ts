import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { CHANNELS, NOTIFICATION_STATUSES } from "../entity/notification-rules";

const variableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "INVALID_FORMAT").max(40);
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional();

// --- Plantillas ---------------------------------------------------------------

const templateFields = {
  clave: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,59}$/, "INVALID_FORMAT"),
  nombre: z.string().trim().min(1, "NOMBRE_REQUIRED").max(150),
  canal: z.enum(CHANNELS),
  asunto: optionalText(200),
  cuerpo: z.string().trim().min(1, "REQUIRED_FIELD").max(5000),
  variables: z.array(variableName).max(30).default([]),
  obligatorio: z.boolean().default(false),
};

const subjectRule = (v: { canal?: string; asunto?: string | null }) => v.canal !== "EMAIL" || !!v.asunto;

export const TemplateCreateDto = z
  .object(templateFields)
  .strict()
  .refine(subjectRule, { message: "REQUIRED_FIELD", path: ["asunto"] })
  .openapi("NotificationTemplateCreateInput");
registry.register("NotificationTemplateCreateInput", TemplateCreateDto);
export type TemplateCreateInput = z.infer<typeof TemplateCreateDto>;

export const TemplateUpdateDto = z
  .object({
    nombre: templateFields.nombre,
    asunto: templateFields.asunto,
    cuerpo: templateFields.cuerpo,
    variables: z.array(variableName).max(30),
    obligatorio: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("NotificationTemplateUpdateInput");
registry.register("NotificationTemplateUpdateInput", TemplateUpdateDto);
export type TemplateUpdateInput = z.infer<typeof TemplateUpdateDto>;

export const TemplateSchema = z
  .object({
    id: z.string(),
    clave: z.string(),
    nombre: z.string(),
    canal: z.enum(CHANNELS),
    asunto: z.string().nullable(),
    cuerpo: z.string(),
    variables: z.array(z.string()),
    obligatorio: z.boolean(),
    active: z.boolean(),
    enviadas: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("NotificationTemplate");
registry.register("NotificationTemplate", TemplateSchema);
export type TemplateView = z.infer<typeof TemplateSchema>;
export const TemplateTableResponseSchema = paginatedTableResponseSchema(TemplateSchema, "NotificationTemplateTableResponse");

// --- Envíos -------------------------------------------------------------------

const payloadSchema = z.record(z.string().max(40), z.union([z.string().max(1000), z.number()])).default({});

export const SendDto = z
  .object({
    canal: z.enum(CHANNELS),
    destinatario: z.string().trim().min(1, "REQUIRED_FIELD").max(200),
    templateClave: z.string().trim().max(60).optional(),
    asunto: optionalText(200),
    cuerpo: optionalText(5000),
    payload: payloadSchema,
  })
  .strict()
  .refine((v) => !!v.templateClave || !!v.cuerpo, { message: "REQUIRED_FIELD", path: ["cuerpo"] })
  .openapi("NotificationSendInput");
registry.register("NotificationSendInput", SendDto);
export type SendInput = z.infer<typeof SendDto>;

export const NotificationSchema = z
  .object({
    id: z.string(),
    canal: z.enum(CHANNELS),
    destinatario: z.string(),
    userId: z.string().nullable(),
    origen: z.string(),
    templateClave: z.string().nullable(),
    asunto: z.string().nullable(),
    cuerpo: z.string(),
    status: z.enum(NOTIFICATION_STATUSES),
    attempts: z.number().int(),
    maxAttempts: z.number().int(),
    nextRetryAt: z.string().nullable(),
    error: z.string().nullable(),
    dryRun: z.boolean(),
    readAt: z.string().nullable(),
    sentAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Notification");
registry.register("Notification", NotificationSchema);
export type NotificationView = z.infer<typeof NotificationSchema>;
export const NotificationTableResponseSchema = paginatedTableResponseSchema(NotificationSchema, "NotificationTableResponse");

export const MarkReadDto = z
  .object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() })
  .strict()
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, { message: "REQUIRED_FIELD" })
  .openapi("NotificationMarkReadInput");
registry.register("NotificationMarkReadInput", MarkReadDto);
export type MarkReadInput = z.infer<typeof MarkReadDto>;

// --- Preferencias (baja) ------------------------------------------------------

export const PreferenceDto = z
  .object({
    canal: z.enum(CHANNELS),
    destinatario: z.string().trim().min(1, "REQUIRED_FIELD").max(200),
    optOut: z.boolean(),
    motivo: optionalText(300),
  })
  .strict()
  .openapi("NotificationPreferenceInput");
registry.register("NotificationPreferenceInput", PreferenceDto);
export type PreferenceInput = z.infer<typeof PreferenceDto>;

export const PreferenceSchema = z
  .object({
    id: z.string(),
    canal: z.enum(CHANNELS),
    destinatario: z.string(),
    optOut: z.boolean(),
    motivo: z.string().nullable(),
    updatedAt: z.string(),
  })
  .openapi("NotificationPreference");
registry.register("NotificationPreference", PreferenceSchema);
export type PreferenceView = z.infer<typeof PreferenceSchema>;
export const PreferenceTableResponseSchema = paginatedTableResponseSchema(PreferenceSchema, "NotificationPreferenceTableResponse");
