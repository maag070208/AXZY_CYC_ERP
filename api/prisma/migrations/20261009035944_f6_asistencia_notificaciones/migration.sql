-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENTE', 'FALTA', 'RETARDO', 'JUSTIFICADA');

-- CreateEnum
CREATE TYPE "JustificationStatus" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'INTERNO');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('EN_COLA', 'ENVIADO', 'FALLIDO', 'OMITIDO');

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "attendance_alert_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "hora" VARCHAR(5),
    "tema" VARCHAR(200),
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "delete_reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "recorded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "justifications" (
    "id" TEXT NOT NULL,
    "attendance_id" TEXT NOT NULL,
    "motivo" VARCHAR(1000) NOT NULL,
    "archivo_key" TEXT,
    "archivo_nombre" VARCHAR(255),
    "archivo_mime" VARCHAR(100),
    "archivo_size" INTEGER,
    "status" "JustificationStatus" NOT NULL DEFAULT 'PENDIENTE',
    "solicitado_por" TEXT NOT NULL,
    "resuelto_por" TEXT,
    "resolved_at" TIMESTAMP(3),
    "nota" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "justifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "clave" VARCHAR(60) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "canal" "NotificationChannel" NOT NULL,
    "asunto" VARCHAR(200),
    "cuerpo" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "destinatario" VARCHAR(200) NOT NULL,
    "canal" "NotificationChannel" NOT NULL,
    "template_id" TEXT,
    "user_id" TEXT,
    "origen" VARCHAR(60) NOT NULL DEFAULT 'MANUAL',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "asunto" VARCHAR(200),
    "cuerpo" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'EN_COLA',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "error" VARCHAR(500),
    "provider_message_id" TEXT,
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" VARCHAR(200),
    "read_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "destinatario" VARCHAR(200) NOT NULL,
    "canal" "NotificationChannel" NOT NULL,
    "opt_out" BOOLEAN NOT NULL DEFAULT false,
    "motivo" VARCHAR(300),
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_sessions_group_id_fecha_idx" ON "attendance_sessions"("group_id", "fecha");

-- CreateIndex
CREATE INDEX "attendance_enrollment_id_status_idx" ON "attendance"("enrollment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_session_id_enrollment_id_key" ON "attendance"("session_id", "enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "justifications_attendance_id_key" ON "justifications"("attendance_id");

-- CreateIndex
CREATE INDEX "justifications_status_idx" ON "justifications"("status");

-- CreateIndex
CREATE INDEX "notification_templates_canal_active_idx" ON "notification_templates"("canal", "active");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_clave_canal_key" ON "notification_templates"("clave", "canal");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "notifications_status_next_retry_at_idx" ON "notifications"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "notifications_destinatario_idx" ON "notifications"("destinatario");

-- CreateIndex
CREATE INDEX "notifications_user_id_canal_created_at_idx" ON "notifications"("user_id", "canal", "created_at");

-- CreateIndex
CREATE INDEX "notifications_template_id_idx" ON "notifications"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_destinatario_canal_key" ON "notification_preferences"("destinatario", "canal");

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "justifications" ADD CONSTRAINT "justifications_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reglas que Prisma no modela (M18/M19).
-- Una sesión vigente por grupo, fecha y hora (la hora puede ser NULL).
CREATE UNIQUE INDEX "attendance_sessions_active_unique" ON "attendance_sessions"("group_id", "fecha", COALESCE("hora", '')) WHERE "deleted_at" IS NULL;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_hora_format" CHECK ("hora" IS NULL OR "hora" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "justifications" ADD CONSTRAINT "justifications_archivo_size" CHECK ("archivo_size" IS NULL OR ("archivo_size" > 0 AND "archivo_size" <= 5242880));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_attempts_range" CHECK ("attempts" >= 0 AND "max_attempts" >= 1);

-- Plantillas base de los disparadores (editables desde la consola de M19).
INSERT INTO "notification_templates" ("id", "clave", "nombre", "canal", "asunto", "cuerpo", "variables", "obligatorio", "active", "updated_at") VALUES
  (gen_random_uuid(), 'ALERTA_INASISTENCIA', 'Alerta de inasistencia', 'EMAIL', 'Aviso de asistencia: {{curso}}',
   'Hola {{nombre}}: tu asistencia en {{curso}} ({{grupo}}) es de {{porcentaje}} %, por debajo del mínimo de {{umbral}} %. Si tienes faltas justificables, sube tu justificante.',
   '["nombre","curso","grupo","porcentaje","umbral"]', false, true, now()),
  (gen_random_uuid(), 'ALERTA_INASISTENCIA', 'Alerta de inasistencia', 'INTERNO', 'Asistencia baja en {{curso}}',
   'Tu asistencia en {{curso}} ({{grupo}}) es de {{porcentaje}} % (mínimo {{umbral}} %).',
   '["curso","grupo","porcentaje","umbral"]', false, true, now()),
  (gen_random_uuid(), 'JUSTIFICANTE_RESUELTO', 'Justificante resuelto', 'EMAIL', 'Tu justificante fue {{resultado}}',
   'Hola {{nombre}}: tu justificante de la falta del {{fecha}} en {{curso}} fue {{resultado}}. {{nota}}',
   '["nombre","fecha","curso","resultado","nota"]', false, true, now()),
  (gen_random_uuid(), 'JUSTIFICANTE_RESUELTO', 'Justificante resuelto', 'INTERNO', 'Justificante {{resultado}}',
   'Tu justificante de la falta del {{fecha}} en {{curso}} fue {{resultado}}. {{nota}}',
   '["fecha","curso","resultado","nota"]', false, true, now()),
  (gen_random_uuid(), 'EXAMEN_PUBLICADO', 'Examen en línea publicado', 'INTERNO', 'Nuevo examen: {{examen}}',
   'Se publicó «{{examen}}» de {{curso}}. Disponible del {{apertura}} al {{cierre}}.',
   '["examen","curso","apertura","cierre"]', false, true, now()),
  (gen_random_uuid(), 'EXAMEN_PUBLICADO', 'Examen en línea publicado', 'EMAIL', 'Nuevo examen en línea: {{examen}}',
   'Hola {{nombre}}: se publicó el examen «{{examen}}» de {{curso}}. Podrás presentarlo del {{apertura}} al {{cierre}} en «Mis exámenes».',
   '["nombre","examen","curso","apertura","cierre"]', false, true, now()),
  (gen_random_uuid(), 'PAGO_POR_VENCER', 'Pago próximo a vencer', 'EMAIL', 'Tu pago de {{concepto}} vence el {{fecha}}',
   'Hola {{nombre}}: tu cargo de {{concepto}} por {{saldo}} vence el {{fecha}}. Evita recargos pagando a tiempo.',
   '["nombre","concepto","saldo","fecha"]', false, true, now()),
  (gen_random_uuid(), 'PAGO_POR_VENCER', 'Pago próximo a vencer', 'INTERNO', 'Pago por vencer: {{concepto}}',
   'Tu cargo de {{concepto}} por {{saldo}} vence el {{fecha}}.',
   '["concepto","saldo","fecha"]', false, true, now()),
  (gen_random_uuid(), 'PAGO_RECIBIDO', 'Pago recibido', 'EMAIL', 'Recibo {{folio}}',
   'Hola {{nombre}}: registramos tu pago de {{monto}} por {{concepto}} con el recibo {{folio}}. Saldo pendiente del cargo: {{saldo}}.',
   '["nombre","monto","concepto","folio","saldo"]', true, true, now()),
  (gen_random_uuid(), 'PAGO_RECIBIDO', 'Pago recibido', 'INTERNO', 'Pago registrado: {{folio}}',
   'Registramos tu pago de {{monto}} por {{concepto}} (recibo {{folio}}).',
   '["monto","concepto","folio"]', false, true, now())
ON CONFLICT ("clave", "canal") DO NOTHING;
