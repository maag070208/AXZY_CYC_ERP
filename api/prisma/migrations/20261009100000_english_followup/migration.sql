-- Refactor a inglés (D-046) — cierre: índices, JSON guardado y catálogos de texto
-- que `schema_english` no cubrió. Sin pérdida de datos.

-- 1) Índices y restricciones con el nombre de la columna anterior.
ALTER TABLE "student_number_sequences" RENAME CONSTRAINT "matricula_sequences_pkey" TO "student_number_sequences_pkey";
ALTER INDEX "attendance_sessions_group_id_fecha_idx" RENAME TO "attendance_sessions_group_id_date_idx";
ALTER INDEX "charges_fecha_vencimiento_idx" RENAME TO "charges_due_date_idx";
ALTER INDEX "courses_clave_key" RENAME TO "courses_code_key";
ALTER INDEX "courses_nombre_idx" RENAME TO "courses_name_idx";
ALTER INDEX "exam_attempts_exam_id_student_id_numero_key" RENAME TO "exam_attempts_exam_id_student_id_number_key";
ALTER INDEX "fee_concepts_nombre_key" RENAME TO "fee_concepts_name_key";
ALTER INDEX "groups_course_id_term_id_nombre_key" RENAME TO "groups_course_id_term_id_name_key";
ALTER INDEX "migration_batches_entidad_status_idx" RENAME TO "migration_batches_entity_status_idx";
ALTER INDEX "notification_preferences_destinatario_canal_key" RENAME TO "notification_preferences_recipient_channel_key";
ALTER INDEX "notification_templates_canal_active_idx" RENAME TO "notification_templates_channel_active_idx";
ALTER INDEX "notification_templates_clave_canal_key" RENAME TO "notification_templates_code_channel_key";
ALTER INDEX "notifications_destinatario_idx" RENAME TO "notifications_recipient_idx";
ALTER INDEX "notifications_user_id_canal_created_at_idx" RENAME TO "notifications_user_id_channel_created_at_idx";
ALTER INDEX "payments_fecha_idx" RENAME TO "payments_date_idx";
ALTER INDEX "payments_recibo_folio_key" RENAME TO "payments_receipt_number_key";
ALTER INDEX "questions_dificultad_idx" RENAME TO "questions_difficulty_idx";
ALTER INDEX "questions_tipo_idx" RENAME TO "questions_type_idx";
ALTER INDEX "student_movements_student_id_fecha_idx" RENAME TO "student_movements_student_id_date_idx";
ALTER INDEX "student_movements_tipo_idx" RENAME TO "student_movements_type_idx";
ALTER INDEX "students_apellido_paterno_apellido_materno_nombres_idx" RENAME TO "students_paternal_surname_maternal_surname_first_names_idx";
ALTER INDEX "students_matricula_key" RENAME TO "students_student_number_key";
ALTER INDEX "teachers_apellidos_nombres_idx" RENAME TO "teachers_surnames_first_names_idx";
ALTER INDEX "terms_activo_idx" RENAME TO "terms_active_idx";

-- 2) Horario de los grupos (`groups.schedule`): llaves y días en inglés.
UPDATE "groups" g
SET "schedule" = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', CASE slot->>'dia'
      WHEN 'LUNES' THEN 'MONDAY' WHEN 'MARTES' THEN 'TUESDAY' WHEN 'MIERCOLES' THEN 'WEDNESDAY'
      WHEN 'JUEVES' THEN 'THURSDAY' WHEN 'VIERNES' THEN 'FRIDAY' WHEN 'SABADO' THEN 'SATURDAY'
      WHEN 'DOMINGO' THEN 'SUNDAY' ELSE slot->>'dia' END,
    'startTime', slot->>'horaInicio',
    'endTime', slot->>'horaFin') ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(g."schedule") WITH ORDINALITY AS t(slot, ord)
)
WHERE jsonb_typeof(g."schedule") = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(g."schedule") AS slot WHERE slot ? 'dia');

-- 3) Género guardado como texto.
UPDATE "students" SET "gender" = 'OTHER' WHERE "gender" = 'OTRO';

-- 4) Plantillas de aviso: clave del evento y variables `{{…}}`.
UPDATE "notification_templates" SET "code" = CASE "code"
  WHEN 'ALERTA_INASISTENCIA' THEN 'ABSENCE_ALERT'
  WHEN 'JUSTIFICANTE_RESUELTO' THEN 'JUSTIFICATION_RESOLVED'
  WHEN 'EXAMEN_PUBLICADO' THEN 'EXAM_PUBLISHED'
  WHEN 'PAGO_RECIBIDO' THEN 'PAYMENT_RECEIVED'
  WHEN 'PAGO_POR_VENCER' THEN 'PAYMENT_DUE_SOON'
  ELSE "code" END
WHERE "code" IN ('ALERTA_INASISTENCIA', 'JUSTIFICANTE_RESUELTO', 'EXAMEN_PUBLICADO', 'PAGO_RECIBIDO', 'PAGO_POR_VENCER');

DO $$
DECLARE pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['nombre', 'name'], ['curso', 'courseName'], ['grupo', 'groupName'], ['porcentaje', 'percentage'],
    ['umbral', 'threshold'], ['resultado', 'result'], ['fecha', 'date'], ['nota', 'note'], ['examen', 'exam'],
    ['apertura', 'opensAt'], ['cierre', 'closesAt'], ['concepto', 'concept'], ['saldo', 'balance'],
    ['monto', 'amount'], ['folio', 'receiptNumber']
  ] LOOP
    UPDATE "notification_templates" SET
      "subject" = regexp_replace("subject", '\{\{\s*' || pair[1] || '\s*\}\}', '{{' || pair[2] || '}}', 'g'),
      "body" = regexp_replace("body", '\{\{\s*' || pair[1] || '\s*\}\}', '{{' || pair[2] || '}}', 'g'),
      "variables" = replace("variables"::text, '"' || pair[1] || '"', '"' || pair[2] || '"')::jsonb;
  END LOOP;
END $$;

-- 5) Outbox: origen e idempotencia de los avisos ya emitidos (evita reenviarlos).
DO $$
DECLARE pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['ALERTA_INASISTENCIA', 'ABSENCE_ALERT'], ['JUSTIFICANTE_RESUELTO', 'JUSTIFICATION_RESOLVED'],
    ['EXAMEN_PUBLICADO', 'EXAM_PUBLISHED'], ['PAGO_RECIBIDO', 'PAYMENT_RECEIVED'], ['PAGO_POR_VENCER', 'PAYMENT_DUE_SOON']
  ] LOOP
    UPDATE "notifications" SET "origin" = pair[2] WHERE "origin" = pair[1];
    UPDATE "notifications" SET "idempotency_key" = pair[2] || substr("idempotency_key", length(pair[1]) + 1)
    WHERE "idempotency_key" LIKE pair[1] || ':%';
  END LOOP;
END $$;

-- 6) Políticas ABAC: campos de las acciones de cobranza y sus valores de enum.
UPDATE "policy_conditions" SET "field" = CASE "field"
  WHEN 'monto' THEN 'amount' WHEN 'descuento' THEN 'discount' WHEN 'porcentajeDescuento' THEN 'discountPercent'
  WHEN 'conceptTipo' THEN 'conceptType' WHEN 'masivo' THEN 'bulk' WHEN 'metodo' THEN 'method'
  WHEN 'diasDesdeRegistro' THEN 'daysSinceRegistered' ELSE "field" END
WHERE "field" IN ('monto', 'descuento', 'porcentajeDescuento', 'conceptTipo', 'masivo', 'metodo', 'diasDesdeRegistro');

DO $$
DECLARE pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['INSCRIPCION', 'ENROLLMENT'], ['COLEGIATURA', 'TUITION'], ['RECARGO', 'LATE_FEE'], ['OTRO', 'OTHER'],
    ['EFECTIVO', 'CASH'], ['TRANSFERENCIA', 'TRANSFER'], ['DEPOSITO', 'DEPOSIT'], ['TARJETA', 'CARD']
  ] LOOP
    UPDATE "policy_conditions" SET "value" = replace("value"::text, '"' || pair[1] || '"', '"' || pair[2] || '"')::jsonb
    WHERE "field" IN ('conceptType', 'method');
  END LOOP;
END $$;
