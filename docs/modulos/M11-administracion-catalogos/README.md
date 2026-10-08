# M11 — Administración y catálogos

| Campo | Valor |
|---|---|
| **Código** | M11 |
| **Versión** | 0.1 |
| **Estado** | Planeado |
| **Fase** | Núcleo |
| **Depende de** | M02 (autenticación, roles y bitácora) |
| **Habilita a** | M03–M10 y M14–M21 (todos consumen parámetros y catálogos base) |
| **Permisos** | `config.view`, `config.manage`, más un permiso `<recurso>.*` por catálogo |

## 1. Objetivo

Centralizar los parámetros generales del sistema y los catálogos base (ciclos,
niveles, conceptos de pago, motivos de baja, tipos de documento y ajustes
institucionales) para que los demás módulos los consuman de forma consistente
desde una única fuente de verdad.

## 2. Alcance

**Incluye**
- Parámetros generales (`settings` clave/valor `jsonb`): calificación mínima,
  datos de la escuela, logotipo, umbral de asistencia y reglas de recargo.
- Catálogo de ciclos escolares y niveles educativos.
- Catálogo de motivos de baja (`cancellation_reasons`).
- Catálogo de tipos de documento (`document_types`, con bandera de obligatorio).
- Lectura para **todos** los módulos (contrato de `sys-config` por DIP) y
  escritura sólo para administradores.
- Bitácora de cambios de configuración y de cada catálogo.

**No incluye (en este módulo)**
- Conceptos de pago (`fee_concepts`): se administran en **M09**.
- Baja de alumnos y movimientos: M05 (solo consume `cancellation_reasons`).
- Cursos y grupos: M07 (M11 solo aporta `levels` y `terms`).
- Consola de roles/permisos/políticas: `roles.manage` (M02).
- Carga y almacenamiento de archivos: el logotipo se sube vía M06/storage y se
  guarda su referencia en `settings`.

## 3. Modelo de datos (Prisma)

Convención: `id uuid` salvo clave natural (`key`), `createdAt`/`updatedAt`,
`active` para catálogos desactivables (el spec usa `status activo/inactivo`, que
se modela como `active Boolean`; ver
[`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md)).

```prisma
model Setting {
  id          String   @id @default(uuid())
  key         String   @unique // p. ej. "MIN_PASSING_GRADE", "SCHOOL_NAME"
  value       Json     // jsonb: escalar u objeto
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("settings")
}

model Level {
  id        String   @id @default(uuid())
  nombre    String
  orden     Int?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("levels")
}

model CancellationReason {
  id        String   @id @default(uuid())
  nombre    String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("cancellation_reasons")
}

model DocumentType {
  id          String   @id @default(uuid())
  nombre      String
  obligatorio Boolean  @default(false)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("document_types")
}
```

**Índices:** `settings.key` único; índices `@@index([active])` en los catálogos
para los listados.
**Relaciones:** M11 no es propietario de FKs; sus catálogos se referencian por los
módulos consumidores (`levels.orden` para ordenar; `document_types` en M06;
`cancellation_reasons` en M05).
**Ciclos escolares:** se administran sobre el modelo `Term` de M07 (`terms`), con
`activo` único por vez.
**Borrado lógico:** catálogos desactivables vía `active`; el logotipo y valores de
`settings` se actualizan, no se borran.

## 4. Reglas de negocio

1. `settings` es una fuente de verdad **única**: cada `key` es inmutable y su
   `value` se puede actualizar (`PUT /settings`).
2. Sólo un ciclo escolar puede estar activo a la vez; activar uno desactiva el
   anterior.
3. Todo cambio de configuración o catálogo se registra en bitácora (`SYS_CONFIG_UPDATED`,
   `*_CREATED`/`*_UPDATED`/`*_DEACTIVATED`).
4. Los catálogos desactivados (`active = false`) **no** se ofrecen en formularios
   de captura, pero se conservan para no romper históricos.
5. Los parámetros por defecto se siembran en la migración (`MIN_PASSING_GRADE = 70`,
   `ATTENDANCE_THRESHOLD = 80`, `LATE_FEE_ENABLED = false`, datos de la escuela).
6. La calificación mínima (`MIN_PASSING_GRADE`) es la regla de aprobación por
   defecto que consume M08.
7. `obligatorio` en `document_types` define si el tipo cuenta como documento
   faltante en M06.
8. `LATE_FEE_ENABLED` y sus reglas condicionan los recargos por mora de M09.
9. No se puede escribir configuración sin `config.manage` (sólo lectura con
   `config.view`).
10. Ningún módulo puede modificar los catálogos por fuera de la API de M11.

## 5. API

Módulo bajo `api/src/modules/config/` (parámetros y catálogos;
`routes/ · controllers/ · services/ · models/{dto,entity}/`). Listados
server-side con `POST /…/query`.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/settings` | Lista/lee parámetros generales | `config.view` |
| PUT | `/api/v1/settings` | Reemplaza parámetros (`value` por `key`) | `config.manage` |
| POST | `/api/v1/levels/query` | Listado server-side de niveles | `levels.view` |
| POST | `/api/v1/levels` | Crea nivel | `levels.manage` |
| PATCH | `/api/v1/levels/:id` | Actualiza nivel | `levels.manage` |
| DELETE | `/api/v1/levels/:id` | Desactiva nivel | `levels.manage` |
| POST | `/api/v1/terms/query` | Listado server-side de ciclos | `terms.view` |
| POST | `/api/v1/terms` | Crea ciclo escolar | `terms.manage` |
| PUT | `/api/v1/terms/:id/activate` | Activa el ciclo (desactiva el anterior) | `terms.manage` |
| POST | `/api/v1/cancellation-reasons/query` | Listado de motivos de baja | `students.movements` |
| POST | `/api/v1/cancellation-reasons` | Crea motivo | `config.manage` |
| PATCH | `/api/v1/cancellation-reasons/:id` | Actualiza motivo | `config.manage` |
| POST | `/api/v1/document-types/query` | Listado de tipos de documento | `documents.view` |
| POST | `/api/v1/document-types` | Crea tipo | `config.manage` |
| PATCH | `/api/v1/document-types/:id` | Actualiza tipo (`obligatorio`, `active`) | `config.manage` |

Los conceptos de pago (`fee-concepts`) se documentan y sirven en **M09**.

**Actualización de configuración** `PUT /api/v1/settings`:
```jsonc
// Request
{
  "MIN_PASSING_GRADE": 70,
  "ATTENDANCE_THRESHOLD": 80,
  "SCHOOL_NAME": "Colegio CYC",
  "SCHOOL_LOGO_PATH": "private/branding/logo.png",
  "LATE_FEE": { "enabled": false, "dailyRate": 0.02, "graceDays": 5 }
}
```

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `settingsApi` / `catalogApi` | `entities/config`, `entities/catalog` | API + tipos (`/settings`, catálogos) |
| Edición de parámetros | `features/config/edit-settings` | Formulario por secciones con `ITFormBuilder` |
| CRUD de catálogos | `features/catalogs/manage-catalog` | Alta/edición/desactivación genérica |
| Pantallas | `pages/config/settings`, `pages/config/levels`, `pages/config/terms`, `pages/config/cancellation-reasons`, `pages/config/document-types` | Administración |

Pantallas con `ITPage` + `ITDataTable`/`ITFormBuilder`; secciones con `PanelCard`;
confirmaciones con `ITDialog`; banderas (`obligatorio`, `active`) con controles
del kit. i18n con namespace `config` (y `catalogs`).

## 7. Permisos y alcance

| Permiso | Roles (alcance) |
|---|---|
| `config.view` | ADMIN (ALL), CONTROL_ESCOLAR (ALL lectura) |
| `config.manage` | ADMIN (ALL) |
| `levels.view` / `levels.manage` | ADMIN (ALL); `view` también CONTROL_ESCOLAR (ALL) |
| `terms.view` / `terms.manage` | ADMIN (ALL); `view` también CONTROL_ESCOLAR (ALL) |
| `cancellation-reasons` (vía `students.movements` / `config.manage`) | ADMIN, CONTROL_ESCOLAR |
| `document-types` (vía `documents.view` / `config.manage`) | ADMIN, CONTROL_ESCOLAR |

Los catálogos son globales: su alcance natural es `ALL`; no hay datos por
propietario. Ver [`roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

- `settings`: `value` debe ser `jsonb` válido; `key` no se crea desde el cliente
  salvo semilla (solo se actualiza el `value`).
- `Level.orden`: entero opcional; `nombre` requerido (`REQUIRED_FIELD`).
- `Term`: `fechaInicio <= fechaFin`; solo un `activo` a la vez.
- `DocumentType.obligatorio`: booleano.
- `active`: booleano (desactivación lógica).
- Valores de enumeración/tipos inválidos → `VALIDATION_ERROR`; `key`/`nombre`
  duplicado → `DUPLICATE_RECORD` (409); recurso inexistente → `RECORD_NOT_FOUND`.
- Filtro no admitido → 400 `INVALID_FILTER`.

## 9. Bitácora

Escrituras vía `AuditPort` con `previousState`/`newState` (ver
[`bitacora.md`](../../seguridad/bitacora.md)):

| Acción | `entityType` | Notas |
|---|---|---|
| `SYS_CONFIG_UPDATED` | `Setting` | Cambios en parámetros generales (por `key`) |
| `LEVEL_CREATED` / `LEVEL_UPDATED` / `LEVEL_DEACTIVATED` | `Level` | Catálogo de niveles |
| `TERM_CREATED` / `TERM_UPDATED` / `TERM_ACTIVATED` | `Term` | Ciclos escolares |
| `CANCELLATION_REASON_CREATED` / `_UPDATED` / `_DEACTIVATED` | `CancellationReason` | Motivos de baja |
| `DOCUMENT_TYPE_CREATED` / `_UPDATED` / `_DEACTIVATED` | `DocumentType` | Tipos de documento |

Los secretos se enmascaran en `previousState`/`newState`. Los accesos denegados se
registran como `ACCESS_DENIED`.

## 10. Pruebas (Playwright)

- Unitarias (`api/tests/unit`): `settings.service.spec.ts` (semillas, `PUT` por
  `key`, `LATE_FEE`/`MIN_PASSING_GRADE`), `catalogs.service.spec.ts` (activación
  única de ciclo, desactivación lógica).
- Contrato (`api/tests/e2e`): `PUT /settings` con `config.manage`, 403 con sólo
  `config.view`, catálogos con `/query`, bitácora `SYS_CONFIG_UPDATED` y
  `*_CREATED`/`_UPDATED`, ciclo activo único.
- Navegador (`web/tests/e2e`): edición de parámetros y CRUD de un catálogo
  (p. ej. motivos de baja).
- Spec(s) del módulo: `api/tests/e2e/m11-administracion-catalogos.spec.ts`,
  `web/tests/e2e/m11-administracion-catalogos.spec.ts`.
- Una prueba por regla de la sección 4. Solo se corre el spec del cambio.

## 11. Criterios de aceptación

- [ ] Migración y modelo Prisma (`settings`, `levels`, `cancellation_reasons`, `document_types`) con semillas.
- [ ] Módulo API (routes/controller/service/dto/entity) con permisos y bitácora.
- [ ] Catálogos con `/query`, desactivación lógica y ciclo activo único.
- [ ] Bitácora `SYS_CONFIG_UPDATED` y `*_CREATED`/`*_UPDATED`.
- [ ] Pantallas web con UI kit (ITPage, ITDataTable, ITFormBuilder, PanelCard, ITDialog).
- [ ] Specs pasando (solo los del módulo).
- [ ] Este README completo.

## 12. Decisiones abiertas

- ¿`settings` es clave/valor libre (como hoy) o una fila única tipada?
- ¿El logotipo se guarda como ruta privada (storage) o como URL/base64 en `settings`?
- Catálogo de `terms`: ¿pertenece a M11 o a M07? (hoy el modelo `Term` es de M07).
- ¿Se versionan los parámetros para conservar el valor vigente al momento de un
  cálculo histórico (calificación mínima, umbral)?
- Formato y alcance de las reglas de recargo (`LATE_FEE`): tasa diaria vs. porcentaje.
- Ver [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Plantilla de módulo](../../plantillas/plantilla-modulo.md).
- [Convenciones generales](../../guia/convenciones.md) y
  [convenciones de API](../../api/convenciones.md).
- [Catálogo de errores](../../api/errores.md) (`VALIDATION_ERROR`,
  `DUPLICATE_RECORD`, `RECORD_NOT_FOUND`, `INVALID_FILTER`, …).
- [Roles y permisos](../../seguridad/roles-permisos.md) · [Bitácora](../../seguridad/bitacora.md).
- [Diccionario de datos — M11](../../modelo-datos/diccionario-datos.md).
- Especificación original del módulo (M11) y roadmap en
  [`../../guia/roadmap.md`](../../guia/roadmap.md).
