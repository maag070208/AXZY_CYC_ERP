-- La migración de M23 asigna permisos de gastos al rol base `ADMIN`, que en una
-- base recién creada aún no existe (se siembra al arrancar la aplicación). Esta
-- migración garantiza el rol en bases que ya tenían datos y deja el estado igual
-- al de una instalación desde cero. Idempotente: no pisa roles existentes.
INSERT INTO "roles" ("key", "name", "module", "staff", "system", "active", "sort_order", "created_at", "updated_at")
VALUES ('ADMIN', 'ADMIN', 'Sistema', false, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Por si la matriz quedó a medias en una base existente.
INSERT INTO "role_permissions" ("id", "role_key", "permission_key", "scope", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'ADMIN', p."key", 'ALL'::"Scope", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('expenses.view'), ('expenses.manage')) AS p("key")
WHERE EXISTS (SELECT 1 FROM "permissions" WHERE "key" = p."key")
ON CONFLICT ("role_key", "permission_key") DO NOTHING;
