/** Registro de la bitácora (`audit_logs`). */
export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  userName: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
