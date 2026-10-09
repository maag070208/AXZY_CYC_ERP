-- Refactor a inglés (D-046) — Lote 1: catálogos base.
-- Renombrados de columna (sin pérdida de datos) + índices.
ALTER TABLE "levels" RENAME COLUMN "nombre" TO "name";
ALTER TABLE "levels" RENAME COLUMN "orden" TO "sort_order";
ALTER INDEX "levels_nombre_key" RENAME TO "levels_name_key";

ALTER TABLE "terms" RENAME COLUMN "nombre" TO "name";
ALTER TABLE "terms" RENAME COLUMN "fecha_inicio" TO "start_date";
ALTER TABLE "terms" RENAME COLUMN "fecha_fin" TO "end_date";
ALTER TABLE "terms" RENAME COLUMN "activo" TO "active";
ALTER INDEX "terms_nombre_key" RENAME TO "terms_name_key";

ALTER TABLE "cancellation_reasons" RENAME COLUMN "nombre" TO "name";
ALTER INDEX "cancellation_reasons_nombre_key" RENAME TO "cancellation_reasons_name_key";

ALTER TABLE "document_types" RENAME COLUMN "nombre" TO "name";
ALTER TABLE "document_types" RENAME COLUMN "obligatorio" TO "required";
ALTER INDEX "document_types_nombre_key" RENAME TO "document_types_name_key";
