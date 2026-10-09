# DECISIONES.md — Registro de Decisiones

Registro de decisiones de diseño y arquitectura del Sistema de Gestión Escolar
(SGE). Adopta los **estándares ya probados en el sistema PTNV**
(`~/DEV/PTNV/RESPONSIVA`) y el **Axzy UI System**. Su objetivo es evitar que las
mismas preguntas se respondan distinto en cada módulo.

## Cómo usar este registro

- Toda decisión que **no esté explícita** en la especificación se anota aquí.
- Cada entrada tiene un `D-###` estable, fecha, estado y justificación.
- Estados: `propuesta`, `aceptada`, `reemplazada`, `rechazada`.
- Si reemplaza a otra, la anterior se marca `reemplazada` y se enlaza.

Plantilla:

```markdown
### D-### — Título corto
- **Fecha:** AAAA-MM-DD
- **Estado:** propuesta | aceptada | reemplazada | rechazada
- **Contexto:**
- **Decisión:**
- **Alternativas consideradas:**
- **Consecuencias / impacto:**
```

---

## Decisiones de arquitectura (estándar PTNV)

### D-001 — Backend: Express + TypeScript + Prisma (reemplaza NestJS)
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Contexto:** La especificación permitía NestJS/Laravel/Django. El estándar de la casa (PTNV) es **Express 4 + TypeScript 5 + Prisma 5 + PostgreSQL + Zod 3**.
- **Decisión:** Backend **Express + TypeScript + Prisma**, validación con **Zod**, OpenAPI con `@asteasolutions/zod-to-openapi`, JWT con `jsonwebtoken`, hash con `bcryptjs`, `helmet`, `cors`, `multer` (memoryStorage), `winston`.
- **Alternativas consideradas:** NestJS (descartado para no divergir del estándar).
- **Consecuencias / impacto:** Organización `src/core` + `src/modules`, patrón `routes → controller → service → models/{dto,entity}`, errores planos, RBAC/ABAC de `core/permissions` y `core/policies`. Ver [`docs/arquitectura/stack.md`](docs/arquitectura/stack.md) y [`docs/arquitectura/estructura-repositorio.md`](docs/arquitectura/estructura-repositorio.md).

### D-002 — Prefijo de API `/api/v1`
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** Todos los endpoints bajo `/api/v1`. Swagger en `/docs` y JSON en `/docs/json`.
- **Consecuencias:** Cambios incompatibles abren `/api/v2`.

### D-003 — Columnas estándar: `id` + timestamps, sin soft-delete universal (reemplaza D-003 anterior)
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Contexto:** La especificación original pedía `deleted_at` en **todas** las tablas. El estándar PTNV no usa soft-delete global ni middleware: usa `id` UUID + `createdAt`/`updatedAt`, flag `active` en catálogos, baja explícita por campos (`deactivatedAt`/`deactivationReason`) y, cuando se requiere borrado lógico, un `deletedAt` puntual (p. ej. `Ticket.deletedAt`).
- **Decisión:** Adoptar el estándar PTNV:
  - `id String @id @default(uuid())` (claves naturales como `key` en roles/permisos).
  - `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
  - `active Boolean @default(true)` en catálogos y entidades que se desactivan.
  - Borrado lógico **explícito y por dominio** (`deletedAt`, `cancelledAt`, `voidedAt`) cuando el historial deba conservarse; nunca `DELETE` físico de datos de negocio.
- **Consecuencias / impacto:** Se abandona el `deleted_at` universal; la preservación de historial se diseña por dominio (bajas, cancelaciones, anulaciones). Ver [`docs/modelo-datos/diccionario-datos.md`](docs/modelo-datos/diccionario-datos.md).

### D-004 — Envelope de error plano
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Contexto:** La especificación pedía `{ "error": { code, message, details } }`. El estándar PTNV responde un objeto **plano**.
- **Decisión:** Responder `{ error, code, message, details }` (plano), con `code` en UPPER_SNAKE traducible y `details` de Zod cuando aplique. Ver [`docs/api/errores.md`](docs/api/errores.md).

### D-005 — Autenticación JWT con refresh rotado
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** JWT Bearer (access + refresh rotado), hash con **bcryptjs**, `authenticate` relee rol/permisos de la BD en cada petición, `/auth/me` devuelve `permissions: { key: scope }`. Bloqueo temporal tras 5 intentos fallidos (configurable).
- **Consecuencias:** El JWT solo identifica; la autorización se resuelve en el servidor. Ver [`docs/api/autenticacion.md`](docs/api/autenticacion.md).

### D-006 — Idioma y zona horaria
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** Interfaz y documentación en **español** (i18n `es`/`en` tanto en API como en web, con `es` por defecto). Persistencia en **UTC** (`timestamptz`); fechas de calendario con `@db.Date`; la conversión a zona local ocurre en la web.

### D-007 — Frontend con Feature-Sliced Design (FSD)
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Contexto:** El estándar PTNV usa React 19 + Vite + Redux Toolkit + React Router 7 con capas FSD y límites forzados por `eslint-plugin-boundaries`.
- **Decisión:** Adoptar **FSD**: `app/ · shared/ · entities/ · features/ · widgets/ · pages/`; router con **HashRouter**; estado global solo para lo transversal (auth, toast, notificaciones), el resto con API + hooks por feature. Alias `@app @shared @entities @features @widgets @pages`.
- **Consecuencias:** Ver [`docs/arquitectura/web-fsd.md`](docs/arquitectura/web-fsd.md).

### D-008 — UI System de la casa (Axzy UI System)
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** Toda la UI usa **`@axzydev/axzy_ui_system`** + Tailwind v4, con `ITThemeProvider`, `ITLayout`/`ITPage`, `ITDataTable` server-side y el patrón `PanelCard`/`KpiTile`. Integración CSS por capas (`@layer theme, base, axzy-ui-system, components, utilities`).
- **Consecuencias:** Los READMEs de módulo referencian componentes del kit; ver [`docs/arquitectura/axzy-ui-system.md`](docs/arquitectura/axzy-ui-system.md).

### D-009 — RBAC dinámico + ABAC con alcances
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** Autorización con **RBAC dinámico** (catálogo `permissions`, `roles` y matriz `role_permissions` en BD, cache en memoria, **fail-closed**), **multi-rol** (`user_roles`), **excepciones por persona** (`user_permissions`) y **políticas ABAC** (`policies`). Alcances `NONE/OWN/AREA/ALL`.
- **Consecuencias:** Ver [`docs/seguridad/roles-permisos.md`](docs/seguridad/roles-permisos.md).

### D-010 — Tablas server-side (contrato ITDataTable)
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** Listados por **`POST /…/query`** con `{ page, limit, filters, sort }` → `{ data, total, page, indexPagination… }`. Helpers `parseTableParams`/`ci`/`orderByOf`/`filter*` en API y `tableRequest`/`tableQuery`/`makeClientTableFetch` en web. Fechas como rango ISO **con zona local**.
- **Consecuencias:** Ver [`docs/api/convenciones.md`](docs/api/convenciones.md) y [`docs/arquitectura/axzy-ui-system.md`](docs/arquitectura/axzy-ui-system.md).

### D-011 — Pruebas con Playwright
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Contexto:** La especificación sugería Jest/Vitest. El estándar PTNV usa **Playwright** para contrato (E2E) y unitarias.
- **Decisión:** Pruebas con **Playwright**: unit en `tests/unit` y contrato E2E en `tests/e2e` (ambas en `api/` y `web/`). Cada cambio corre **solo el spec afectado**; nunca la suite completa. Cobertura objetivo ≥ 70% en lógica de servicios/reglas.
- **Consecuencias:** Ver [`docs/pruebas/estrategia-pruebas.md`](docs/pruebas/estrategia-pruebas.md).

### D-012 — i18n en API y web
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** Mensajes de error de la API traducibles (`core/i18n`, `es`/`en`, `AsyncLocalStorage`) y web con `i18next`/`react-i18next` (namespace por dominio). Idioma preferido persistido (`sys_config.LANGUAGE`, `localStorage` en web).

### D-013 — Idempotencia con `Idempotency-Key`
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** Los endpoints no idempotentes con riesgo de duplicado (`POST /charges/generate`, `POST /payments`, importaciones) aceptan `Idempotency-Key` (formato `^[A-Za-z0-9_-]{8,100}$`), persistido como columna única; repetir devuelve el resultado previo.

### D-014 — Monorepo `AXZY_CYC_ERP`
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Contexto:** El estándar PTNV usa dos repos (`api/`, `web/`), pero se pidió un monorepo bien organizado con Docker por proyecto.
- **Decisión:** Un solo repositorio **AXZY_CYC_ERP** con `api/` (Express+Prisma) y `web/` (React+FSD+Axzy UI) como paquetes independientes, `docs/` compartido, `docker-compose.yml` raíz y un **Dockerfile por proyecto** para desplegar fácil. Cada paquete conserva su propio `package.json`/lockfile.
- **Consecuencias:** Un solo `git init/commit/push`; el despliegue se hace con `docker compose up --build` desde la raíz. Ver [`docs/arquitectura/estructura-repositorio.md`](docs/arquitectura/estructura-repositorio.md).

### D-015 — Gestor de paquetes pnpm
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** `pnpm` con `pnpm-lock.yaml`. No agregar `package-lock.json` ni `yarn.lock`.

### D-016 — Bitácora inyectada por puerto (DIP)
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** La auditoría es un módulo propio; los demás módulos reciben un **`AuditPort`** por inyección de dependencias y registran con `createLog(input, tx?)`. El log puede atarse a la misma transacción del cambio.
- **Consecuencias:** Ver [`docs/seguridad/bitacora.md`](docs/seguridad/bitacora.md).

### D-017 — El arranque no siembra
- **Fecha:** 2026-10-08
- **Estado:** aceptada
- **Decisión:** El contenedor de la API arranca con `prisma migrate deploy && node dist/src/index.js`. El seed **no** corre al arrancar; solo insert-missing de catálogos/permisos/políticas y auditorías de solo lectura. El seed manual se corre en base vacía o con `cutover`.

### D-018 — Políticas ABAC: acciones registradas, primera que casa decide
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Contexto:** La spec pide políticas ABAC "después del RBAC" sin fijar su semántica.
- **Decisión:** Tablas `policies`/`policy_conditions`/`policy_roles`. Solo hay políticas para acciones registradas en `core/policies/actions.ts` (frontera de seguridad: cada acción declara los campos que una condición puede leer). Orden por `priority` ascendente (empate por `key`); la primera cuyas condiciones se cumplen todas decide; sin coincidencia se permite. Valores con referencias `@user.id|username|roles`. Denegar = `403 POLICY_DENIED` + `ACCESS_DENIED` en bitácora. Las políticas se cachean junto con catálogo y matriz y se recargan tras cada escritura.
- **Alternativas consideradas:** DSL libre de expresiones (más potente, imposible de validar); "DENY gana siempre" (impide excepciones ALLOW por prioridad).
- **Consecuencias / impacto:** Cada módulo nuevo registra sus acciones y llama `enforcePolicy` en el servicio. Ver [`docs/seguridad/roles-permisos.md`](docs/seguridad/roles-permisos.md) §6.

### D-019 — Cuentas: contraseña temporal, cambio obligatorio y reactivación
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** Toda cuenta creada por un administrador nace con `mustChangePassword`; la web no deja navegar fuera de `/change-password` hasta cambiarla (`POST /auth/change-password`, que revoca sesiones y emite tokens nuevos). El administrador puede asignar una contraseña temporal (`POST /users/:id/reset-password`, `users.edit`), desbloquear (`/unlock`, `users.edit`) y reactivar (`/reactivate`, `users.delete`, el mismo permiso que la baja). Nadie cambia sus propios roles tampoco por `PATCH /users/:id`.
- **Consecuencias / impacto:** Bitácora `USER_PASSWORD_RESET`, `USER_UNLOCKED`, `USER_REACTIVATED`, `PASSWORD_CHANGED` (nunca la contraseña).

### D-020 — Enlace de recuperación bajo HashRouter
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** El correo de recuperación apunta a `${APP_URL}/#/reset-password?token=…` porque la web usa `HashRouter` (nginx sirve un solo `index.html`).

### D-021 — M11: `settings` clave/valor validado por clave; ciclos en M11
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Contexto:** Decisiones abiertas del README de M11 (forma de `settings`, dueño de `terms`).
- **Decisión:** `settings` es clave/valor `jsonb`; las claves las siembra la migración y la API solo actualiza `value`, validado con un esquema zod por clave (`SETTING_SCHEMAS`). `PUT /settings` es todo o nada y audita `SYS_CONFIG_UPDATED` por clave con antes/después (secretos enmascarados). `LANGUAGE` alimenta el idioma del sistema. El modelo `Term` se crea en M11 (campos de la spec) y M07 le agrega sus relaciones; "un solo ciclo activo" se garantiza con transacción + índice único parcial `terms_single_active`. Catálogos con campos de la spec en español (`nombre`, `orden`, `obligatorio`) y `nombre` único.
- **Alternativas consideradas:** fila única tipada para `settings` (rompe con cada parámetro nuevo); `terms` hasta M07 (bloquea catálogos de F1).
- **Consecuencias / impacto:** El índice parcial no lo modela Prisma: si un `migrate dev` futuro propone borrarlo, conservarlo a mano. Motivos de baja y tipos de documento se leen con `config.view` (o `students.movements` / `documents.view` cuando existan) y se escriben con `config.manage`; niveles y ciclos usan `levels.*` / `terms.*`.

### D-022 — Pruebas E2E: la API provee los escenarios de la suite web
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** `api/` es dueño de la base: expone `test:e2e:provision` (usuarios fijos por rol), `test:e2e:clean` (borra todo lo `e2e_`/`E2E`) y `test:e2e:reset-token` (token de recuperación conocido). La suite web los invoca en `globalSetup`/`globalTeardown` y en los specs; nunca toca la base directo. CI corre ambas suites contra Postgres de servicio.

### D-023 — Almacenamiento privado: S3 o disco local (resuelve A-004 de forma provisional)
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Contexto:** A-004 (¿S3 o local?) seguía abierta y M06 necesita guardar expedientes ya.
- **Decisión:** Un solo puerto (`core/services/storage.ts`) con dos drivers: `s3` (si hay credenciales) y `local` (directorio privado `STORAGE_LOCAL_DIR`, rutas confinadas). Sin variable, S3 si existe; si no, local fuera de producción. En producción sin ninguno → `503 STORAGE_NOT_CONFIGURED`. `docker-compose` usa `local` con volumen `apistorage`. Nunca hay URLs públicas: los archivos salen por endpoints con permiso y alcance.
- **Consecuencias / impacto:** Cambiar a S3 es configurar variables; los respaldos deben incluir el volumen cuando el driver es local (M12).

### D-024 — Tipo de documento como catálogo y kardex PDF en el navegador
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** `documents.documentTypeId` es FK a `document_types` (M11), no un enum fijo: los faltantes salen de `obligatorio` y el catálogo es administrable. El kardex se calcula al vuelo (nunca se persiste) y su PDF se arma en la web con `@react-pdf/renderer`, cargado bajo demanda y protegido por `kardex.export`; no hay endpoint `/kardex/pdf`.
- **Consecuencias / impacto:** Si se requiere un PDF firmado/sellado por el servidor, se agrega el endpoint reutilizando `KardexService`.

### D-025 — Invitación del profesor sin outbox (hasta M19)
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** El alta del profesor crea profesor + cuenta PROFESOR + token de invitación (restablecimiento de un uso, 72 h) en una transacción; el correo sale después del commit y no bloquea. M19 reemplazará el envío directo por el outbox con reintentos. El username se deriva del correo (numerado si choca).

### D-026 — Bajas: siempre con movimiento; alcance AREA por resolvedor
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** `DELETE /students/:id` (M03) registra el mismo movimiento de baja con motivo que `POST /students/:id/baja` (M05): no hay baja sin historial. Motivo mínimo 3 caracteres (el catálogo incluye «Otro»). El alcance `AREA` se resuelve con `registerAreaResolver` que implementará M07 (grupos del profesor); sin resolvedor se comporta como `OWN` (fail-closed). La cancelación de inscripciones y la fuente académica del kardex son puertos que M07/M08 conectan.

### D-027 — Inscripción serializable con reintento; sin Idempotency-Key
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Contexto:** M07 pide que dos inscripciones simultáneas al último lugar no pasen ambas y sugiere `Idempotency-Key`.
- **Decisión:** Las reglas que leen y luego escriben (cupo, duplicado, empalme) corren en `serializable()` (`core/db/serializable.ts`): transacción `Serializable` con hasta 4 intentos y espera aleatoria; agotados → `409 CONCURRENT_UPDATE`. Además, índice único parcial `(student_id, group_id) WHERE status <> 'BAJA'` (una carrera contra él también responde `ALREADY_ENROLLED`). No se implementa `Idempotency-Key`: el índice ya hace idempotente la operación.
- **Consecuencias / impacto:** M09 (cargos por inscripción) debe engancharse dentro de la misma transacción o por evento posterior al commit.

### D-028 — Alcance académico: resolvedor `groups` y AREA de `students`
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** M07 registra el resolvedor `groups` (grupos donde `teacher.userId` = la persona) y lo usan grupos, inscripciones, instrumentos y calificaciones (`byIds` sobre `groupId`). También registra el `AREA` de `students` (alumnos con inscripción vigente en sus grupos), que limita expediente y kardex del profesor. `OWN` del alumno = sus inscripciones vigentes. En escrituras fuera de ámbito se responde `403` (M08 §4.7); en lecturas, `404`.
- **Consecuencias / impacto:** Un profesor con excepción `ALL` ve todo; quitarle un grupo le retira el acceso a esos alumnos de inmediato.

### D-029 — Calificaciones en Decimal con ROUND_HALF_UP; cierre manual sin reapertura
- **Fecha:** 2026-10-09
- **Estado:** aceptada (resuelve A-002 parcialmente)
- **Decisión:** Ponderaciones, máximos y calificaciones son `Decimal(…, 2)`; la final `Σ (score/max)·ponderación` se calcula con `Prisma.Decimal` y se redondea `ROUND_HALF_UP` a 2 decimales. El umbral es `MIN_PASSING_GRADE` (M11, global; `>=` acredita). El cierre es manual, exige ponderaciones al 100 % y todo capturado, escribe `finalGrade` y `ACREDITADO/REPROBADO` en la inscripción y bloquea el grupo (`409 GROUP_CLOSED`). No hay reapertura en esta versión.
- **Consecuencias / impacto:** Un umbral por nivel/ciclo o la reapertura autorizada (con bitácora) quedan como extensión de M08/M17.

### D-030 — El kardex lee inscripciones; cambio de grupo no duplica renglones
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** La fuente académica del kardex (M06) es `GradeService.kardexSource`: un renglón por inscripción (las dadas de baja por cambio de grupo, con `transferredToId`, se omiten), calificaciones normalizadas a 0–100 por instrumento y final solo tras el cierre. `INSCRITO` se muestra como `EN_CURSO`.

---

## Mapeo desde la especificación original

| Spec original | Estándar aplicado |
|---|---|
| NestJS / Laravel / Django | Express + TS + Prisma (D-001) |
| `deleted_at` en todas las tablas | `active` / `deletedAt` por dominio (D-003) |
| Error `{ error: { code, message, details } }` | Envelope plano `{ error, code, message, details }` (D-004) |
| Jest / Vitest | Playwright (D-011) |
| React + Vite + Tailwind | React 19 + Vite + RTK + FSD + Axzy UI (D-007, D-008) |
| Permisos por rol/acción | RBAC dinámico + ABAC + alcances (D-009) |
| Paginación `?page=&limit=` | Contrato server-side `POST …/query` (D-010) |

---

## Decisiones abiertas (pendientes de definir)

| ID | Tema | Módulo | Pregunta | Estado |
|---|---|---|---|---|
| A-001 | Proveedor SMS/WhatsApp | M19 | ¿Twilio u otro? Ably ya se usa para tiempo real. | abierta |
| A-002 | Regla de aprobación | M08 | ¿Umbral 70 configurable por nivel/ciclo? | parcial: global en M11 ([D-029](#d-029--calificaciones-en-decimal-con-round_half_up-cierre-manual-sin-reapertura)) |
| A-003 | Recargos por mora | M09 | ¿Se aplican? ¿Fórmula y periodicidad? | abierta |
| A-004 | Almacenamiento de archivos | M06 | ¿S3 (estándar PTNV) o local? | provisional: ambos ([D-023](#d-023--almacenamiento-privado-s3-o-disco-local-resuelve-a-004-de-forma-provisional)) |
| A-005 | Anti-fraude en examen | M16 | ¿Registrar cambios de pestaña? ¿Bloquear copiar/pegar? | abierta |
| A-006 | Alerta de inasistencia | M18 | ¿Umbral por defecto (80%) configurable? | abierta |
| A-007 | Acceso de alumnos | M02/M16 | ¿Los alumnos entran al portal o solo presencial? | abierta |
| A-008 | Notificaciones en tiempo real | M10/M19 | ¿Ably (estándar PTNV) para el tablero? | abierta |

---

## Cómo registrar una nueva decisión

1. Elige el siguiente `D-###` libre (hoy: `D-031`).
2. Copia la plantilla de arriba y llénala.
3. Enlaza al documento/módulo afectado.
4. Si reemplaza a otra, actualiza el estado de la anterior.
