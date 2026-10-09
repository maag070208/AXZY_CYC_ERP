import type { Prisma } from "@prisma/client";

/**
 * Puerto de notificaciones (M19 §4.6): los módulos disparan avisos por evento
 * sin importar el módulo de notificaciones. M19 resuelve las plantillas activas
 * de la `clave` (una por canal), las rinde con el `payload` y encola en el
 * outbox, dentro de la transacción del disparador si se pasa `tx`.
 */
export interface NotificationRecipient {
  /** Cuenta destinataria: bandeja interna y tiempo real. */
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface NotifyInput {
  /** Evento/plantilla, p. ej. `ALERTA_INASISTENCIA`. */
  code: string;
  recipients: NotificationRecipient[];
  /** Variables de la plantilla (texto ya formateado para mostrar). */
  payload: Record<string, string | number>;
  /** Base para evitar duplicados al repetir el mismo evento (se le suma canal y destinatario). */
  idempotencyKey?: string;
}

export type Notifier = (input: NotifyInput, tx?: Prisma.TransactionClient) => Promise<number>;
