import type { Prisma } from "@prisma/client";

/** Entrada de bitácora. Nunca incluye contraseñas, hashes ni tokens. */
export interface AuditLogInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  userId?: string | null;
  userName?: string | null;
  previousState?: Prisma.InputJsonValue | null;
  newState?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
}

/** Cliente de transacción opcional: ata el log a la operación que audita. */
export type AuditTransactionClient = Prisma.TransactionClient;

/**
 * Puerto de auditoría (DIP): los demás módulos no importan el servicio de
 * auditoría, solo esta firma de escritura.
 */
export type AuditLogger = (
  input: AuditLogInput,
  client?: AuditTransactionClient
) => Promise<unknown>;

export interface AuditPort {
  createLog: AuditLogger;
}

export interface ListAuditParams {
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
