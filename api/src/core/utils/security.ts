import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "@core/config/env.config";
import type { Scope } from "@core/permissions/types";

/** Rol de un usuario (clave de la tabla `roles`). */
export type UserRole = string;

/** Excepción de permiso vigente, adjunta a la sesión. */
export interface SessionException {
  permission: string;
  scope: Scope;
  expiresAt?: Date | null;
}

/** Payload del access token: solo identifica. */
export interface JwtPayload {
  id: string;
  username: string;
  role: string;
  /** Roles adicionales (multi-rol). */
  roles?: string[];
}

/** Sesión resuelta en `authenticate` (JWT + BD fresca). */
export interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
  roles: string[];
  /** Mapa `{ permiso: alcance }` solo con los distintos de NONE. */
  permissions: Record<string, Scope>;
  /** Excepciones vigentes de `user_permissions`. */
  exceptions: SessionException[];
}

export const hashPassword = async (plain: string): Promise<string> =>
  bcrypt.hash(plain, 10);

export const comparePassword = async (
  plain: string,
  hash: string
): Promise<boolean> => bcrypt.compare(plain, hash);

/** Hash determinista (SHA-256) para guardar/buscar tokens sin exponerlos. */
export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

/** Token aleatorio de un solo uso (recuperación de contraseña). */
export const randomToken = (): string => crypto.randomBytes(32).toString("hex");

export const signToken = (payload: JwtPayload): string => {
  const opts: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    jwtid: crypto.randomUUID(),
  };
  return jwt.sign(payload, env.JWT_SECRET, opts);
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};

/** Payload del refresh token: solo identifica; no lleva rol ni permisos. */
export interface RefreshPayload {
  id: string;
  username: string;
  type: "refresh";
}

/** Firma un refresh token de vida larga (access corto + refresh rotado). */
export const signRefreshToken = (payload: { id: string; username: string }): string => {
  const opts: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
    jwtid: crypto.randomUUID(),
  };
  return jwt.sign({ ...payload, type: "refresh" }, env.JWT_SECRET, opts);
};

/** Parsea una duración estilo `jsonwebtoken` ("30d", "12h", "45m", "60s"). */
const parseDurationMs = (value: string): number => {
  const match = /^(\d+)\s*([smhdw])?$/i.exec(value.trim());
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  const factor: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };
  return amount * (factor[unit] ?? 1000);
};

/** Instante de expiración del refresh token según `JWT_REFRESH_EXPIRES_IN`. */
export const refreshTokenExpiresAt = (): Date =>
  new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES_IN));

/** Verifica un refresh token y exige el claim `type: "refresh"`. */
export const verifyRefreshToken = (token: string): RefreshPayload => {
  const payload = jwt.verify(token, env.JWT_SECRET) as RefreshPayload;
  if (payload.type !== "refresh") throw new Error("NOT_A_REFRESH_TOKEN");
  return payload;
};

/** ¿El token es un refresh (no sirve como access)? */
export const isRefreshToken = (payload: unknown): boolean =>
  typeof payload === "object" &&
  payload !== null &&
  (payload as { type?: string }).type === "refresh";
