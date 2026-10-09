import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { CHANNELS, NOTIFICATION_STATUSES } from "../entity/notification-rules";

const variableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "INVALID_FORMAT").max(40);
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional();

// --- Plantillas ---------------------------------------------------------------

const templateFields = {
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,59}$/, "INVALID_FORMAT"),
  name: z.string().trim().min(1, "NAME_REQUIRED").max(150),
  channel: z.enum(CHANNELS),
  subject: optionalText(200),
  body: z.string().trim().min(1, "REQUIRED_FIELD").max(5000),
  variables: z.array(variableName).max(30).default([]),
  required: z.boolean().default(false),
};

const subjectRule = (v: { channel?: string; subject?: string | null }) => v.channel !== "EMAIL" || !!v.subject;

export const TemplateCreateDto = z
  .object(templateFields)
  .strict()
  .refine(subjectRule, { message: "REQUIRED_FIELD", path: ["subject"] })
  .openapi("NotificationTemplateCreateInput");
registry.register("NotificationTemplateCreateInput", TemplateCreateDto);
export type TemplateCreateInput = z.infer<typeof TemplateCreateDto>;

export const TemplateUpdateDto = z
  .object({
    name: templateFields.name,
    subject: templateFields.subject,
    body: templateFields.body,
    variables: z.array(variableName).max(30),
    required: z.boolean(),
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
    code: z.string(),
    name: z.string(),
    channel: z.enum(CHANNELS),
    subject: z.string().nullable(),
    body: z.string(),
    variables: z.array(z.string()),
    required: z.boolean(),
    active: z.boolean(),
    sentCount: z.number().int(),
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
    channel: z.enum(CHANNELS),
    recipient: z.string().trim().min(1, "REQUIRED_FIELD").max(200),
    templateCode: z.string().trim().max(60).optional(),
    subject: optionalText(200),
    body: optionalText(5000),
    payload: payloadSchema,
  })
  .strict()
  .refine((v) => !!v.templateCode || !!v.body, { message: "REQUIRED_FIELD", path: ["body"] })
  .openapi("NotificationSendInput");
registry.register("NotificationSendInput", SendDto);
export type SendInput = z.infer<typeof SendDto>;

export const NotificationSchema = z
  .object({
    id: z.string(),
    channel: z.enum(CHANNELS),
    recipient: z.string(),
    userId: z.string().nullable(),
    origin: z.string(),
    templateCode: z.string().nullable(),
    subject: z.string().nullable(),
    body: z.string(),
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
    channel: z.enum(CHANNELS),
    recipient: z.string().trim().min(1, "REQUIRED_FIELD").max(200),
    optOut: z.boolean(),
    reason: optionalText(300),
  })
  .strict()
  .openapi("NotificationPreferenceInput");
registry.register("NotificationPreferenceInput", PreferenceDto);
export type PreferenceInput = z.infer<typeof PreferenceDto>;

export const PreferenceSchema = z
  .object({
    id: z.string(),
    channel: z.enum(CHANNELS),
    recipient: z.string(),
    optOut: z.boolean(),
    reason: z.string().nullable(),
    updatedAt: z.string(),
  })
  .openapi("NotificationPreference");
registry.register("NotificationPreference", PreferenceSchema);
export type PreferenceView = z.infer<typeof PreferenceSchema>;
export const PreferenceTableResponseSchema = paginatedTableResponseSchema(PreferenceSchema, "NotificationPreferenceTableResponse");
