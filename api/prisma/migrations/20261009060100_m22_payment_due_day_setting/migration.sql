-- M22: día del mes para el vencimiento de los cargos del plan de pagos (1..28).
INSERT INTO "settings" ("id", "key", "value", "description", "updated_at") VALUES
  (gen_random_uuid(), 'PAYMENT_DUE_DAY', '5', 'Día del mes para vencimiento de cargos (1–28)', now())
ON CONFLICT ("key") DO NOTHING;
