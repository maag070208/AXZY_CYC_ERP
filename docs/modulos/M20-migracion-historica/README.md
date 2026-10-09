# M20 — Migración de datos históricos

| Campo | Valor |
|---|---|
| **Código** | M20 |
| **Versión** | 0.2 |
| **Estado** | Terminado (F7) |
| **Fase** | Extras |
| **Depende de** | M02 (auth/roles), M03 (alumnos), M04 (profesores), M07 (cursos/grupos), M08 (calificaciones), M09 (cargos/pagos), M11 (catálogos) |
| **Habilita a** | Puesta en producción / *onboarding* de cliente con datos del sistema previo |
| **Permisos** | `migration.execute` (con alcance) |

## Implementación (F7, 2026-10-09)

**Estado: terminado (primera entrega).** Código en `api/src/modules/migration` (`models/entity/migration-rules.ts`, `services/migration.service.ts`, `services/migration.writers.ts`) y `web/src/entities/migration` + `web/src/features/migration/{import-wizard,batches}`; página `/migration` (asistente + historial).

Alcance de esta entrega: **CSV** (UTF-8, `,` o `;`) para las entidades **Student** y **Teacher**; el resto de entidades queda como adaptadores siguientes sobre el mismo motor (ver decisiones abiertas).

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST | `/api/v1/migration/preview` | `migration.execute` | Multipart `file` + `entity`; simulación sin escribir y lote `DRY_RUN` |
| POST | `/api/v1/migration/execute` | `migration.execute` | Multipart `file` + `entity` + `checksum`; exige `Idempotency-Key` y respaldo reciente |
| POST | `/api/v1/migration/batches/query` | `migration.execute` | Tabla server-side de lotes |
| GET | `/api/v1/migration/batches/:id` | `migration.execute` | Detalle con las filas rechazadas |

Claves naturales: `Student.curp`, `Teacher.email` (upsert idempotente). Se preserva la **matrícula histórica** si viene en el CSV; si no, se genera con la secuencia por año. El alta de profesor crea su cuenta `TEACHER` con contraseña temporal (sin enviar la invitación; control escolar la reenvía cuando corresponda).

Decisiones (sección 12):
- El `dry-run` y la ejecución comparten `plan()`; la confirmación revalida el `sha256` del archivo. Ver [D-045](../../../DECISIONES.md).
- Gate de respaldo: `settings.MIGRATION_LAST_BACKUP_AT` debe ser reciente (≤ 24 h) o la ejecución responde `409 BACKUP_REQUIRED`.
- Bitácora: `MIGRATION_BATCH_PREVIEWED` y `MIGRATION_BATCH_EXECUTED` (totales y metadatos, sin el dataset).
- Los rechazos se calculan antes de escribir (validación de fila y duplicados por clave natural), de modo que nunca abortan las filas aceptadas del lote.

## 1. Objetivo

Importar de forma **repetible, idempotente y auditable** los datos históricos de
sistemas previos (Excel/CSV/base anterior) al SGE, con simulación previa,
limpieza, importación por lotes y conciliación con el cliente antes de dar por
cerrada la migración.

## 2. Alcance

**Incluye**
- Recepción y documentación de la estructura de los archivos fuente.
- Mapeo origen → destino y script de importación con **modo simulación
  (`dry-run`)** que reporta sin escribir.
- Limpieza y normalización: nombres, fechas, montos, **CURP** y detección de
  duplicados.
- Importación real **en lotes transaccionales** con registro de filas rechazadas.
- Validación por muestreo y **conciliación de totales** (alumnos, pagos,
  calificaciones).
- Trazabilidad de cada lote (`MigrationBatch`) y cada fila (`MigrationRow`).

**No incluye (en este módulo)**
- La operación de respaldo/restauración de la base ni el *cutover* (viven en
  [`respaldos.md`](../../operacion/respaldos.md)).
- Reglas de negocio propias de cada entidad importada (M03, M08, M09…): aquí solo
  se invocan sus servicios/validadores.
- Depuración de datos en el sistema origen ni captura manual de lo rechazado.
- Migración de adjuntos/archivos binarios fuera de la importación de metadatos.

## 3. Modelo de datos (Prisma)

Tablas **auxiliares de trazabilidad** del proceso (el dataset final vive en cada
módulo destino). `MigrationBatch` es el lote (una ejecución *dry-run* o real);
`MigrationRow` es el resultado fila a fila.

```prisma
enum MigrationMode {
  DRY_RUN
  EXECUTE
}

enum MigrationBatchStatus {
  IN_PROGRESS
  COMPLETED
  FAILED
  CANCELLED
}

enum MigrationRowStatus {
  ACCEPTED
  REJECTED
  SKIPPED
}

/// Lote de migración (una ejecución dry-run o real). Trazabilidad del proceso;
/// el dataset final vive en cada módulo destino.
model MigrationBatch {
  id             String               @id @default(uuid())
  /// Entidad destino: Student, Teacher…
  entity         String
  /// Nombre del archivo origen (el contenido no se guarda).
  file           String
  /// sha256 del archivo; la confirmación revalida que coincide.
  checksum       String               @db.VarChar(64)
  mode           MigrationMode
  status         MigrationBatchStatus @default(IN_PROGRESS)
  idempotencyKey String?              @unique @map("idempotency_key") @db.VarChar(200)
  /// { read, valid|inserted, updated?, rejected }
  totalsJson     Json                 @default("{}") @map("totals_json")
  createdBy      String               @map("created_by")
  executedAt     DateTime?            @map("executed_at")
  createdAt      DateTime             @default(now()) @map("created_at")
  updatedAt      DateTime             @updatedAt @map("updated_at")

  rows MigrationRow[]

  @@index([entity, status])
  @@index([createdAt])
  @@map("migration_batches")
}

/// Resultado fila a fila de un lote (se guardan las filas no aceptadas).
model MigrationRow {
  id         String             @id @default(uuid())
  batchId    String             @map("batch_id")
  rowNumber  Int                @map("row_number")
  entity     String
  naturalKey String?            @map("natural_key") @db.VarChar(200)
  status     MigrationRowStatus
  reason     String?            @db.VarChar(120)
  raw        Json?
  createdAt  DateTime           @default(now()) @map("created_at")

  batch MigrationBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@index([batchId, status])
  @@index([naturalKey])
  @@map("migration_rows")
}
```

**Índices:** `migration_batches(entity, status)` y `(createdAt)`;
`migration_rows(batchId, status)` y `(naturalKey)`.
**Relaciones:** `MigrationRow.batchId → MigrationBatch.id` (1:N). `createdBy` es el
`users.id` que dispara la ejecución (no FK obligatoria para no acoplar el módulo
de auditoría/usuarios). Idempotencia por `idempotencyKey` único ligado al lote.

## 4. Reglas de negocio

1. **Seis pasos del proceso:** (1) recibir y documentar el origen; (2) mapear
   columnas origen→destino; (3) `dry-run` que reporta sin escribir; (4) limpieza y
   normalización; (5) importación real por lotes con filas rechazadas; (6)
   validación por muestreo y conciliación de totales.
2. **Repetible e idempotente:** reejecutar no duplica; la clave es la **clave
   natural** de cada entidad (CURP/matrícula para alumnos, folio de recibo para
   pagos, `assessmentId + enrollmentId` para calificaciones) con *upsert* /
   *insert-missing*.
3. **Preview y confirmación comparten el mismo `plan()`:** el `dry-run` y la
   ejecución derivan del mismo cálculo, de modo que lo previsualizado coincide con
   lo aplicado.
4. **La confirmación reprocesa el archivo:** el servidor **no confía** en lo que
   el navegador dice que leyó; vuelve a leer y normalizar el origen (validando el
   `checksum`) antes de escribir.
5. **`Idempotency-Key` ligado al lote:** `POST /migration/execute` exige la
   cabecera; repetir la misma clave devuelve el lote previo sin reimportar; reusar
   la clave con otro usuario → `IDEMPOTENCY_KEY_REUSED`.
6. **Respaldo previo obligatorio:** antes de una importación real debe existir un
   respaldo reciente (ver [`respaldos.md`](../../operacion/respaldos.md)); sin él,
   la ejecución se rechaza.
7. **Lotes transaccionales:** cada lote se aplica en transacción; filas rechazadas
   se registran con motivo y **no** abortan las aceptadas.
8. **Orden de importación:** catálogos → alumnos/tutores → profesores →
   cursos/términos/grupos → inscripciones → calificaciones → cargos → pagos →
   asistencia.
9. **Conciliación:** no se cierra un lote real sin cuadrar conteos origen/destino,
   suma de montos y muestreo aceptado por el cliente.
10. **Auditoría:** cada lote ejecutado se registra con modo, totales y actor.

## 5. API

Módulo bajo `api/src/modules/migration/`
(`routes/ · controllers/ · services/ · models/{dto,entity}/`). El servicio central
es `MigrationService` con `plan(file)` y `execute(plan)`.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| POST | `/api/v1/migration/preview` | Simulación (`dry-run`): reporte sin escribir | `migration.execute` |
| POST | `/api/v1/migration/execute` | Importación real por lotes (`Idempotency-Key`) | `migration.execute` |
| POST | `/api/v1/migration/batches/query` | Listado server-side de lotes | `migration.execute` |
| GET | `/api/v1/migration/batches/:id` | Detalle de lote (totales y filas) | `migration.execute` |

> La especificación original mencionaba `GET /migration/batches/query`; se unifica
> a **`POST …/query`** por el contrato de tablas server-side
> ([`api/convenciones.md`](../../api/convenciones.md) §3).

**`POST /migration/preview`** (multipart con el archivo o referencia al objeto):

```jsonc
// Request  { "entity": "Student", "file": "…" }
// Response 200
{
  "batchId": "…", "mode": "DRY_RUN",
  "totals": { "read": 1200, "valid": 1180, "rejected": 20 },
  "rejected": [
    { "row": 15, "entity": "Student", "reason": "INVALID_CURP", "value": "XAXX…" },
    { "row": 42, "entity": "Student", "reason": "DUPLICATE_CURP" }
  ]
}
```

**`POST /migration/execute`** (cabecera `Idempotency-Key` obligatoria; reprocesa
el archivo en servidor):

```jsonc
// Request  { "entity": "Student", "file": "…", "confirm": true }
// Response 201
{ "batchId": "…", "mode": "EXECUTE", "status": "COMPLETED",
  "totals": { "read": 1200, "inserted": 1175, "updated": 5, "rejected": 20 } }
```

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `migration-batch` | `entities/migration-batch` | API + tipos + hooks de lotes |
| `migration/preview` | `features/migration/preview` | Carga de archivo y simulación (`dry-run`) |
| `migration/execute` | `features/migration/execute` | Confirmación y ejecución con `Idempotency-Key` |
| Asistente | `pages/migration/wizard` | Flujo de 6 pasos con `ITStepper` |
| Historial | `pages/migration/batches` | Listado de lotes con `ITDataTable` |

El asistente usa `ITPage` + `ITStepper` + `ITDropfile` para el archivo y
`ITDataTable` para el reporte de filas; confirmación con `ITConfirmDialog`. i18n
con namespace **`migration`**.

## 7. Permisos y alcance

- `migration.execute` — ejecutar `preview`/`execute` y consultar lotes. Por
  defecto solo ADMIN (`ALL`); puede delegarse por excepción temporal
  (`user_permissions` con vigencia) al personal de control escolar durante el
  *onboarding*.
- Es una acción sensible: se recomienda política ABAC que exija
  `migration.execute` + contexto de ambiente no productivo, y registro de
  `ACCESS_DENIED` ante intentos sin permiso. Ver
  [`roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

Zod en `models/dto`:

- `entity` ∈ catálogo de entidades migrables (`INVALID_FORMAT`).
- Archivo presente y tipo/tamaño permitidos (`FILE_TYPE_NOT_ALLOWED` /
  `FILE_TOO_LARGE`); `checksum` calculable.
- `Idempotency-Key` con formato `^[A-Za-z0-9_-]{8,100}$` (`INVALID_IDEMPOTENCY_KEY`)
  y presente en `execute` (`REQUIRED_FIELD`).
- Validación por entidad: CURP (`INVALID_CURP`), matrícula (`AAAA-NNNN`), fechas
  ISO, montos `Decimal`; duplicados por clave natural → `DUPLICATE_CURP`,
  `DUPLICATE_STUDENT_NUMBER`, `DUPLICATE_RECORD`.
- Filtros de tabla inválidos → `INVALID_FILTER`; rango invertido → `INVALID_RANGE`.
- El reporte de `dry-run` nunca oculta rechazos: toda fila no aceptada queda en
  `MigrationRow` con su `reason`.

## 9. Bitácora

Acciones registradas vía `AuditPort`:

- `MIGRATION_BATCH_PREVIEWED` (modo `dry-run`, entidad, totales).
- `MIGRATION_BATCH_EXECUTED` (modo real, lote, entidad, totales
  `{ read, inserted, updated, rejected }`).
- `MIGRATION_BATCH_FAILED`, `MIGRATION_BATCH_CANCELLED`.
- `ACCESS_DENIED` ante intentos sin `migration.execute`.

El `previousState`/`newState` no incluye los datasets completos (solo totales y
metadatos); las filas quedan en `MigrationRow`. Ver
[`bitacora.md`](../../seguridad/bitacora.md).

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): normalización de nombres/fechas/CURP; detección
  de duplicados por clave natural; `plan()` determinista (preview == execute para
  la misma entrada); cálculo de totales.
- **Contrato** (`api/tests/e2e`): `preview` no escribe; `execute` con
  `Idempotency-Key` repetida no duplica; reproceso del archivo valida `checksum`;
  rechazo de `execute` sin respaldo previo; contrato de tabla de lotes; permisos
  401/403; bitácora `MIGRATION_BATCH_EXECUTED`.
- **Navegador** (`web/tests/e2e`): asistente de 6 pasos, subida de archivo,
  revisión de reporte y confirmación.
- **Spec(s) del módulo:** `api/tests/e2e/migration.spec.ts`,
  `web/tests/e2e/migration.spec.ts` (una prueba por regla numerada de §4).

## 11. Criterios de aceptación

- [x] Migración y modelo Prisma (`MigrationBatch`, `MigrationRow`).
- [x] Módulo API (routes/controller/service/dto/entity) con `plan()` único,
      permisos e idempotencia por lote.
- [x] `dry-run` y `execute` ligados al respaldo previo y a la bitácora.
- [x] Reporte de filas rechazadas con motivo y conciliación de totales.
- [x] Pantallas web (asistente + historial) con UI kit.
- [x] Specs pasando (unitarias 98, contrato 192, navegador 69).
- [x] Este README completo.

> Cobertura de entidades en esta entrega: **Student** y **Teacher**. Cursos,
> grupos, inscripciones, calificaciones, cargos, pagos y asistencia se
> incorporan como adaptadores siguientes reutilizando el mismo motor (`plan()` +
> `apply` por entidad y clave natural).

## 12. Decisiones abiertas

- **Resuelto ([D-045](../../../DECISIONES.md)):** primera entrega = CSV (UTF-8,
  `,`/`;`) con adaptadores de alumnos y profesores; el resto de entidades queda
  como adaptadores siguientes.
- **Pendiente:** volumen máximo por lote y tamaño óptimo (hoy 5 000 filas / 2 MB).
- **Pendiente:** ¿la conciliación requiere firma/acta digital dentro del sistema?
- **Pendiente:** política de retención de `MigrationRow` (incluye `raw` con datos
  personales).
- **Pendiente:** integración fina con `restore` / `seed:from-backup` / `cutover`
  (scripts aún no implementados) y momento exacto del *cutover*.

## 13. Referencias

- Plantilla: [`plantilla-modulo.md`](../../plantillas/plantilla-modulo.md).
- Operación: [`migracion-datos.md`](../../operacion/migracion-datos.md),
  [`respaldos.md`](../../operacion/respaldos.md) (`restore`, `seed:from-backup`,
  `cutover`).
- Convenciones: [`convenciones.md`](../../guia/convenciones.md),
  [`api/convenciones.md`](../../api/convenciones.md).
- Arquitectura: [`api-modular.md`](../../arquitectura/api-modular.md),
  [`web-fsd.md`](../../arquitectura/web-fsd.md),
  [`axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).
- Errores: [`errores.md`](../../api/errores.md).
- Seguridad: [`roles-permisos.md`](../../seguridad/roles-permisos.md),
  [`bitacora.md`](../../seguridad/bitacora.md).
- Pruebas: [`estrategia-pruebas.md`](../../pruebas/estrategia-pruebas.md).
- Datos: [`diccionario-datos.md`](../../modelo-datos/diccionario-datos.md).
