// Tipos del módulo de notificaciones (M19): plantillas, outbox, preferencias y
// bandeja interna. Espejo de los DTO de la API.
export type NotificationChannel = "EMAIL" | "SMS" | "WHATSAPP" | "IN_APP";
export type NotificationStatus = "QUEUED" | "SENT" | "FAILED" | "SKIPPED";

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ["EMAIL", "SMS", "WHATSAPP", "IN_APP"];

export interface NotificationTemplate {
  id: string;
  code: string;
  name: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  variables: string[];
  required: boolean;
  active: boolean;
  sentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTemplateInput {
  code?: string;
  name?: string;
  channel?: NotificationChannel;
  subject?: string | null;
  body?: string;
  variables?: string[];
  required?: boolean;
}

export interface NotificationItem {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  userId: string | null;
  origin: string;
  templateCode: string | null;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  error: string | null;
  dryRun: boolean;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationSendInput {
  channel: NotificationChannel;
  recipient: string;
  templateCode?: string;
  subject?: string | null;
  body?: string | null;
  payload?: Record<string, string | number>;
}

export interface NotificationPreference {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  optOut: boolean;
  reason: string | null;
  updatedAt: string;
}

export interface NotificationPreferenceInput {
  channel: NotificationChannel;
  recipient: string;
  optOut: boolean;
  reason?: string | null;
}

/** `GET /notifications/mine`: bandeja interna del usuario con no leídas. */
export interface MyNotifications {
  unread: number;
  data: NotificationItem[];
}

/** `POST /notifications/drain`. */
export interface DrainResult {
  processed: number;
  sent: number;
  retrying: number;
  failed: number;
}
