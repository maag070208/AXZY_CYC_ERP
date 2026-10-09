import type { Prisma, PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { enforcePolicy } from "@core/policies";
import type { AuthenticatedUser } from "@core/utils/security";
import type { AuditLogger } from "@modules/audit";
import {
  SETTING_SCHEMAS,
  isSecretSetting,
  isSettingKey,
  type SettingKey,
  type SettingView,
} from "../models/dto/settings.dto";

const MASK = "••••";

const toView = (row: { key: string; value: Prisma.JsonValue; description: string | null; updatedAt: Date }): SettingView => ({
  key: row.key,
  value: row.value,
  description: row.description,
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Parámetros generales (M11). Fuente única: la tabla `settings`. Los demás
 * módulos leen con `get(key)`; solo `config.manage` escribe.
 */
export class SettingsService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger,
    /** Aviso tras escribir (p. ej. invalidar la cache del idioma del sistema). */
    private readonly onChange?: (keys: SettingKey[]) => void
  ) {}

  /** Parámetros conocidos (las filas sin esquema no se exponen). */
  async list(): Promise<SettingView[]> {
    const rows = await this.db.setting.findMany({ orderBy: { key: "asc" } });
    return rows.filter((row) => isSettingKey(row.key)).map(toView);
  }

  /** Valor de un parámetro, o `fallback` si falta la fila. */
  async get<T = unknown>(key: SettingKey, fallback?: T): Promise<T | undefined> {
    const row = await this.db.setting.findUnique({ where: { key } });
    return (row?.value as T | undefined) ?? fallback;
  }

  /**
   * Actualiza varios parámetros en una transacción. Clave desconocida → 400
   * `SETTING_UNKNOWN`; valor inválido → 400 `SETTING_INVALID` con el detalle de
   * zod. Audita `SYS_CONFIG_UPDATED` por cada clave que cambió.
   */
  async update(body: unknown, actor: AuthenticatedUser): Promise<SettingView[]> {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(400, "INVALID_BODY");
    }
    const entries = Object.entries(body as Record<string, unknown>);
    if (entries.length === 0) throw new HttpError(400, "SETTINGS_REQUIRED");

    const parsed: Array<[SettingKey, Prisma.InputJsonValue | null]> = [];
    for (const [key, value] of entries) {
      if (!isSettingKey(key)) throw new HttpError(400, "SETTING_UNKNOWN", { key });
      try {
        parsed.push([key, SETTING_SCHEMAS[key].parse(value) as Prisma.InputJsonValue | null]);
      } catch (error) {
        const details = error instanceof ZodError ? error.flatten() : undefined;
        throw new HttpError(400, "SETTING_INVALID", { key }, details);
      }
    }
    for (const [key] of parsed) enforcePolicy("settings.update", actor, { key });

    const changed: SettingKey[] = [];
    await this.db.$transaction(async (tx) => {
      const previous = await tx.setting.findMany({ where: { key: { in: parsed.map(([key]) => key) } } });
      const before = new Map(previous.map((row) => [row.key, row.value]));
      for (const [key, value] of parsed) {
        if (!before.has(key)) throw new HttpError(400, "SETTING_UNKNOWN", { key });
        const old = before.get(key) ?? null;
        if (JSON.stringify(old) === JSON.stringify(value)) continue;
        changed.push(key);
        await tx.setting.update({
          where: { key },
          data: { value: value === null ? (null as unknown as Prisma.InputJsonValue) : value },
        });
        const secret = isSecretSetting(key);
        await this.audit?.(
          {
            action: "SYS_CONFIG_UPDATED",
            entityType: "Setting",
            entityId: key,
            userId: actor.id,
            userName: actor.username,
            previousState: { value: secret ? MASK : old },
            newState: { value: secret ? MASK : value },
          },
          tx
        );
      }
    });

    if (changed.length > 0) this.onChange?.(changed);
    return this.list();
  }
}
