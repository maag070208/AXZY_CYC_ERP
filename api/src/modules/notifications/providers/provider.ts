import { randomUUID } from "node:crypto";
import { isEmailDryRun, sendEmail } from "@core/services/mail";
import { logger } from "@core/utils/logger";
import { toHtml, type Channel } from "../models/entity/notification-rules";

export interface OutgoingMessage {
  id: string;
  canal: Channel;
  destinatario: string;
  asunto: string | null;
  cuerpo: string;
}

export interface ProviderResult {
  messageId: string;
  /** No salió a un proveedor real (modo simulado). */
  dryRun: boolean;
}

/** Interfaz común de proveedores (M19 §4.3); un fallo se reporta lanzando un `Error`. */
export interface NotificationProvider {
  readonly name: string;
  send(message: OutgoingMessage): Promise<ProviderResult>;
}

/** Correo: Resend o SMTP (`core/services/mail`), o simulado sin proveedor configurado. */
export const emailProvider: NotificationProvider = {
  name: "email",
  async send(message) {
    const dryRun = isEmailDryRun();
    const ok = await sendEmail({ to: message.destinatario, subject: message.asunto ?? "CYC", html: toHtml(message.cuerpo) });
    if (!ok) throw new Error("EMAIL_SEND_FAILED");
    return { messageId: `${dryRun ? "dry-run" : "email"}:${randomUUID()}`, dryRun };
  },
};

/**
 * SMS y WhatsApp: el proveedor está por definir (A-001), así que se simula y
 * se deja constancia en el registro; al contratar uno se agrega aquí.
 */
export const simulatedProvider = (canal: Channel): NotificationProvider => ({
  name: `${canal.toLowerCase()}-dry-run`,
  async send(message) {
    logger.info(`[notifications:dry-run] ${canal} to=${message.destinatario} id=${message.id}`);
    return { messageId: `dry-run:${randomUUID()}`, dryRun: true };
  },
});

const providers = new Map<Channel, NotificationProvider>([
  ["EMAIL", emailProvider],
  ["SMS", simulatedProvider("SMS")],
  ["WHATSAPP", simulatedProvider("WHATSAPP")],
]);

export const providerFor = (canal: Channel): NotificationProvider | undefined => providers.get(canal);

/** Reemplaza el proveedor de un canal (pruebas o un proveedor nuevo). */
export const setProvider = (canal: Channel, provider: NotificationProvider): void => {
  providers.set(canal, provider);
};
