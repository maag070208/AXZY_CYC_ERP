// Tipos de M20 (migración de históricos). Espejo de los DTO de la API.
export type MigrationEntity = "Student" | "Teacher";
export const MIGRATION_ENTITIES: readonly MigrationEntity[] = ["Student", "Teacher"];

export type MigrationMode = "DRY_RUN" | "EXECUTE";
export type MigrationStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface MigrationBatch {
  id: string;
  entity: MigrationEntity;
  file: string;
  checksum: string;
  mode: MigrationMode;
  status: MigrationStatus;
  totals: Record<string, number>;
  createdBy: string;
  executedAt: string | null;
  createdAt: string;
}

export interface MigrationRejection {
  row: number;
  naturalKey: string | null;
  reason: string;
  value: string | null;
}

export interface MigrationResult {
  batchId: string;
  entity: MigrationEntity;
  mode: MigrationMode;
  status: MigrationStatus;
  checksum: string;
  totals: Record<string, number>;
  rejected: MigrationRejection[];
}

export interface MigrationBatchDetail extends MigrationBatch {
  rows: MigrationRejection[];
}
