// Tipos de M20 (migración de históricos). Espejo de los DTO de la API.
export type MigrationEntity = "Student" | "Teacher";
export const MIGRATION_ENTITIES: readonly MigrationEntity[] = ["Student", "Teacher"];

export type MigrationMode = "DRY_RUN" | "EXECUTE";
export type MigrationStatus = "EN_PROCESO" | "COMPLETADO" | "FALLIDO" | "CANCELADO";

export interface MigrationBatch {
  id: string;
  entidad: MigrationEntity;
  archivo: string;
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
  entidad: MigrationEntity;
  mode: MigrationMode;
  status: MigrationStatus;
  checksum: string;
  totals: Record<string, number>;
  rejected: MigrationRejection[];
}

export interface MigrationBatchDetail extends MigrationBatch {
  rows: MigrationRejection[];
}
