-- M20: marca de tiempo del último respaldo (la migración real la exige reciente).
INSERT INTO "settings" ("id", "key", "value", "description", "updated_at") VALUES
  (gen_random_uuid(), 'MIGRATION_LAST_BACKUP_AT', '""', 'Marca ISO del último respaldo previo a importar (M20)', now())
ON CONFLICT ("key") DO NOTHING;
