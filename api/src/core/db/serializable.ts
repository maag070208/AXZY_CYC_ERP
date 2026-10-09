import { Prisma, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";

/** ¿Postgres abortó la transacción por un conflicto de serialización (40001)? */
export const isSerializationFailure = (error: unknown): boolean => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    if (error.code === "P2010" && JSON.stringify(error.meta ?? {}).includes("40001")) return true;
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("could not serialize access") || message.includes("40001");
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Corre `work` en una transacción `Serializable` y la reintenta (con espera
 * aleatoria creciente) si Postgres la aborta por concurrencia. Agotados los
 * intentos responde `409 CONCURRENT_UPDATE`. Lo usan las reglas que leen y
 * luego escriben (cupo, empalmes): dos inscripciones al último lugar no pasan.
 */
export const serializable = async <T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  { attempts = 4, db = prismaClient }: { attempts?: number; db?: PrismaClient } = {}
): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      });
    } catch (error) {
      if (!isSerializationFailure(error)) throw error;
      if (attempt >= attempts) throw new HttpError(409, "CONCURRENT_UPDATE");
      await pause(15 * attempt + Math.floor(Math.random() * 25));
    }
  }
};
