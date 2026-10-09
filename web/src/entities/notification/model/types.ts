// Tipos del módulo de notificaciones (M19): plantillas, outbox, preferencias y
// bandeja interna. Espejo de los DTO de la API.
export type NotificationChannel = "EMAIL" | "SMS" | "WHATSAPP" | "INTERNO";
export type NotificationStatus = "EN_COLA" | "ENVIADO" | "FALLIDO" | "OMITIDO";

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ["EMAIL", "SMS", "WHATSAPP", "INTERNO"];

export interface NotificationTemplate {
  id: string;
  clave: string;
  nombre: string;
  canal: NotificationChannel;
  asunto: string | null;
  cuerpo: string;
  variables: string[];
  obligatorio: boolean;
  active: boolean;
  enviadas: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTemplateInput {
  clave?: string;
  nombre?: string;
  canal?: NotificationChannel;
  asunto?: string | null;
  cuerpo?: string;
  variables?: string[];
  obligatorio?: boolean;
}

export interface NotificationItem {
  id: string;
  canal: NotificationChannel;
  destinatario: string;
  userId: string | null;
  origen: string;
  templateClave: string | null;
  asunto: string | null;
  cuerpo: string;
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
  canal: NotificationChannel;
  destinatario: string;
  templateClave?: string;
  asunto?: string | null;
  cuerpo?: string | null;
  payload?: Record<string, string | number>;
}

export interface NotificationPreference {
  id: string;
  canal: NotificationChannel;
  destinatario: string;
  optOut: boolean;
  motivo: string | null;
  updatedAt: string;
}

export interface NotificationPreferenceInput {
  canal: NotificationChannel;
  destinatario: string;
  optOut: boolean;
  motivo?: string | null;
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
