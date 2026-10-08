import { Resend } from "resend";
import type * as nodemailer from "nodemailer";
import { env } from "@core/config/env.config";
import { logger } from "@core/utils/logger";

/**
 * Envío de correo desacoplado. Proveedor principal Resend; fallback SMTP
 * (nodemailer). Sin ninguno de los dos configurados entra en **dry-run** y solo
 * registra en consola (útil en desarrollo y pruebas).
 */

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

type Nodemailer = typeof import("nodemailer");

let resendClient: Resend | null = null;
let transporter: nodemailer.Transporter | null = null;
let nodemailerModule: Nodemailer | null = null;

const getResend = (): Resend | null => {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
};

const isDryRun = (): boolean => {
  if (env.EMAIL_DRY_RUN === true) return true;
  const hasResend = !!env.RESEND_API_KEY;
  const hasSmtp = !!env.SMTP_HOST && !!env.SMTP_USER && !!env.SMTP_PASS;
  return !hasResend && !hasSmtp;
};

const getTransporter = (): nodemailer.Transporter | null => {
  if (transporter) return transporter;
  if (isDryRun()) return null;
  if (!nodemailerModule) {
    // Import dinámico para evitar coste en arranque si no se usa.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodemailerModule = require("nodemailer") as Nodemailer;
  }
  transporter = nodemailerModule.createTransport({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT ?? 465,
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
    connectionTimeout: env.SMTP_CONNECTION_TIMEOUT ?? 10_000,
  });
  return transporter;
};

/** Envía un correo. Devuelve `true` si se envió o si entró en dry-run. */
export const sendEmail = async (input: SendEmailInput): Promise<boolean> => {
  const recipients = Array.isArray(input.to) ? input.to : [input.to];

  if (isDryRun()) {
    logger.info(`[mail:dry-run] to=${recipients.join(",")} subject="${input.subject}"`);
    return true;
  }

  const resend = getResend();
  if (resend) {
    try {
      const fromAddr =
        env.RESEND_FROM_EMAIL ?? env.SMTP_FROM ?? env.SMTP_USER ?? "noreply@cyc.local";
      const fromHeader = fromAddr.includes("<") ? fromAddr : `CYC <${fromAddr}>`;
      const { error } = await resend.emails.send({
        from: fromHeader,
        to: recipients,
        subject: input.subject,
        html: input.html,
        attachments: (input.attachments ?? []).map((a) => ({
          content: a.content,
          filename: a.filename,
          contentType: a.contentType,
        })),
      });
      if (!error) {
        logger.info(`[mail:resend] sent to=${recipients.join(",")}`);
        return true;
      }
      logger.error(`[mail:resend] error: ${JSON.stringify(error)}`);
    } catch (err) {
      logger.error(`[mail:resend] exception: ${String(err)}`);
    }
  }

  const tx = getTransporter();
  if (tx) {
    try {
      await tx.sendMail({
        from: env.SMTP_FROM ?? env.SMTP_USER!,
        to: recipients.join(", "),
        subject: input.subject,
        html: input.html,
        attachments: (input.attachments ?? []).map((a) => ({
          content: a.content,
          filename: a.filename,
          contentType: a.contentType,
        })),
      });
      logger.info(`[mail:smtp] sent to=${recipients.join(",")}`);
      return true;
    } catch (err) {
      logger.error(`[mail:smtp] send failed: ${String(err)}`);
      return false;
    }
  }

  return false;
};
