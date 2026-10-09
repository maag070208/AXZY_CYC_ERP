import { z, registry } from "@core/swagger/registry";

/**
 * Parámetros generales conocidos. La migración siembra cada `key`; el cliente
 * solo actualiza `value`, que se valida con el esquema de su clave. Agregar un
 * parámetro = migración que inserta la fila + entrada aquí.
 */
export const SETTING_SCHEMAS = {
  SCHOOL_NAME: z.string().trim().min(1, "NAME_REQUIRED").max(150),
  SCHOOL_ADDRESS: z.string().max(300),
  SCHOOL_PHONE: z.string().max(30),
  SCHOOL_EMAIL: z.union([z.literal(""), z.string().email("INVALID_EMAIL").max(150)]),
  SCHOOL_LOGO_PATH: z.string().max(500).nullable(),
  MIN_PASSING_GRADE: z.number().min(0).max(100),
  ATTENDANCE_THRESHOLD: z.number().min(0).max(100),
  LATE_FEE: z
    .object({
      enabled: z.boolean(),
      dailyRate: z.number().min(0).max(1),
      graceDays: z.number().int().min(0).max(90),
    })
    .strict(),
  LANGUAGE: z.enum(["es", "en"]),
  /** Marca de tiempo (ISO) del último respaldo; la migración real la exige reciente. */
  MIGRATION_LAST_BACKUP_AT: z.union([z.literal(""), z.string().datetime({ offset: true })]),
  /** Día del mes (1..28) para el vencimiento de cargos del plan de pagos (M22). */
  PAYMENT_DUE_DAY: z.number().int().min(1).max(28),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];

export const isSettingKey = (key: string): key is SettingKey =>
  Object.prototype.hasOwnProperty.call(SETTING_SCHEMAS, key);

/** Claves cuyo valor nunca se escribe en claro en la bitácora. */
export const isSecretSetting = (key: string): boolean => /(_SECRET|_PASSWORD|_TOKEN|_API_KEY)$/.test(key);

export const SettingSchema = z
  .object({
    key: z.string(),
    value: z.unknown(),
    description: z.string().nullable(),
    updatedAt: z.string(),
  })
  .openapi("Setting");
registry.register("Setting", SettingSchema);
export type SettingView = z.infer<typeof SettingSchema>;

/** `PUT /settings`: mapa `{ KEY: value }` (al menos uno). */
export const SettingsUpdateSchema = z
  .record(z.string(), z.unknown())
  .openapi("SettingsUpdateInput", {
    example: { MIN_PASSING_GRADE: 70, LANGUAGE: "es" },
  });
registry.register("SettingsUpdateInput", SettingsUpdateSchema);
