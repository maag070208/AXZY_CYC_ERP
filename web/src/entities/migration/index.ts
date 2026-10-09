// API pública del slice "migration" (M20: migración de históricos).
export { migrationApi } from "./api/migrationApi";
export { MIGRATION_ENTITIES } from "./model/types";
export type {
  MigrationBatch,
  MigrationBatchDetail,
  MigrationEntity,
  MigrationMode,
  MigrationRejection,
  MigrationResult,
  MigrationStatus,
} from "./model/types";
