-- CreateEnum
CREATE TYPE "FeeConceptType" AS ENUM ('INSCRIPCION', 'COLEGIATURA', 'MATERIAL', 'RECARGO', 'OTRO');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'TARJETA', 'OTRO');

-- CreateTable
CREATE TABLE "fee_concepts" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "tipo" "FeeConceptType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "concept_id" TEXT NOT NULL,
    "term_id" TEXT,
    "descripcion" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha_vencimiento" DATE NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDIENTE',
    "parent_charge_id" TEXT,
    "created_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "cancelled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "metodo" "PaymentMethod" NOT NULL,
    "referencia" TEXT,
    "recibo_folio" TEXT NOT NULL,
    "registered_by" TEXT NOT NULL,
    "registered_by_name" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "cancelled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_concepts_nombre_key" ON "fee_concepts"("nombre");

-- CreateIndex
CREATE INDEX "fee_concepts_active_idx" ON "fee_concepts"("active");

-- CreateIndex
CREATE UNIQUE INDEX "charges_parent_charge_id_key" ON "charges"("parent_charge_id");

-- CreateIndex
CREATE INDEX "charges_student_id_idx" ON "charges"("student_id");

-- CreateIndex
CREATE INDEX "charges_status_idx" ON "charges"("status");

-- CreateIndex
CREATE INDEX "charges_term_id_idx" ON "charges"("term_id");

-- CreateIndex
CREATE INDEX "charges_fecha_vencimiento_idx" ON "charges"("fecha_vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "payments_recibo_folio_key" ON "payments"("recibo_folio");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_charge_id_idx" ON "payments"("charge_id");

-- CreateIndex
CREATE INDEX "payments_fecha_idx" ON "payments"("fecha");

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "fee_concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_parent_charge_id_fkey" FOREIGN KEY ("parent_charge_id") REFERENCES "charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no modela (M09).
ALTER TABLE "fee_concepts" ADD CONSTRAINT "fee_concepts_monto_non_negative" CHECK ("monto" >= 0);
ALTER TABLE "charges" ADD CONSTRAINT "charges_monto_positive" CHECK ("monto" > 0);
ALTER TABLE "charges" ADD CONSTRAINT "charges_descuento_range" CHECK ("descuento" >= 0 AND "descuento" <= "monto");
ALTER TABLE "payments" ADD CONSTRAINT "payments_monto_positive" CHECK ("monto" > 0);

-- Concepto fijo para los recargos por mora (M09 §4.6).
INSERT INTO "fee_concepts" ("id", "nombre", "descripcion", "monto", "tipo", "active", "updated_at")
VALUES (gen_random_uuid(), 'Recargo por mora', 'Generado automáticamente sobre cargos vencidos (LATE_FEE)', 0, 'RECARGO', true, now())
ON CONFLICT ("nombre") DO NOTHING;
