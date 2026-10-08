import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@core/config/env.config";
import { HttpError } from "@core/middlewares/error.middleware";

const configured = Boolean(
  env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_BUCKET_NAME
);

const client = configured
  ? new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })
  : null;

/** Sube un objeto a S3. 503 STORAGE_NOT_CONFIGURED si falta configuración. */
export const uploadObject = async (key: string, body: Buffer, contentType: string): Promise<void> => {
  if (!client || !env.AWS_BUCKET_NAME) {
    throw new HttpError(503, "STORAGE_NOT_CONFIGURED");
  }
  await client.send(
    new PutObjectCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
};

/** URL pública directa al objeto. 503 STORAGE_NOT_CONFIGURED si falta el bucket. */
export const publicObjectUrl = (key: string): string => {
  if (!env.AWS_BUCKET_NAME) {
    throw new HttpError(503, "STORAGE_NOT_CONFIGURED");
  }
  return `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
};
