/**
 * Reglas puras de M19 (sin BD): render de plantillas, validación de
 * destinatarios y backoff del outbox. Cubiertas por `tests/unit/notifications.spec.ts`.
 */

export const CHANNELS = ["EMAIL", "SMS", "WHATSAPP", "INTERNO"] as const;
export type Channel = (typeof CHANNELS)[number];
export const NOTIFICATION_STATUSES = ["EN_COLA", "ENVIADO", "FALLIDO", "OMITIDO"] as const;

const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Variables `{{nombre}}` usadas en un texto (sin repetir, en orden de aparición). */
export const variablesIn = (...texts: Array<string | null | undefined>): string[] => {
  const found: string[] = [];
  for (const text of texts) {
    for (const match of (text ?? "").matchAll(VARIABLE)) if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
};

/** Variables que el payload debe cubrir: las declaradas más las usadas en asunto/cuerpo. */
export const requiredVariables = (declared: readonly string[], asunto: string | null | undefined, cuerpo: string): string[] => {
  const all = [...declared];
  for (const v of variablesIn(asunto, cuerpo)) if (!all.includes(v)) all.push(v);
  return all;
};

export const missingVariables = (required: readonly string[], payload: Record<string, unknown>): string[] =>
  required.filter((v) => payload[v] === undefined || payload[v] === null);

/** Sustituye `{{var}}` por su valor (texto plano); deja vacías las no provistas. */
export const render = (text: string, payload: Record<string, unknown>): string =>
  text.replace(VARIABLE, (_m, name: string) => (payload[name] === undefined || payload[name] === null ? "" : String(payload[name]))).trim();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9]{10,15}$/;

/** Normaliza y valida el destinatario según el canal; `null` si no es válido. */
export const normalizeRecipient = (canal: Channel, value: string | null | undefined): string | null => {
  const v = (value ?? "").trim();
  if (!v) return null;
  switch (canal) {
    case "EMAIL":
      return EMAIL.test(v) && v.length <= 200 ? v.toLowerCase() : null;
    case "SMS":
    case "WHATSAPP": {
      const digits = v.replace(/[\s()-]/g, "");
      return PHONE.test(digits) ? digits : null;
    }
    case "INTERNO":
      return /^user:[0-9a-f-]{36}$/.test(v) ? v : null;
  }
};

export const internalRecipient = (userId: string): string => `user:${userId}`;

export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_CAP_MS = 60 * 60_000;

/**
 * Espera antes del reintento `attempt` (1 = primer fallo): 30 s, 1 min, 2 min…
 * con tope de 1 h y ±10 % de variación (`random` ∈ [0, 1)) para no sincronizar
 * reintentos.
 */
export const backoffMs = (attempt: number, random = 0.5): number => {
  const raw = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(raw * (0.9 + 0.2 * Math.min(Math.max(random, 0), 1)));
};

/** Resultado de un intento fallido: reintentar en `nextRetryAt` o dar por fallida. */
export const afterFailure = (
  attempts: number,
  maxAttempts: number,
  now: Date,
  random = 0.5
): { status: "EN_COLA"; nextRetryAt: Date } | { status: "FALLIDO" } =>
  attempts >= maxAttempts ? { status: "FALLIDO" } : { status: "EN_COLA", nextRetryAt: new Date(now.getTime() + backoffMs(attempts, random)) };

/** Texto plano → HTML mínimo y seguro para el correo. */
export const toHtml = (text: string): string =>
  `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`;
