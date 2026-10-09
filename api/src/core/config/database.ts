import { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@core/utils/logger";

/**
 * Cliente Prisma singleton del proceso.
 *
 * `pool_timeout` y `connect_timeout` se suben desde los valores por defecto (10
 * y 5 s) porque en producción la base llega por un proxy (Railway) cuya latencia
 * ronda los 2 s: con los defaults, una ráfaga de consultas del tablero agotaba
 * el pool y devolvía `P2024`/`P1001`. Se respetan los valores que ya venga en la
 * URL para no pisar una configuración explícita.
 */
const withConnectionDefaults = (url: string | undefined): string | undefined => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("pool_timeout")) parsed.searchParams.set("pool_timeout", "20");
    if (!parsed.searchParams.has("connect_timeout")) parsed.searchParams.set("connect_timeout", "15");
    if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", "15");
    return parsed.toString();
  } catch {
    return url;
  }
};

const baseClient = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  datasources: { db: { url: withConnectionDefaults(process.env.DATABASE_URL) } },
});

/**
 * Errores que indican que la conexión se perdió (proxy inestable, contenedor
 * reciclado) y no que la consulta esté mal: `P1001` (no se alcanza el servidor),
 * `P1002` (timeout de conexión), `P1017` (conexión cerrada por el servidor) y
 * `P2024` (pool agotado). Un reintento los resuelve porque fuerza una conexión
 * nueva.
 */
const CONNECTION_ERROR_CODES = new Set(["P1001", "P1002", "P1017", "P2024"]);

const isConnectionError = (error: unknown): boolean => {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return CONNECTION_ERROR_CODES.has(error.code);
  const message = error instanceof Error ? error.message : "";
  return /Can't reach database server|Connection closed|Timed out fetching a new connection/i.test(message);
};

/** Reintenta una vez una operación contra la base ante un corte de conexión. */
export const withDbRetry = async <T>(operation: () => Promise<T>, label = "query"): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (!isConnectionError(error)) throw error;
    logger.warn(`Reintentando ${label}: la conexión con la base se perdió`);
    return operation();
  }
};

/** Cliente listo para usar: reintenta solo ante errores de conexión. */
export const prismaClient = baseClient.$extends({
  query: {
    $allOperations: ({ args, query }) => withDbRetry(() => query(args), "consulta"),
  },
}) as unknown as PrismaClient;
