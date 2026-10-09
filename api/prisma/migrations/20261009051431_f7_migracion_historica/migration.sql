-- CreateEnum
CREATE TYPE "MigrationMode" AS ENUM ('DRY_RUN', 'EXECUTE');

-- CreateEnum
CREATE TYPE "MigrationBatchStatus" AS ENUM ('EN_PROCESO', 'COMPLETADO', 'FALLIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "MigrationRowStatus" AS ENUM ('ACEPTADA', 'RECHAZADA', 'OMITIDA');

-- CreateTable
CREATE TABLE "migration_batches" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "archivo" TEXT NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "mode" "MigrationMode" NOT NULL,
    "status" "MigrationBatchStatus" NOT NULL DEFAULT 'EN_PROCESO',
    "idempotency_key" VARCHAR(200),
    "totals_json" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "entidad" TEXT NOT NULL,
    "natural_key" VARCHAR(200),
    "status" "MigrationRowStatus" NOT NULL,
    "reason" VARCHAR(120),
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "migration_batches_idempotency_key_key" ON "migration_batches"("idempotency_key");

-- CreateIndex
CREATE INDEX "migration_batches_entidad_status_idx" ON "migration_batches"("entidad", "status");

-- CreateIndex
CREATE INDEX "migration_batches_created_at_idx" ON "migration_batches"("created_at");

-- CreateIndex
CREATE INDEX "migration_rows_batch_id_status_idx" ON "migration_rows"("batch_id", "status");

-- CreateIndex
CREATE INDEX "migration_rows_natural_key_idx" ON "migration_rows"("natural_key");

-- AddForeignKey
ALTER TABLE "migration_rows" ADD CONSTRAINT "migration_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "migration_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
