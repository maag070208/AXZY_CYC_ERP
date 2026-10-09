-- M23 — Gastos institucionales (egresos). Modelo nuevo y permisos.
-- Idempotente en los catálogos: la app también los siembra en el arranque.

-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('SERVICES', 'SUPPLIES', 'PAYROLL', 'MAINTENANCE', 'TAXES', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "due_date" DATE,
    "concept" VARCHAR(200) NOT NULL,
    "type" "ExpenseType" NOT NULL,
    "vendor" VARCHAR(200),
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "notes" VARCHAR(500),
    "term_id" TEXT,
    "created_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(300),
    "cancelled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_date_idx" ON "expenses"("date");
CREATE INDEX "expenses_status_idx" ON "expenses"("status");
CREATE INDEX "expenses_term_id_idx" ON "expenses"("term_id");
CREATE INDEX "expenses_type_idx" ON "expenses"("type");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permisos del módulo «Gastos» (mismo contrato que `prisma/seed-data/permissions.json`).
INSERT INTO "permissions" ("key", "module", "name", "scopes", "sensitive", "active", "sort_order", "created_at", "updated_at")
VALUES
  ('expenses.view',   'Gastos', 'Ver gastos y su resumen',        ARRAY['NONE','ALL']::"Scope"[], false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('expenses.manage', 'Gastos', 'Registrar y editar gastos',      ARRAY['NONE','ALL']::"Scope"[], false, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- La institución (ADMIN) es la única que administra gastos; el resto no ve dinero.
INSERT INTO "role_permissions" ("id", "role_key", "permission_key", "scope", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'ADMIN', "key", 'ALL'::"Scope", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('expenses.view'), ('expenses.manage')) AS permission("key")
ON CONFLICT ("role_key", "permission_key") DO NOTHING;
