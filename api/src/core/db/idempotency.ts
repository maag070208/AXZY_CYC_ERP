import { Prisma } from "@prisma/client";
import { HttpError } from "@core/middlewares/error.middleware";

/** `Idempotency-Key` válida, ausente (`undefined`) o 400 `INVALID_IDEMPOTENCY_KEY`. */
export const parseIdempotencyKey = (header: unknown): string | undefined => {
  if (header === undefined || header === null || header === "") return undefined;
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) {
    throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY");
  }
  return value;
};

/**
 * Ejecuta `run` una sola vez por clave (dentro de la transacción del llamador):
 * si la clave ya existe para la misma persona y operación, devuelve la
 * respuesta guardada; si la usó otra persona u otra operación, `409
 * IDEMPOTENCY_KEY_REUSED`. Sin clave, solo ejecuta.
 */
export const once = async <T>(
  tx: Prisma.TransactionClient,
  key: string | undefined,
  owner: { userId: string; scope: string },
  run: () => Promise<T>
): Promise<{ result: T; replayed: boolean }> => {
  if (!key) return { result: await run(), replayed: false };
  const prior = await tx.idempotencyRecord.findUnique({ where: { key } });
  if (prior) {
    if (prior.userId !== owner.userId || prior.scope !== owner.scope) throw new HttpError(409, "IDEMPOTENCY_KEY_REUSED");
    return { result: prior.response as T, replayed: true };
  }
  const result = await run();
  await tx.idempotencyRecord.create({
    data: { key, userId: owner.userId, scope: owner.scope, response: result as unknown as Prisma.InputJsonValue },
  });
  return { result, replayed: false };
};
