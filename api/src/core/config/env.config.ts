import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

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

  // Almacenamiento S3 (opcional).
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME,
  AWS_REGION: process.env.AWS_REGION ?? "us-east-2",

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
};
