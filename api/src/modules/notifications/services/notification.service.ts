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
type NotificationRow = Prisma.NotificationGetPayload<{ include: { template: { select: { code: true } } } }>;

const SYSTEM = { userId: null, userName: "sistema" };
const WORKER_LOCK_MS = 2 * 60_000;

const declared = (value: Prisma.JsonValue): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

const toTemplateView = (row: TemplateRow): TemplateView => ({
  id: row.id,
  code: row.code,
  name: row.name,
  channel: row.channel,
  subject: row.subject,
  body: row.body,
  variables: declared(row.variables),
  required: row.required,
  active: row.active,
  enviadas: row._count.notifications,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toNotificationView = (row: NotificationRow): NotificationView => ({
  id: row.id,
  channel: row.channel,
  recipient: row.recipient,
  userId: row.userId,
  origin: row.origin,
  templateClave: row.template?.code ?? null,
  subject: row.subject,
  body: row.body,
  status: row.status,
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  nextRetryAt: row.status === "QUEUED" ? row.nextRetryAt.toISOString() : null,
  error: row.error,
  dryRun: row.dryRun,
  readAt: row.readAt?.toISOString() ?? null,
  sentAt: row.sentAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const withTemplate = { template: { select: { code: true } } } as const;
const templateCount = { _count: { select: { notifications: true } } } as const;

interface EnqueueArgs {
  channel: Channel;
  recipient: string;
  userId?: string | null;
  templateId?: string | null;
  required?: boolean;
  subject: string | null;
  body: string;
  payload: Record<string, string | number>;
  origin: string;
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
    const channel = filterEnum(filters, "channel", CHANNELS);
    if (channel) and.push({ channel });
    const active = filterBool(filters, "active");
    if (active !== undefined) and.push({ active });
    const code = filterText(filters, "code");
    if (code) and.push({ code });
    const name = filterText(filters, "name");
    if (name) and.push({ name });
    const result = await paginatedQuery<TemplateRow>({
      model: this.db.notificationTemplate,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy: orderByOf(params.sort, { code: "code", name: "name", channel: "channel", updatedAt: "updatedAt" }, [{ code: "asc" }, { channel: "asc" }]),
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
    const exists = await this.db.notificationTemplate.findUnique({ where: { code_channel: { code: input.code, channel: input.channel } } });
    if (exists) throw new HttpError(409, "TEMPLATE_DUPLICATE");
    return this.db.$transaction(async (tx) => {
      const row = await tx.notificationTemplate.create({
        data: {
          code: input.code,
          name: input.name,
          channel: input.channel,
          subject: input.subject ?? null,
          body: input.body,
          variables: requiredVariables(input.variables, input.subject, input.body),
          required: input.required,
        },
        include: templateCount,
      });
      const view = toTemplateView(row);
      await this.audit?.(
        { action: "NOTIFICATION_TEMPLATE_CREATED", entityType: "NotificationTemplate", entityId: row.id, userId: actor.id, userName: actor.username,
          newState: { code: view.code, channel: view.channel, subject: view.subject, body: view.body, variables: view.variables, required: view.required } },
        tx
      );
      return view;
    });
  }

  async updateTemplate(id: string, input: TemplateUpdateInput, actor: AuthenticatedUser): Promise<TemplateView> {
    const previous = await this.loadTemplate(id);
    const subject = input.subject !== undefined ? input.subject : previous.subject;
    if (previous.channel === "EMAIL" && !subject) throw new HttpError(400, "VALIDATION_ERROR", {}, { subject: ["REQUIRED_FIELD"] });
    const body = input.body ?? previous.body;
    const variables = requiredVariables(input.variables ?? declared(previous.variables), subject, body);
    return this.db.$transaction(async (tx) => {
      const row = await tx.notificationTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.required !== undefined && { required: input.required }),
          subject,
          body,
          variables,
        },
        include: templateCount,
      });
      const before = toTemplateView(previous);
      const after = toTemplateView(row);
      await this.audit?.(
        { action: "NOTIFICATION_TEMPLATE_UPDATED", entityType: "NotificationTemplate", entityId: id, userId: actor.id, userName: actor.username,
          previousState: { name: before.name, subject: before.subject, body: before.body, variables: before.variables, required: before.required },
          newState: { name: after.name, subject: after.subject, body: after.body, variables: after.variables, required: after.required } },
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

  /** Persiste un aviso en el outbox (o lo marca OMITIDO por baja; IN_APP se entrega al instante). */
  private async enqueue(client: Client, args: EnqueueArgs): Promise<NotificationRow> {
    if (args.idempotencyKey) {
      const prior = await client.notification.findUnique({ where: { idempotencyKey: args.idempotencyKey }, include: withTemplate });
      if (prior) return prior;
    }
    const optedOut =
      !args.required &&
      !!(await client.notificationPreference.findUnique({
        where: { recipient_channel: { recipient: args.recipient, channel: args.channel } },
        select: { optOut: true },
      }))?.optOut;
    const now = new Date();
    const internal = args.channel === "IN_APP";
    const row = await client.notification.create({
      data: {
        channel: args.channel,
        recipient: args.recipient,
        userId: args.userId ?? null,
        templateId: args.templateId ?? null,
        origin: args.origin,
        payload: args.payload,
        subject: args.subject,
        body: args.body,
        idempotencyKey: args.idempotencyKey ?? null,
        createdBy: args.createdBy ?? null,
        ...(optedOut
          ? { status: "SKIPPED" as const, error: "OPT_OUT" }
          : internal
            ? { status: "SENT" as const, sentAt: now, providerMessageId: "in-app" }
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
    broadcastToUser(row.userId, { id: row.id, channel: row.channel, status: row.status, subject: row.subject, origin: row.origin }).catch((error) =>
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
    const templates = await client.notificationTemplate.findMany({ where: { code: input.code, active: true } });
    let count = 0;
    for (const template of templates) {
      const missing = missingVariables(declared(template.variables), input.payload);
      if (missing.length) {
        logger.warn(`[notifications] ${template.code}/${template.channel}: faltan variables ${missing.join(", ")}`);
        continue;
      }
      const seen = new Set<string>();
      for (const target of input.recipients) {
        const raw =
          template.channel === "EMAIL" ? target.email
          : template.channel === "IN_APP" ? (target.userId ? internalRecipient(target.userId) : null)
          : target.phone;
        const recipient = normalizeRecipient(template.channel, raw);
        if (!recipient || seen.has(recipient)) continue;
        seen.add(recipient);
        await this.enqueue(client, {
          channel: template.channel,
          recipient,
          userId: target.userId ?? null,
          templateId: template.id,
          required: template.required,
          subject: template.subject ? render(template.subject, input.payload) : null,
          body: render(template.body, input.payload),
          payload: input.payload,
          origin: input.code,
          idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:${template.channel}:${recipient}`.slice(0, 200) : null,
        });
        count++;
      }
    }
    return count;
  };

  /** Envío manual o de prueba desde la consola (M19 §5), idempotente con `Idempotency-Key`. */
  async send(input: SendInput, key: string | undefined, actor: AuthenticatedUser): Promise<NotificationView> {
    let userId: string | null = null;
    let raw = input.recipient;
    if (input.channel === "IN_APP") {
      const user = await this.db.user.findFirst({ where: { username: input.recipient.toLowerCase() }, select: { id: true } });
      if (!user) throw new HttpError(400, "NOTIFICATION_RECIPIENT_INVALID", { channel: input.channel });
      userId = user.id;
      raw = internalRecipient(user.id);
    }
    const recipient = normalizeRecipient(input.channel, raw);
    if (!recipient) throw new HttpError(400, "NOTIFICATION_RECIPIENT_INVALID", { channel: input.channel });

    let template: Prisma.NotificationTemplateGetPayload<object> | null = null;
    if (input.templateClave) {
      template = await this.db.notificationTemplate.findUnique({ where: { code_channel: { code: input.templateClave, channel: input.channel } } });
      if (!template) throw new HttpError(404, "TEMPLATE_NOT_FOUND");
      if (!template.active) throw new HttpError(409, "TEMPLATE_INACTIVE");
    }
    const asuntoText = template ? template.subject : (input.subject ?? null);
    const cuerpoText = template ? template.body : (input.body as string);
    if (input.channel === "EMAIL" && !asuntoText) throw new HttpError(400, "VALIDATION_ERROR", {}, { subject: ["REQUIRED_FIELD"] });
    const missing = missingVariables(requiredVariables(template ? declared(template.variables) : [], asuntoText, cuerpoText), input.payload);
    if (missing.length) throw new HttpError(400, "NOTIFICATION_VARIABLES_MISSING", { variables: missing.join(", ") }, { variables: missing });

    const { result } = await this.db.$transaction(async (tx) =>
      once(tx, key, { userId: actor.id, scope: "notifications.send" }, async () => {
        const row = await this.enqueue(tx, {
          channel: input.channel,
          recipient,
          userId,
          templateId: template?.id ?? null,
          required: template?.required ?? false,
          subject: asuntoText ? render(asuntoText, input.payload) : null,
          body: render(cuerpoText, input.payload),
          payload: input.payload,
          origin: "MANUAL",
          createdBy: actor.id,
        });
        await this.audit?.(
          { action: "NOTIFICATION_QUEUED", entityType: "Notification", entityId: row.id, userId: actor.id, userName: actor.username,
            newState: { channel: row.channel, recipient: row.recipient, templateClave: template?.code ?? null, status: row.status } },
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
    if (row.status !== "FAILED" && row.status !== "SKIPPED") throw new HttpError(409, "NOTIFICATION_NOT_RETRYABLE");
    return this.db.$transaction(async (tx) => {
      const updated = await tx.notification.update({
        where: { id },
        data: { status: "QUEUED", attempts: 0, nextRetryAt: new Date(), lockedUntil: null, error: null },
        include: withTemplate,
      });
      await this.audit?.(
        { action: "NOTIFICATION_RETRIED", entityType: "Notification", entityId: id, userId: actor.id, userName: actor.username,
          previousState: { status: row.status, attempts: row.attempts, error: row.error }, newState: { status: "QUEUED" } },
        tx
      );
      return toNotificationView(updated);
    });
  }

  async table(params: ITDataTableFetchParams): Promise<ITDataTableResponse<NotificationView>> {
    const { filters } = params;
    const and: Prisma.NotificationWhereInput[] = [];
    const channel = filterEnum(filters, "channel", CHANNELS);
    if (channel) and.push({ channel });
    const status = filterEnum(filters, "status", NOTIFICATION_STATUSES);
    if (status) and.push({ status });
    const recipient = filterText(filters, "recipient");
    if (recipient) and.push({ recipient });
    const origin = filterText(filters, "origin");
    if (origin) and.push({ origin });
    const createdAt = filterDateRange(filters, "createdAt");
    if (createdAt) and.push({ createdAt });
    const result = await paginatedQuery<NotificationRow>({
      model: this.db.notification,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy: orderByOf(params.sort, { createdAt: "createdAt", sentAt: "sentAt", status: "status", channel: "channel", recipient: "recipient" }, [{ createdAt: "desc" }]),
      include: withTemplate,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toNotificationView), total: result.total };
  }

  // --- bandeja interna (campana) ------------------------------------------------

  async mine(userId: string, limit = 30): Promise<{ unread: number; data: NotificationView[] }> {
    const where: Prisma.NotificationWhereInput = { userId, channel: "IN_APP", status: "SENT" };
    const [unread, rows] = await Promise.all([
      this.db.notification.count({ where: { ...where, readAt: null } }),
      this.db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 100), include: withTemplate }),
    ]);
    return { unread, data: rows.map(toNotificationView) };
  }

  async markRead(userId: string, input: MarkReadInput): Promise<{ updated: number }> {
    const { count } = await this.db.notification.updateMany({
      where: { userId, channel: "IN_APP", readAt: null, ...(input.all ? {} : { id: { in: input.ids ?? [] } }) },
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
          WHERE "status" = 'QUEUED' AND "next_retry_at" <= now() AND ("locked_until" IS NULL OR "locked_until" < now())
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
    const provider = providerFor(row.channel);
    try {
      if (!provider) throw new Error("NO_PROVIDER");
      const result = await provider.send({ id: row.id, channel: row.channel, recipient: row.recipient, subject: row.subject, body: row.body });
      const updated = await this.db.notification.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date(), providerMessageId: result.messageId, dryRun: result.dryRun, lockedUntil: null, error: null },
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
      if (next.status === "FAILED") {
        await this.audit?.({
          action: "NOTIFICATION_FAILED", entityType: "Notification", entityId: id, ...SYSTEM,
          newState: { channel: row.channel, recipient: row.recipient, attempts: row.attempts, error: message },
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
    const channel = filterEnum(filters, "channel", CHANNELS);
    if (channel) and.push({ channel });
    const recipient = filterText(filters, "recipient");
    if (recipient) and.push({ recipient });
    const optOut = filterBool(filters, "optOut");
    if (optOut !== undefined) and.push({ optOut });
    const result = await paginatedQuery<Prisma.NotificationPreferenceGetPayload<object>>({
      model: this.db.notificationPreference,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy: orderByOf(params.sort, { recipient: "recipient", channel: "channel", updatedAt: "updatedAt" }, [{ updatedAt: "desc" }]),
      page: params.page,
      limit: params.limit,
    });
    return {
      data: result.data.map((r) => ({ id: r.id, channel: r.channel, recipient: r.recipient, optOut: r.optOut, reason: r.reason, updatedAt: r.updatedAt.toISOString() })),
      total: result.total,
    };
  }

  async setPreference(input: PreferenceInput, actor: AuthenticatedUser): Promise<PreferenceView> {
    let raw = input.recipient;
    if (input.channel === "IN_APP" && !raw.startsWith("user:")) {
      const user = await this.db.user.findFirst({ where: { username: raw.toLowerCase() }, select: { id: true } });
      if (user) raw = internalRecipient(user.id);
    }
    const recipient = normalizeRecipient(input.channel, raw);
    if (!recipient) throw new HttpError(400, "NOTIFICATION_RECIPIENT_INVALID", { channel: input.channel });
    return this.db.$transaction(async (tx) => {
      const previous = await tx.notificationPreference.findUnique({ where: { recipient_channel: { recipient, channel: input.channel } } });
      const row = await tx.notificationPreference.upsert({
        where: { recipient_channel: { recipient, channel: input.channel } },
        create: { recipient, channel: input.channel, optOut: input.optOut, reason: input.reason ?? null, updatedBy: actor.id },
        update: { optOut: input.optOut, reason: input.reason ?? null, updatedBy: actor.id },
      });
      await this.audit?.(
        { action: input.optOut ? "NOTIFICATION_OPTOUT_SET" : "NOTIFICATION_OPTOUT_REMOVED", entityType: "NotificationPreference", entityId: row.id,
          userId: actor.id, userName: actor.username,
          previousState: previous ? { optOut: previous.optOut, reason: previous.reason } : null,
          newState: { recipient, channel: input.channel, optOut: row.optOut, reason: row.reason } },
        tx
      );
      return { id: row.id, channel: row.channel, recipient: row.recipient, optOut: row.optOut, reason: row.reason, updatedAt: row.updatedAt.toISOString() };
    });
  }
}
