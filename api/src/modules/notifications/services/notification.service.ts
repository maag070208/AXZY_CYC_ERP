import { Prisma, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import { once } from "@core/db/idempotency";
import { broadcastToUser } from "@core/services/ably";
import type { AuthenticatedUser } from "@core/utils/security";
import { logger } from "@core/utils/logger";
import {
  filterBool,
  filterDateRange,
  filterEnum,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
} from "@core/utils/table";
import type { NotifyInput, Notifier } from "@core/ports/notification.port";
import type { AuditLogger } from "@modules/audit";
import {
  CHANNELS,
  NOTIFICATION_STATUSES,
  afterFailure,
  internalRecipient,
  missingVariables,
  normalizeRecipient,
  render,
  requiredVariables,
  type Channel,
} from "../models/entity/notification-rules";
import type {
  MarkReadInput,
  NotificationView,
  PreferenceInput,
  PreferenceView,
  SendInput,
  TemplateCreateInput,
  TemplateUpdateInput,
  TemplateView,
} from "../models/dto/notification.dto";
import { providerFor } from "../providers/provider";

type Client = PrismaClient | Prisma.TransactionClient;
type TemplateRow = Prisma.NotificationTemplateGetPayload<{ include: { _count: { select: { notifications: true } } } }>;
type NotificationRow = Prisma.NotificationGetPayload<{ include: { template: { select: { clave: true } } } }>;

const SYSTEM = { userId: null, userName: "sistema" };
const WORKER_LOCK_MS = 2 * 60_000;

const declared = (value: Prisma.JsonValue): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

const toTemplateView = (row: TemplateRow): TemplateView => ({
  id: row.id,
  clave: row.clave,
  nombre: row.nombre,
  canal: row.canal,
  asunto: row.asunto,
  cuerpo: row.cuerpo,
  variables: declared(row.variables),
  obligatorio: row.obligatorio,
  active: row.active,
  enviadas: row._count.notifications,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toNotificationView = (row: NotificationRow): NotificationView => ({
  id: row.id,
  canal: row.canal,
  destinatario: row.destinatario,
  userId: row.userId,
  origen: row.origen,
  templateClave: row.template?.clave ?? null,
  asunto: row.asunto,
  cuerpo: row.cuerpo,
  status: row.status,
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  nextRetryAt: row.status === "EN_COLA" ? row.nextRetryAt.toISOString() : null,
  error: row.error,
  dryRun: row.dryRun,
  readAt: row.readAt?.toISOString() ?? null,
  sentAt: row.sentAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const withTemplate = { template: { select: { clave: true } } } as const;
const templateCount = { _count: { select: { notifications: true } } } as const;

interface EnqueueArgs {
  canal: Channel;
  destinatario: string;
  userId?: string | null;
  templateId?: string | null;
  obligatorio?: boolean;
  asunto: string | null;
  cuerpo: string;
  payload: Record<string, string | number>;
  origen: string;
  idempotencyKey?: string | null;
  createdBy?: string | null;
}

/**
 * M19: plantillas, outbox con reintentos, preferencias (baja) y bandeja
 * interna. El envío real lo hace el worker (`drain`); la API solo encola.
 */
export class NotificationService {
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  // --- plantillas ---------------------------------------------------------------

  async templateTable(params: ITDataTableFetchParams): Promise<ITDataTableResponse<TemplateView>> {
    const { filters } = params;
    const and: Prisma.NotificationTemplateWhereInput[] = [];
    const canal = filterEnum(filters, "canal", CHANNELS);
    if (canal) and.push({ canal });
    const active = filterBool(filters, "active");
    if (active !== undefined) and.push({ active });
    const clave = filterText(filters, "clave");
    if (clave) and.push({ clave });
    const nombre = filterText(filters, "nombre");
    if (nombre) and.push({ nombre });
    const result = await paginatedQuery<TemplateRow>({
      model: this.db.notificationTemplate,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy: orderByOf(params.sort, { clave: "clave", nombre: "nombre", canal: "canal", updatedAt: "updatedAt" }, [{ clave: "asc" }, { canal: "asc" }]),
      include: templateCount,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toTemplateView), total: result.total };
  }

  private async loadTemplate(id: string): Promise<TemplateRow> {
    const row = await this.db.notificationTemplate.findUnique({ where: { id }, include: templateCount });
    if (!row) throw new HttpError(404, "TEMPLATE_NOT_FOUND");
    return row;
  }

  async getTemplate(id: string): Promise<TemplateView> {
    return toTemplateView(await this.loadTemplate(id));
  }

  async createTemplate(input: TemplateCreateInput, actor: AuthenticatedUser): Promise<TemplateView> {
    const exists = await this.db.notificationTemplate.findUnique({ where: { clave_canal: { clave: input.clave, canal: input.canal } } });
    if (exists) throw new HttpError(409, "TEMPLATE_DUPLICATE");
    return this.db.$transaction(async (tx) => {
      const row = await tx.notificationTemplate.create({
        data: {
          clave: input.clave,
          nombre: input.nombre,
          canal: input.canal,
          asunto: input.asunto ?? null,
          cuerpo: input.cuerpo,
          variables: requiredVariables(input.variables, input.asunto, input.cuerpo),
          obligatorio: input.obligatorio,
        },
        include: templateCount,
      });
      const view = toTemplateView(row);
      await this.audit?.(
        { action: "NOTIFICATION_TEMPLATE_CREATED", entityType: "NotificationTemplate", entityId: row.id, userId: actor.id, userName: actor.username,
          newState: { clave: view.clave, canal: view.canal, asunto: view.asunto, cuerpo: view.cuerpo, variables: view.variables, obligatorio: view.obligatorio } },
        tx
      );
      return view;
    });
  }

  async updateTemplate(id: string, input: TemplateUpdateInput, actor: AuthenticatedUser): Promise<TemplateView> {
    const previous = await this.loadTemplate(id);
    const asunto = input.asunto !== undefined ? input.asunto : previous.asunto;
    if (previous.canal === "EMAIL" && !asunto) throw new HttpError(400, "VALIDATION_ERROR", {}, { asunto: ["REQUIRED_FIELD"] });
    const cuerpo = input.cuerpo ?? previous.cuerpo;
    const variables = requiredVariables(input.variables ?? declared(previous.variables), asunto, cuerpo);
    return this.db.$transaction(async (tx) => {
      const row = await tx.notificationTemplate.update({
        where: { id },
        data: {
          ...(input.nombre !== undefined && { nombre: input.nombre }),
          ...(input.obligatorio !== undefined && { obligatorio: input.obligatorio }),
          asunto,
          cuerpo,
          variables,
        },
        include: templateCount,
      });
      const before = toTemplateView(previous);
      const after = toTemplateView(row);
      await this.audit?.(
        { action: "NOTIFICATION_TEMPLATE_UPDATED", entityType: "NotificationTemplate", entityId: id, userId: actor.id, userName: actor.username,
          previousState: { nombre: before.nombre, asunto: before.asunto, cuerpo: before.cuerpo, variables: before.variables, obligatorio: before.obligatorio },
          newState: { nombre: after.nombre, asunto: after.asunto, cuerpo: after.cuerpo, variables: after.variables, obligatorio: after.obligatorio } },
        tx
      );
      return after;
    });
  }

  async setTemplateActive(id: string, active: boolean, actor: AuthenticatedUser): Promise<TemplateView> {
    const previous = await this.loadTemplate(id);
    if (!active && !previous.active) throw new HttpError(409, "TEMPLATE_ALREADY_INACTIVE");
    if (active && previous.active) return toTemplateView(previous);
    return this.db.$transaction(async (tx) => {
      const row = await tx.notificationTemplate.update({ where: { id }, data: { active }, include: templateCount });
      await this.audit?.(
        { action: active ? "NOTIFICATION_TEMPLATE_REACTIVATED" : "NOTIFICATION_TEMPLATE_DEACTIVATED", entityType: "NotificationTemplate", entityId: id,
          userId: actor.id, userName: actor.username, previousState: { active: !active }, newState: { active } },
        tx
      );
      return toTemplateView(row);
    });
  }

  // --- encolado -----------------------------------------------------------------

  /** Persiste un aviso en el outbox (o lo marca OMITIDO por baja; INTERNO se entrega al instante). */
  private async enqueue(client: Client, args: EnqueueArgs): Promise<NotificationRow> {
    if (args.idempotencyKey) {
      const prior = await client.notification.findUnique({ where: { idempotencyKey: args.idempotencyKey }, include: withTemplate });
      if (prior) return prior;
    }
    const optedOut =
      !args.obligatorio &&
      !!(await client.notificationPreference.findUnique({
        where: { destinatario_canal: { destinatario: args.destinatario, canal: args.canal } },
        select: { optOut: true },
      }))?.optOut;
    const now = new Date();
    const internal = args.canal === "INTERNO";
    const row = await client.notification.create({
      data: {
        canal: args.canal,
        destinatario: args.destinatario,
        userId: args.userId ?? null,
        templateId: args.templateId ?? null,
        origen: args.origen,
        payload: args.payload,
        asunto: args.asunto,
        cuerpo: args.cuerpo,
        idempotencyKey: args.idempotencyKey ?? null,
        createdBy: args.createdBy ?? null,
        ...(optedOut
          ? { status: "OMITIDO" as const, error: "OPT_OUT" }
          : internal
            ? { status: "ENVIADO" as const, sentAt: now, providerMessageId: "in-app" }
            : {}),
      },
      include: withTemplate,
    });
    if (internal && !optedOut && row.userId) this.publish(row);
    return row;
  }

  /** Aviso en tiempo real al dueño de la notificación (no-op sin Ably). */
  private publish(row: NotificationRow): void {
    if (!row.userId) return;
    broadcastToUser(row.userId, { id: row.id, canal: row.canal, status: row.status, asunto: row.asunto, origen: row.origen }).catch((error) =>
      logger.warn(`[notifications] ably: ${String(error)}`)
    );
  }

  /**
   * Puerto para los demás módulos (M19 §4.6): una notificación por plantilla
   * activa de la `clave` y destinatario válido para su canal. Plantillas o
   * variables faltantes no rompen la operación del disparador (se registran).
   */
  notify: Notifier = async (input: NotifyInput, tx?: Prisma.TransactionClient): Promise<number> => {
    const client = tx ?? this.db;
    const templates = await client.notificationTemplate.findMany({ where: { clave: input.clave, active: true } });
    let count = 0;
    for (const template of templates) {
      const missing = missingVariables(declared(template.variables), input.payload);
      if (missing.length) {
        logger.warn(`[notifications] ${template.clave}/${template.canal}: faltan variables ${missing.join(", ")}`);
        continue;
      }
      const seen = new Set<string>();
      for (const recipient of input.recipients) {
        const raw =
          template.canal === "EMAIL" ? recipient.email
          : template.canal === "INTERNO" ? (recipient.userId ? internalRecipient(recipient.userId) : null)
          : recipient.phone;
        const destinatario = normalizeRecipient(template.canal, raw);
        if (!destinatario || seen.has(destinatario)) continue;
        seen.add(destinatario);
        await this.enqueue(client, {
          canal: template.canal,
          destinatario,
          userId: recipient.userId ?? null,
          templateId: template.id,
          obligatorio: template.obligatorio,
          asunto: template.asunto ? render(template.asunto, input.payload) : null,
          cuerpo: render(template.cuerpo, input.payload),
          payload: input.payload,
          origen: input.clave,
          idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:${template.canal}:${destinatario}`.slice(0, 200) : null,
        });
        count++;
      }
    }
    return count;
  };

  /** Envío manual o de prueba desde la consola (M19 §5), idempotente con `Idempotency-Key`. */
  async send(input: SendInput, key: string | undefined, actor: AuthenticatedUser): Promise<NotificationView> {
    let userId: string | null = null;
    let raw = input.destinatario;
    if (input.canal === "INTERNO") {
      const user = await this.db.user.findFirst({ where: { username: input.destinatario.toLowerCase() }, select: { id: true } });
      if (!user) throw new HttpError(400, "NOTIFICATION_RECIPIENT_INVALID", { canal: input.canal });
      userId = user.id;
      raw = internalRecipient(user.id);
    }
    const destinatario = normalizeRecipient(input.canal, raw);
    if (!destinatario) throw new HttpError(400, "NOTIFICATION_RECIPIENT_INVALID", { canal: input.canal });

    let template: Prisma.NotificationTemplateGetPayload<object> | null = null;
    if (input.templateClave) {
      template = await this.db.notificationTemplate.findUnique({ where: { clave_canal: { clave: input.templateClave, canal: input.canal } } });
      if (!template) throw new HttpError(404, "TEMPLATE_NOT_FOUND");
      if (!template.active) throw new HttpError(409, "TEMPLATE_INACTIVE");
    }
    const asuntoText = template ? template.asunto : (input.asunto ?? null);
    const cuerpoText = template ? template.cuerpo : (input.cuerpo as string);
    if (input.canal === "EMAIL" && !asuntoText) throw new HttpError(400, "VALIDATION_ERROR", {}, { asunto: ["REQUIRED_FIELD"] });
    const missing = missingVariables(requiredVariables(template ? declared(template.variables) : [], asuntoText, cuerpoText), input.payload);
    if (missing.length) throw new HttpError(400, "NOTIFICATION_VARIABLES_MISSING", { variables: missing.join(", ") }, { variables: missing });

    const { result } = await this.db.$transaction(async (tx) =>
      once(tx, key, { userId: actor.id, scope: "notifications.send" }, async () => {
        const row = await this.enqueue(tx, {
          canal: input.canal,
          destinatario,
          userId,
          templateId: template?.id ?? null,
          obligatorio: template?.obligatorio ?? false,
          asunto: asuntoText ? render(asuntoText, input.payload) : null,
          cuerpo: render(cuerpoText, input.payload),
          payload: input.payload,
          origen: "MANUAL",
          createdBy: actor.id,
        });
        await this.audit?.(
          { action: "NOTIFICATION_QUEUED", entityType: "Notification", entityId: row.id, userId: actor.id, userName: actor.username,
            newState: { canal: row.canal, destinatario: row.destinatario, templateClave: template?.clave ?? null, status: row.status } },
          tx
        );
        return toNotificationView(row);
      })
    );
    return result;
  }

  async retry(id: string, actor: AuthenticatedUser): Promise<NotificationView> {
    const row = await this.db.notification.findUnique({ where: { id }, include: withTemplate });
    if (!row) throw new HttpError(404, "NOTIFICATION_NOT_FOUND");
    if (row.status !== "FALLIDO" && row.status !== "OMITIDO") throw new HttpError(409, "NOTIFICATION_NOT_RETRYABLE");
    return this.db.$transaction(async (tx) => {
      const updated = await tx.notification.update({
        where: { id },
        data: { status: "EN_COLA", attempts: 0, nextRetryAt: new Date(), lockedUntil: null, error: null },
        include: withTemplate,
      });
      await this.audit?.(
        { action: "NOTIFICATION_RETRIED", entityType: "Notification", entityId: id, userId: actor.id, userName: actor.username,
          previousState: { status: row.status, attempts: row.attempts, error: row.error }, newState: { status: "EN_COLA" } },
        tx
      );
      return toNotificationView(updated);
    });
  }

  async table(params: ITDataTableFetchParams): Promise<ITDataTableResponse<NotificationView>> {
    const { filters } = params;
    const and: Prisma.NotificationWhereInput[] = [];
    const canal = filterEnum(filters, "canal", CHANNELS);
    if (canal) and.push({ canal });
    const status = filterEnum(filters, "status", NOTIFICATION_STATUSES);
    if (status) and.push({ status });
    const destinatario = filterText(filters, "destinatario");
    if (destinatario) and.push({ destinatario });
    const origen = filterText(filters, "origen");
    if (origen) and.push({ origen });
    const createdAt = filterDateRange(filters, "createdAt");
    if (createdAt) and.push({ createdAt });
    const result = await paginatedQuery<NotificationRow>({
      model: this.db.notification,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy: orderByOf(params.sort, { createdAt: "createdAt", sentAt: "sentAt", status: "status", canal: "canal", destinatario: "destinatario" }, [{ createdAt: "desc" }]),
      include: withTemplate,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toNotificationView), total: result.total };
  }

  // --- bandeja interna (campana) ------------------------------------------------

  async mine(userId: string, limit = 30): Promise<{ unread: number; data: NotificationView[] }> {
    const where: Prisma.NotificationWhereInput = { userId, canal: "INTERNO", status: "ENVIADO" };
    const [unread, rows] = await Promise.all([
      this.db.notification.count({ where: { ...where, readAt: null } }),
      this.db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 100), include: withTemplate }),
    ]);
    return { unread, data: rows.map(toNotificationView) };
  }

  async markRead(userId: string, input: MarkReadInput): Promise<{ updated: number }> {
    const { count } = await this.db.notification.updateMany({
      where: { userId, canal: "INTERNO", readAt: null, ...(input.all ? {} : { id: { in: input.ids ?? [] } }) },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  // --- worker (outbox) ----------------------------------------------------------

  /**
   * Reclama hasta `limit` avisos vencidos (`FOR UPDATE SKIP LOCKED`: varias
   * instancias no envían lo mismo), los entrega por su proveedor y aplica el
   * backoff exponencial en cada fallo hasta `maxAttempts` (M19 §4.2).
   */
  async drain(limit = 25): Promise<{ processed: number; sent: number; retrying: number; failed: number }> {
    const summary = { processed: 0, sent: 0, retrying: 0, failed: 0 };
    if (this.draining) return summary;
    this.draining = true;
    try {
      const lockUntil = new Date(Date.now() + WORKER_LOCK_MS);
      const claimed = await this.db.$queryRaw<Array<{ id: string }>>`
        UPDATE "notifications" SET "locked_until" = ${lockUntil}, "attempts" = "attempts" + 1, "updated_at" = now()
        WHERE "id" IN (
          SELECT "id" FROM "notifications"
          WHERE "status" = 'EN_COLA' AND "next_retry_at" <= now() AND ("locked_until" IS NULL OR "locked_until" < now())
          ORDER BY "next_retry_at" LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id"`;
      for (const { id } of claimed) {
        summary.processed++;
        const outcome = await this.deliver(id);
        summary[outcome]++;
      }
      return summary;
    } finally {
      this.draining = false;
    }
  }

  private async deliver(id: string): Promise<"sent" | "retrying" | "failed"> {
    const row = await this.db.notification.findUniqueOrThrow({ where: { id }, include: withTemplate });
    const provider = providerFor(row.canal);
    try {
      if (!provider) throw new Error("NO_PROVIDER");
      const result = await provider.send({ id: row.id, canal: row.canal, destinatario: row.destinatario, asunto: row.asunto, cuerpo: row.cuerpo });
      const updated = await this.db.notification.update({
        where: { id },
        data: { status: "ENVIADO", sentAt: new Date(), providerMessageId: result.messageId, dryRun: result.dryRun, lockedUntil: null, error: null },
        include: withTemplate,
      });
      this.publish(updated);
      return "sent";
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const next = afterFailure(row.attempts, row.maxAttempts, new Date(), Math.random());
      const updated = await this.db.notification.update({
        where: { id },
        data: { ...next, lockedUntil: null, error: message },
        include: withTemplate,
      });
      if (next.status === "FALLIDO") {
        await this.audit?.({
          action: "NOTIFICATION_FAILED", entityType: "Notification", entityId: id, ...SYSTEM,
          newState: { canal: row.canal, destinatario: row.destinatario, attempts: row.attempts, error: message },
        });
        this.publish(updated);
        return "failed";
      }
      return "retrying";
    }
  }

  /** Drenado periódico (no corre en pruebas; ahí se llama `POST /notifications/drain`). */
  startWorker(intervalMs = 15_000, jobs: Array<() => Promise<unknown>> = []): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      for (const job of jobs) job().catch((error) => logger.error(`[notifications] job: ${String(error)}`));
      this.drain().catch((error) => logger.error(`[notifications] drain: ${String(error)}`));
    }, intervalMs);
    this.timer.unref();
  }

  // --- preferencias (baja) ------------------------------------------------------

  async preferenceTable(params: ITDataTableFetchParams): Promise<ITDataTableResponse<PreferenceView>> {
    const { filters } = params;
    const and: Prisma.NotificationPreferenceWhereInput[] = [];
    const canal = filterEnum(filters, "canal", CHANNELS);
    if (canal) and.push({ canal });
    const destinatario = filterText(filters, "destinatario");
    if (destinatario) and.push({ destinatario });
    const optOut = filterBool(filters, "optOut");
    if (optOut !== undefined) and.push({ optOut });
    const result = await paginatedQuery<Prisma.NotificationPreferenceGetPayload<object>>({
      model: this.db.notificationPreference,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy: orderByOf(params.sort, { destinatario: "destinatario", canal: "canal", updatedAt: "updatedAt" }, [{ updatedAt: "desc" }]),
      page: params.page,
      limit: params.limit,
    });
    return {
      data: result.data.map((r) => ({ id: r.id, canal: r.canal, destinatario: r.destinatario, optOut: r.optOut, motivo: r.motivo, updatedAt: r.updatedAt.toISOString() })),
      total: result.total,
    };
  }

  async setPreference(input: PreferenceInput, actor: AuthenticatedUser): Promise<PreferenceView> {
    let raw = input.destinatario;
    if (input.canal === "INTERNO" && !raw.startsWith("user:")) {
      const user = await this.db.user.findFirst({ where: { username: raw.toLowerCase() }, select: { id: true } });
      if (user) raw = internalRecipient(user.id);
    }
    const destinatario = normalizeRecipient(input.canal, raw);
    if (!destinatario) throw new HttpError(400, "NOTIFICATION_RECIPIENT_INVALID", { canal: input.canal });
    return this.db.$transaction(async (tx) => {
      const previous = await tx.notificationPreference.findUnique({ where: { destinatario_canal: { destinatario, canal: input.canal } } });
      const row = await tx.notificationPreference.upsert({
        where: { destinatario_canal: { destinatario, canal: input.canal } },
        create: { destinatario, canal: input.canal, optOut: input.optOut, motivo: input.motivo ?? null, updatedBy: actor.id },
        update: { optOut: input.optOut, motivo: input.motivo ?? null, updatedBy: actor.id },
      });
      await this.audit?.(
        { action: input.optOut ? "NOTIFICATION_OPTOUT_SET" : "NOTIFICATION_OPTOUT_REMOVED", entityType: "NotificationPreference", entityId: row.id,
          userId: actor.id, userName: actor.username,
          previousState: previous ? { optOut: previous.optOut, motivo: previous.motivo } : null,
          newState: { destinatario, canal: input.canal, optOut: row.optOut, motivo: row.motivo } },
        tx
      );
      return { id: row.id, canal: row.canal, destinatario: row.destinatario, optOut: row.optOut, motivo: row.motivo, updatedAt: row.updatedAt.toISOString() };
    });
  }
}
