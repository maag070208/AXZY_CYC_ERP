import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/** Versión de la app desde `package.json` (cwd = raíz del paquete API en dev y en Docker). */
const packageVersion = ((): string => {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const required = ["DATABASE_URL", "PORT", "JWT_SECRET"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: parseInt(process.env.PORT ?? "4000", 10),
  DATABASE_URL: process.env.DATABASE_URL!,
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "*",
  APP_URL: process.env.APP_URL ?? "http://localhost:5173",

  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",
  /** Vida del refresh token (rotado, de un solo uso). */
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",

  // Bloqueo temporal por intentos fallidos.
  MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS ?? "5", 10),
  LOGIN_LOCK_MINUTES: parseInt(process.env.LOGIN_LOCK_MINUTES ?? "15", 10),

  // Política de contraseña.
  PASSWORD_MIN_LENGTH: parseInt(process.env.PASSWORD_MIN_LENGTH ?? "10", 10),

  // Administrador inicial (solo si la tabla `users` está vacía).
  INITIAL_ADMIN_USERNAME: process.env.INITIAL_ADMIN_USERNAME ?? "admin",
  INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD ?? "admin12345",

  UPLOAD_MAX_BYTES: parseInt(process.env.UPLOAD_MAX_BYTES ?? "52428800", 10),

  // Almacenamiento privado: "s3" | "local" | vacío (S3 si hay credenciales;
  // si no, disco local fuera de producción). Ver core/services/storage.ts.
  STORAGE_DRIVER: process.env.STORAGE_DRIVER as "s3" | "local" | undefined,
  STORAGE_LOCAL_DIR: process.env.STORAGE_LOCAL_DIR ?? "storage/private",

  // Almacenamiento S3 (opcional; con S3_ENDPOINT sirve para cualquier endpoint compatible).
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME,
  AWS_REGION: process.env.AWS_REGION ?? "us-east-2",
  /** Endpoint S3 alternativo (`https://…`). Vacío = AWS. */
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  /** Fuerza path-style (R2/MinIO lo requieren); por defecto sí cuando hay endpoint. */
  S3_FORCE_PATH_STYLE:
    process.env.S3_FORCE_PATH_STYLE === "true" ||
    ((process.env.S3_FORCE_PATH_STYLE === undefined || process.env.S3_FORCE_PATH_STYLE === "") &&
      Boolean(process.env.S3_ENDPOINT)),

  // Correo (Resend principal, SMTP fallback, dry-run si falta todo).
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_FROM: process.env.SMTP_FROM,
  SMTP_CONNECTION_TIMEOUT: process.env.SMTP_CONNECTION_TIMEOUT
    ? parseInt(process.env.SMTP_CONNECTION_TIMEOUT, 10)
    : undefined,
  EMAIL_DRY_RUN:
    process.env.EMAIL_DRY_RUN === "true" ||
    (process.env.NODE_ENV !== "production" &&
      !process.env.SMTP_HOST &&
      !process.env.RESEND_API_KEY),

  // Tiempo real (opcional).
  ABLY_API_KEY: process.env.ABLY_API_KEY,

  // Metadatos del build/despliegue (los expone `/health`): permiten saber qué
  // versión está corriendo. Railway inyecta `RAILWAY_GIT_*` al desplegar desde
  // GitHub; en la imagen Docker los hornea el workflow (`GIT_COMMIT`/`BUILD_TIME`).
  APP_VERSION: process.env.APP_VERSION ?? packageVersion,
  BUILD_COMMIT: process.env.GIT_COMMIT ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
  BUILD_BRANCH: process.env.BUILD_BRANCH ?? process.env.RAILWAY_GIT_BRANCH ?? null,
  BUILD_TIME: process.env.BUILD_TIME ?? null,
  DEPLOYMENT_ID: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
};
