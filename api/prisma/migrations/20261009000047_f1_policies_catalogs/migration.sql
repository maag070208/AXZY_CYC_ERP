-- CreateEnum
CREATE TYPE "PolicyEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "action" TEXT NOT NULL,
    "effect" "PolicyEffect" NOT NULL DEFAULT 'DENY',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_conditions" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_roles" (
    "policy_id" TEXT NOT NULL,
    "role_key" TEXT NOT NULL,

    CONSTRAINT "policy_roles_pkey" PRIMARY KEY ("policy_id","role_key")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_reasons" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancellation_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "policies_key_key" ON "policies"("key");

-- CreateIndex
CREATE INDEX "policies_action_active_idx" ON "policies"("action", "active");

-- CreateIndex
CREATE INDEX "policy_conditions_policy_id_idx" ON "policy_conditions"("policy_id");

-- CreateIndex
CREATE INDEX "policy_roles_role_key_idx" ON "policy_roles"("role_key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "levels_nombre_key" ON "levels"("nombre");

-- CreateIndex
CREATE INDEX "levels_active_idx" ON "levels"("active");

-- CreateIndex
CREATE UNIQUE INDEX "terms_nombre_key" ON "terms"("nombre");

-- CreateIndex
CREATE INDEX "terms_activo_idx" ON "terms"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_reasons_nombre_key" ON "cancellation_reasons"("nombre");

-- CreateIndex
CREATE INDEX "cancellation_reasons_active_idx" ON "cancellation_reasons"("active");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_nombre_key" ON "document_types"("nombre");

-- CreateIndex
CREATE INDEX "document_types_active_idx" ON "document_types"("active");

-- AddForeignKey
ALTER TABLE "policy_conditions" ADD CONSTRAINT "policy_conditions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_roles" ADD CONSTRAINT "policy_roles_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_roles" ADD CONSTRAINT "policy_roles_role_key_fkey" FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- Solo un ciclo escolar activo a la vez (M11 regla 2).
CREATE UNIQUE INDEX "terms_single_active" ON "terms" ("activo") WHERE "activo";

-- Parámetros generales por defecto (M11 regla 5). La `key` es fija: la API
-- solo actualiza `value`. Idempotente.
INSERT INTO "settings" ("id", "key", "value", "description", "updated_at") VALUES
  (gen_random_uuid(), 'SCHOOL_NAME', '"CYC — Instituto Técnico Automotriz"', 'Nombre de la institución', now()),
  (gen_random_uuid(), 'SCHOOL_ADDRESS', '""', 'Domicilio de la institución', now()),
  (gen_random_uuid(), 'SCHOOL_PHONE', '""', 'Teléfono de la institución', now()),
  (gen_random_uuid(), 'SCHOOL_EMAIL', '""', 'Correo de contacto de la institución', now()),
  (gen_random_uuid(), 'SCHOOL_LOGO_PATH', 'null', 'Ruta privada (storage) del logotipo', now()),
  (gen_random_uuid(), 'MIN_PASSING_GRADE', '70', 'Calificación mínima aprobatoria (0–100)', now()),
  (gen_random_uuid(), 'ATTENDANCE_THRESHOLD', '80', 'Umbral de asistencia en % para alerta (0–100)', now()),
  (gen_random_uuid(), 'LATE_FEE', '{"enabled": false, "dailyRate": 0, "graceDays": 0}', 'Reglas de recargo por mora (M09)', now()),
  (gen_random_uuid(), 'LANGUAGE', '"es"', 'Idioma del sistema (es | en)', now())
ON CONFLICT ("key") DO NOTHING;

-- Catálogos base mínimos (editables desde la consola de catálogos).
INSERT INTO "document_types" ("id", "nombre", "obligatorio", "updated_at") VALUES
  (gen_random_uuid(), 'Acta de nacimiento', true, now()),
  (gen_random_uuid(), 'CURP', true, now()),
  (gen_random_uuid(), 'Comprobante de domicilio', true, now()),
  (gen_random_uuid(), 'Certificado de estudios previos', false, now()),
  (gen_random_uuid(), 'Otro', false, now())
ON CONFLICT ("nombre") DO NOTHING;

INSERT INTO "cancellation_reasons" ("id", "nombre", "updated_at") VALUES
  (gen_random_uuid(), 'Motivos económicos', now()),
  (gen_random_uuid(), 'Cambio de domicilio', now()),
  (gen_random_uuid(), 'Bajo rendimiento académico', now()),
  (gen_random_uuid(), 'Motivos personales o familiares', now()),
  (gen_random_uuid(), 'Otro', now())
ON CONFLICT ("nombre") DO NOTHING;
