import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@core/config/env.config";
import { HttpError } from "@core/middlewares/error.middleware";

/**
 * Almacenamiento de objetos **privados** (expediente documental, logotipo…).
 * Nunca se publican URLs: la API entrega los archivos por endpoints que
 * validan permiso y alcance.
 *
 * Driver (ver D-023, resuelve A-004 de forma provisional):
 * - `s3`    → si hay credenciales y bucket de AWS.
 * - `local` → directorio privado en disco (`STORAGE_LOCAL_DIR`, por defecto
 *   `./storage/private`). Es el driver por defecto fuera de producción y se
 *   puede forzar con `STORAGE_DRIVER=local` (on-premise / Docker con volumen).
 * - Sin ninguno en producción → `503 STORAGE_NOT_CONFIGURED`.
 */
export type StorageDriver = "s3" | "local" | "none";

const s3Configured = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_BUCKET_NAME);

export const storageDriver = (): StorageDriver => {
  if (env.STORAGE_DRIVER === "s3") return s3Configured ? "s3" : "none";
  if (env.STORAGE_DRIVER === "local") return "local";
  if (s3Configured) return "s3";
  return env.NODE_ENV === "production" ? "none" : "local";
};

let client: S3Client | null = null;
const s3 = (): S3Client => {
  client ??= new S3Client({
    region: env.AWS_REGION,
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SECRET_ACCESS_KEY! },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
};

const localRoot = (): string => path.resolve(env.STORAGE_LOCAL_DIR);

/** Ruta local segura: la clave nunca puede salir del directorio raíz. */
const localPath = (key: string): string => {
  const root = localRoot();
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) throw new HttpError(400, "INVALID_BODY");
  return target;
};

const assertConfigured = (): Exclude<StorageDriver, "none"> => {
  const driver = storageDriver();
  if (driver === "none") throw new HttpError(503, "STORAGE_NOT_CONFIGURED");
  return driver;
};

/** Sube un objeto privado. */
export const uploadObject = async (key: string, body: Buffer, contentType: string): Promise<void> => {
  if (assertConfigured() === "s3") {
    await s3().send(new PutObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const target = localPath(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body, { mode: 0o600 });
};

/** Lee un objeto privado completo (los archivos del expediente miden ≤ 5 MB). */
export const readObject = async (key: string): Promise<Buffer> => {
  try {
    if (assertConfigured() === "s3") {
      const result = await s3().send(new GetObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
      return Buffer.from(await result.Body!.transformToByteArray());
    }
    return await fs.readFile(localPath(key));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(404, "DOCUMENT_FILE_MISSING");
  }
};

/** Borra un objeto (solo para revertir una subida cuya transacción falló). */
export const deleteObject = async (key: string): Promise<void> => {
  if (assertConfigured() === "s3") {
    await s3().send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
    return;
  }
  await fs.rm(localPath(key), { force: true });
};
