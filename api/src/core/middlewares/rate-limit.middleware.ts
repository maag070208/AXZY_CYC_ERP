import rateLimit, { type Options } from "express-rate-limit";
import { env } from "@core/config/env.config";
import { HttpError } from "./error.middleware";

/**
 * Límite de peticiones por IP (M12). Al excederlo responde `429 RATE_LIMITED`
 * con el envelope estándar y las cabeceras `RateLimit-*` / `Retry-After`.
 * La IP del cliente depende de `TRUST_PROXY` (saltos de proxy delante de la API).
 */
export const createRateLimit = (options: Pick<Options, "limit"> & Partial<Pick<Options, "windowMs" | "skipSuccessfulRequests">>) =>
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60_000,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    ...options,
    handler: (_req, _res, next) => next(new HttpError(429, "RATE_LIMITED")),
  });

/** Login: solo cuentan los intentos fallidos (fuerza bruta por IP, complementa el bloqueo por cuenta). */
export const loginRateLimit = createRateLimit({ limit: env.RATE_LIMIT_LOGIN_MAX, skipSuccessfulRequests: true });

/** Endpoints públicos que siempre responden 200 (recuperación de contraseña): cuentan todas las peticiones. */
export const publicRateLimit = createRateLimit({ limit: env.RATE_LIMIT_PUBLIC_MAX });
