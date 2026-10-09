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
- **Decisión:** `settings` es clave/valor `jsonb`; las claves las siembra la migración y la API solo actualiza `value`, validado con un esquema zod por clave (`SETTING_SCHEMAS`). `PUT /settings` es todo o nada y audita `SYS_CONFIG_UPDATED` por clave con antes/después (secretos enmascarados). `LANGUAGE` alimenta el idioma del sistema. El modelo `Term` se crea en M11 (campos de la spec) y M07 le agrega sus relaciones; "un solo ciclo activo" se garantiza con transacción + índice único parcial `terms_single_active`. Catálogos con campos de la spec en español (`nombre`, `orden`, `obligatorio`) y `nombre` único *(renombrados a `name`, `sortOrder` y `required` por [D-046](#d-046--idioma-código-en-inglés-comentarios-en-español-e-i18n-en-api-y-web))*.
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
- **Decisión:** `DELETE /students/:id` (M03) registra el mismo movimiento de baja con motivo que `POST /students/:id/baja` (M05; hoy `/students/:id/withdrawal`, D-049): no hay baja sin historial. Motivo mínimo 3 caracteres (el catálogo incluye «Otro»). El alcance `AREA` se resuelve con `registerAreaResolver` que implementará M07 (grupos del profesor); sin resolvedor se comporta como `OWN` (fail-closed). La cancelación de inscripciones y la fuente académica del kardex son puertos que M07/M08 conectan.

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

### D-031 — Folio de recibo consecutivo por año
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** `REC-AAAA-NNNNNN` con una fila por año en `receipt_sequences`, incrementada dentro de la transacción serializable del pago (la fila queda bloqueada hasta el commit). Reinicia cada año; un pago cancelado conserva su folio y nunca se reutiliza.
- **Consecuencias / impacto:** Si la escuela requiere series por plantel o caja, se agrega la serie a la llave de la secuencia.

### D-032 — Idempotencia: registro de respuestas + claves en pagos
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** `Idempotency-Key` (`^[A-Za-z0-9_-]{8,100}$`) en `POST /charges/generate` se guarda en `idempotency_records` con la respuesta, dentro de la misma transacción; repetirla devuelve la misma respuesta (200, `Idempotent-Replayed: true`) y usarla otra persona u operación → `409 IDEMPOTENCY_KEY_REUSED`. En pagos la clave vive en `payments.idempotency_key` (única). Sin clave, la generación tampoco duplica: omite al alumno que ya tiene un cargo vigente del mismo concepto, ciclo y vencimiento. La web genera una clave por apertura de diálogo.

### D-033 — Recargos por mora a demanda (resuelve A-003)
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** Con `LATE_FEE.enabled`, `POST /charges/late-fees` crea un cargo RECARGO por cada cargo vencido con saldo: `saldo × dailyRate × (díasVencidos − graceDays)`, redondeado a centavos (Decimal). Uno por cargo (`parent_charge_id` único); se recalcula mientras no tenga pagos. Se ejecuta a demanda desde Cobranza; un job programado queda para M19.

### D-034 — Reportes: archivos en la API; montos solo con alcance ALL
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** XLSX (xlsx) y PDF tabular (pdfkit) se generan en la API a partir del mismo resultado JSON y se auditan (`REPORT_EXPORTED`). Los documentos con diseño de la escuela (kardex, estado de cuenta, recibo) siguen en la web con `@react-pdf` (D-024). `payments-period` y `debts` exigen `reports.view` en ALL. `attendance-list` espera a M18.

### D-035 — Tablero en vivo en Inicio
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** `GET /dashboard` calcula en cada consulta (sin caché) alumnos activos/baja, ocupación de grupos del ciclo activo y, con alcance ALL, ingresos del mes, adeudo total/vencido e ingresos de 6 meses. Inicio muestra el tablero a quien tiene `reports.view`. Gráficas en HTML/CSS sin dependencia.

### D-036 — Tiempo del examen controlado por el servidor
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** al iniciar un intento se fija `endsAt = min(inicio + duración, cierre del examen)`. Cada respuesta de la API trae `remainingSeconds` y el cliente solo cuenta hacia esa hora límite. Un barrido cada 60 s (y cualquier lectura o guardado del intento) cierra como `EXPIRADO` y califica lo vencido; guardar después de la hora límite responde `409 ATTEMPT_CLOSED`. Un solo intento `EN_CURSO` por alumno y examen (índice único parcial); iniciar con uno abierto lo reanuda.

### D-037 — Cambios de pestaña: se registran, no se bloquean (resuelve A-005)
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** el navegador reporta `TAB_BLUR`/`TAB_FOCUS`; la API guarda los eventos (últimos 200) y cuenta `focusLosses`, que el profesor ve en resultados y en la revisión. No se invalida el intento ni se bloquea copiar/pegar: es evidencia para el profesor, no una sanción automática.

### D-038 — Reactivos y exámenes se congelan al usarse
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** un reactivo respondido en algún intento ya no se edita (`409 QUESTION_IN_USE`), solo se desactiva. Con el primer intento, el examen fija preguntas, puntos y reglas (`409 EXAM_PUBLISHED_LOCKED`); solo cambian instrucciones, fecha de cierre y si se muestra el resultado. Cada intento guarda su orden de preguntas y opciones (`layout`), así barajar no altera intentos ya iniciados.

### D-039 — La calificación del examen va al libro de M08 (no directo al kardex)
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** el examen se vincula, opcionalmente y 1:1, a una evaluación activa del mismo grupo. Al cerrar un intento sin preguntas pendientes, el puntaje elegido (criterio `MEJOR` o `ULTIMO`) se normaliza a la escala de la evaluación (`puntaje / total × maxScore`, ROUND_HALF_UP) y se escribe como su `Grade`. Si hay abiertas por revisar se espera a la revisión; si el grupo ya cerró calificaciones no se toca nada. El kardex recibe la final al cerrar el grupo (D-029/D-030).

### D-040 — Portal del alumno para exámenes en línea (resuelve A-007 para M16)
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** las cuentas `ALUMNO` vinculadas a un expediente (`students.user_id`) entran a «Mis exámenes» (`attempts.take` OWN) y solo ven exámenes publicados de grupos con inscripción vigente. Sin expediente vinculado responde `403 STUDENT_PROFILE_REQUIRED`. La pantalla «Exámenes en línea» es para quien gestiona (`exams.manage`) o revisa (`attempts.review`); control escolar consulta el resultado en el libro y el kardex.

### D-041 — Importación de reactivos por CSV en dos pasos
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** `POST /questions/import?preview=true` valida sin guardar y devuelve filas válidas, rechazadas (fila, código, mensaje) y una muestra; aplicar exige `Idempotency-Key` (repetirla no duplica). Columnas `curso,tema,tipo,enunciado,puntos,dificultad,opciones,correctas` con `,` o `;`; opciones separadas por `|` y correctas por posición (1-based). En V/F sin opciones se usan «Verdadero|Falso». Máximo 1 MB.

### D-042 — Sesión de asistencia única vigente y umbral configurable (resuelve A-006)
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** una sesión es única por grupo/fecha/hora; la anulación es lógica (con motivo) y conserva los registros. El pase guarda a todos los inscritos vigentes (upsert por sesión+inscripción) y los renglones con justificante pendiente o aprobado no se modifican. El porcentaje resta solo la falta (retardo y justificada cuentan como asistencia) y la alerta cruza `ATTENDANCE_THRESHOLD` (M11; 80 % por defecto) una sola vez, limpiándose al recuperarlo; el umbral es global y configurable, suficiente hasta que se pida por nivel/ciclo.

### D-043 — Justificantes: uno por falta con archivo validado por contenido
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** cada falta admite un justificante (motivo ≥ 5 y archivo opcional PDF/JPG/PNG ≤ 5 MB validado por contenido; S3 o disco, D-023). Aprobarlo convierte la falta en `JUSTIFICADA` (deja de restar y limpia la alerta); rechazarlo devuelve la falta a `FALTA` y permite una nueva solicitud. Resolver exige `attendance.justify` con alcance AREA/ALL; el alumno (OWN) solo solicita y consulta. El motivo de la decisión (nota) queda en la bitácora.

### D-044 — Outbox de notificaciones con reintentos y canales simulados
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** las plantillas se identifican por clave+canal (una activa por combinación) con variables `{{var}}`. El outbox reclama con `FOR UPDATE SKIP LOCKED` y backoff exponencial hasta `maxAttempts`; el envío es idempotente por `Idempotency-Key`. Correo por Resend/SMTP o simulado; SMS y WhatsApp simulados hasta definir proveedor ([A-001](#decisiones-abiertas-pendientes-de-definir)). El canal `INTERNO` (hoy `IN_APP`) tiene bandeja propia y aviso en tiempo real best-effort por Ably. Las bajas (opt-out) no aplican a los avisos obligatorios.

### D-045 — M20 primera entrega: CSV de alumnos y profesores (resuelve las decisiones abiertas de M20)
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** la primera entrega de M20 migra por **CSV** (UTF-8; delimitador `,` o `;`) las entidades `Student` y `Teacher`; las demás se incorporan como adaptadores siguientes sobre el mismo motor. El `dry-run` y la ejecución comparten `plan()` (misma lectura/normalización) y la confirmación **revalida el `sha256`** del archivo; la ejecución exige `Idempotency-Key` por lote y un **respaldo reciente** (`settings.MIGRATION_LAST_BACKUP_AT` ≤ 24 h) o responde `409 BACKUP_REQUIRED`. Idempotencia por clave natural (`Student.curp`, `Teacher.email`) con *upsert*; se preserva la **matrícula histórica** si viene en el CSV. El alta de profesor crea su cuenta `PROFESOR` con contraseña temporal y **sin enviar la invitación** (control escolar la reenvía). Los rechazos (validación y duplicados por clave natural) se calculan antes de escribir, de modo que no abortan las filas aceptadas del lote.

### D-046 — Idioma: código en inglés, comentarios en español e i18n en API y WEB
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** **todo el código en inglés** (identificadores, funciones, tipos, enums, modelos y columnas Prisma, DTOs, rutas, permisos y claves de rol) y **comentarios/documentación en español**; **todo lo visible se internacionaliza**: la API por `Accept-Language` sobre `src/core/i18n/messages/{es,en}` (las claves de error son códigos, nunca texto) y la web por namespaces de `i18next` sin texto hardcodeado. Los **roles base** usan claves en inglés `ADMIN`, `SCHOOL_CONTROL`, `TEACHER`, `STUDENT` y su **nombre visible se traduce por i18n** (no se guarda como texto en la BD). Los identificadores existentes en español (`ACTIVO`, `nombres`, `COLEGIATURA`, `CONTROL_ESCOLAR`…) se migran a inglés de forma **transversal**; el código **nuevo** nace en inglés. Complementa [§11 de convenciones](docs/guia/convenciones.md). **Completada por [D-049](#d-049--cierre-del-refactor-a-inglés-e-i18n-completa-d-046).**

### D-047 — Programas (carreras), plan de estudios y plan de pagos
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:** se agrega el dominio **M22**. `Program` (carrera) define `code`, `name`, `periodType` ∈ `BIMONTHLY|TRIMESTER|QUADRIMESTER|SEMESTER`, `periodCount`, `monthlyFee` y `enrollmentFee` (reinscripción). El **plan de estudios** se arma con `ProgramSubject` (`programId` + `courseId` + `periodIndex`), **reutilizando `Course`** de M07 (una materia es un curso). El **plan de pagos** de un alumno es `StudentPlan` (alumno + programa + ciclo + fecha de inicio, con **snapshot** de los montos) y sus `Charge` (`Charge.planId` + `planChargeIndex` únicos). Al asignar un alumno a un programa se generan **idempotentemente**: **1 cargo de reinscripción + (periodCount × mesesDelPeriodo) mensualidades** con el costo del programa (BIMONTHLY=2, TRIMESTER=3, QUADRIMESTER=4, SEMESTER=6 meses). El plan **no recalcula**: los montos quedan fijos al generarlo (los cambios de precio aplican a planes nuevos).

### D-048 — Reglas del plan de pagos (resuelve las decisiones abiertas de M22)
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Decisión:**
  - **Reinscripción:** se cobra **una vez por periodo** (no una sola al ingreso). Total de cargos = `periodCount × (1 + monthsPerPeriod)`. Si el cliente no la cobra, `enrollmentFee = 0`.
  - **Día de vencimiento:** fijo y configurable en `settings.PAYMENT_DUE_DAY` (default **5**); la reinscripción del periodo vence en su primer mes y las mensualidades en los meses siguientes. Los meses/periodos salen del **calendario del `Term`** (`Term.calendar`, configurable; natural en español por defecto), no hardcodeado.
  - **Inscripción separada:** asignar el plan **solo genera cargos**; la inscripción a grupos (cupo/horario) es de **M07**. Acción opcional «Asignar plan e inscribir» que llama a **ambos servicios** sin acoplarlos.
  - **Conceptos:** dos genéricos `INSCRIPCION` y `COLEGIATURA` (hoy `ENROLLMENT` y `TUITION`); el **monto sale del plan** (`Charge.monto`, hoy `Charge.amount`).
  - **Prorrateo:** **no automático** en la v1; el admin puede **ajustar el primer cargo** con motivo (bitácora `CHARGE_ADJUSTED`). Regla automática solo si el cliente la define.
  - **Descuentos/becas:** campos en el plan (`discountPercent` **o** `discountAmount` + `discountReason`); los cargos se generan con el descuento aplicado para que los reportes salgan directo.

### D-049 — Cierre del refactor a inglés e i18n (completa D-046)
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Contexto:** D-046 fijó la regla y una primera pasada (migraciones `roles_english`, `lote1_catalogs_english` y `schema_english`) renombró el esquema, los enums y buena parte del código con búsqueda y reemplazo. Quedaron en español los campos derivados de las respuestas (`saldo`, `termNombre`, `horaInicio`…), dos rutas, varios códigos de error, las llaves i18n, el JSON ya guardado y las pruebas de la web; además, el reemplazo ciego alteró frases (títulos de pruebas, descripciones de Swagger, un correo).
- **Decisión:** se termina la migración con estas reglas:
  - **Contrato de la API en inglés, sin excepciones.** Campos de respuesta (`balance`, `termName`, `courseName`, `fullName`, `enrolledCount`, `dueDate`, `receiptNumber`, `attemptCount`…), rutas (`/students/:id/withdrawal`, `/students/:id/reentry`), códigos de error (`COURSE_CODE_TAKEN`, `CAPACITY_BELOW_ENROLLED`, `DUPLICATE_STUDENT_NUMBER`, `NAME_REQUIRED`, `CODE_FORMAT`) y parámetros `{{…}}` de los mensajes.
  - **JSON guardado.** El horario de los grupos es `[{ day, startTime, endTime }]` con `day` ∈ `MONDAY…SUNDAY`; los campos de las políticas ABAC de cobranza son `amount`, `discount`, `discountPercent`, `conceptType`, `bulk`, `method` y `daysSinceRegistered`.
  - **Avisos.** Eventos `ABSENCE_ALERT`, `JUSTIFICATION_RESOLVED`, `EXAM_PUBLISHED`, `PAYMENT_RECEIVED` y `PAYMENT_DUE_SOON`; variables de plantilla con el nombre del campo (`{{name}}`, `{{courseName}}`, `{{balance}}`, `{{receiptNumber}}`…).
  - **Llaves i18n en inglés** en la API (`core/i18n/messages/{es,en}.ts`) y en la web (`shared/i18n/locales/{es,en}`), con las mismas llaves en ambos idiomas. Ningún texto visible queda en el código de la API: correos, encabezados de exportación, etiquetas de reportes, motivos automáticos y mensajes del importador de reactivos salen del catálogo.
  - **Roles base por i18n.** La web muestra `ADMIN`, `SCHOOL_CONTROL`, `TEACHER` y `STUDENT` con `users:roles.<KEY>` (helper `roleLabel`); los roles creados por el administrador muestran su `name`.
  - **Entrada del usuario en español por alias.** Los CSV de reactivos y de migración tienen columnas canónicas en inglés y aceptan los encabezados en español (`curso` → `course`, `nombre` → `name`…), los tipos de reactivo en español y `OTRO` como género.
  - **Se queda en español** lo que D-046 ya exceptuaba: comentarios, documentación, títulos de pruebas y descripciones de Swagger.
- **Migración de datos:** `20261009100000_english_followup` renombra los índices que conservaban el nombre de la columna anterior y convierte, sin pérdida, el horario de los grupos, el género `OTRO`, las plantillas y el outbox de avisos (clave, variables e idempotencia) y las condiciones de las políticas.
- **Alternativas consideradas:** dejar el contrato a medias (campos en español sobre columnas en inglés: se descartó, es justo la inconsistencia que D-046 quería quitar); abrir `/api/v2` (innecesario: el único consumidor es la web de este repo y se actualiza en el mismo cambio).
- **Consecuencias / impacto:**
  - Es un cambio **incompatible** del contrato: cualquier integración externa futura debe partir de los nombres en inglés.
  - El historial no se reescribe: la bitácora anterior conserva los nombres en español en `previousState`/`newState`, igual que las respuestas guardadas en `idempotency_records`.
  - **Pendiente** (datos y textos que aún no pasan por i18n): `permissions.name`/`module` del catálogo de permisos, las descripciones de acciones y campos de `core/policies/actions.ts`, el contenido de las plantillas de aviso sembradas (solo español; son editables), los conceptos «Reinscripción»/«Colegiatura» que crea el plan de pagos y los nombres de archivo de las descargas (`alumnos-….xlsx`, `calificaciones-….xlsx`, `recibo-….pdf`).
  - Ver [§11 de convenciones](docs/guia/convenciones.md) y el [diccionario de datos](docs/modelo-datos/diccionario-datos.md) (generado desde el esquema).

---

### D-050 — Imagen Docker de la API: solo dependencias de producción, usuario `node` y entrypoint con `exec`
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Contexto:** La imagen copiaba al runtime el `node_modules` completo del builder (Playwright, ESLint, TypeScript, ts-node, nodemon) y arrancaba como **root** con `sh -c "npx prisma migrate deploy && node dist/src/index.js"`, de modo que el PID 1 era el shell y no la API. Medición del `api/Dockerfile` anterior: **716 MB**, con 315 MB de `node_modules`.
- **Decisión:** reestructurar el `Dockerfile` en cuatro etapas (`base` → `tools` → `build`/`prod-deps` → `runtime`):
  - Base **`node:20-bookworm-slim`** en todas las etapas, más `openssl` (Prisma detecta la plataforma leyendo libssl).
  - **`prod-deps`**: `pnpm install --prod`; al runtime solo van las dependencias de producción. `prisma` pasa a `dependencies` porque el contenedor aplica las migraciones.
  - **Sin pnpm en el runtime**: la etapa `runtime` sale de `base`, no de `tools`.
  - **Usuario `node`** (uid 1000) y `/app/storage/private` con ese dueño, para que el volumen nombrado herede el permiso y el expediente se escriba sin root.
  - **`docker-entrypoint.sh`** aplica `prisma migrate deploy` y hace `exec` del `CMD`: PID 1 = node (SIGTERM directo) y el `CMD` sigue siendo sustituible (`docker run … sh`).
  - Cliente Prisma generado **solo para la plataforma nativa** (los motores `musl` que declara el esquema son 16 MB muertos en una imagen glibc) y **caché de side-effects de pnpm desactivada**, que arrastraba motores de la libssl de otra imagen base.
  - `HEALTHCHECK` en la imagen, además del que ya define `docker-compose`.
- **Alternativas consideradas:** seguir en `bullseye-slim` (sin ganancia y con base más vieja); `node:20-alpine` (menos MB, pero exige `libc6-compat` y afinar el binario musl: más superficie de fallo); mover las migraciones a una tarea previa al despliegue (pre-deploy de Railway) para no meter el CLI de Prisma en la imagen — se descarta porque el despliegue documentado es un solo servicio y `migrate deploy` al arrancar evita olvidos; quitar `npm` del runtime (se deja para no perder el `npm run` de emergencia).
- **Consecuencias / impacto:**
  - Imagen **716 MB → 603 MB** (−15,8 %) y `node_modules` **315 MB → 206 MB**, sin Playwright/ESLint/TypeScript/nodemon en producción.
  - Verificado con un smoke test contra Postgres 16: 16 migraciones aplicadas por el entrypoint, backfill del catálogo (70 permisos), administrador inicial, `/api/v1/health` y `/api/v1/health/ready` en 200 (dentro y desde el host), escritura en el volumen, `uid=1000(node)` y `/proc/1/comm = node` (el baseline: `sh` y root).
  - **El contenedor ya no trae `ts-node`**: para sembrar desde dentro de la imagen se usa el script nuevo `seed:dist` (`node dist/prisma/seed.js`, ya compilado). Desde el host no cambia nada (`pnpm --dir api seed`).
  - Los fixtures `prisma/seed-data/*.json` **deben** seguir copiándose a la imagen: los lee el backfill de arranque (`core/utils/seed-data-dir.ts`). Sin ellos la API arranca con todo en 403 y sin administrador.
  - **Actualización de una instalación existente:** el volumen `apistorage` creado por la imagen anterior pertenece a `root`, así que la API (uid 1000) no puede escribir el expediente (arranca, pero las subidas fallan con EACCES). Se corrige una vez con `docker compose run --rm --user root --entrypoint chown api -R node:node /app/storage`.
  - `prisma` deja de ser `devDependency`: el lockfile mueve la entrada de grupo (sin re-resolución) y en local `pnpm install` pedirá purgar `node_modules` una vez.

### D-051 — Endurecimiento (M12): límite de peticiones, respaldos y verificación automática
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Contexto:** M12 pedía *rate limiting*, respaldos diarios con restauración, revisión OWASP y cobertura mínima, sin fijar cómo. La documentación heredada de PTNV describía scripts (`restore`, `seed:from-backup`, `cutover`, `legacy:extract`) que aquí no existían.
- **Decisión:**
  - **Límite de peticiones por IP** con `express-rate-limit` (en memoria): en `/auth/login` cuentan solo los intentos **fallidos** (complementa el bloqueo por cuenta de D-005); en `/auth/forgot-password` y `/auth/reset-password` cuentan todas. Responde `429 RATE_LIMITED` con el envelope estándar. Los topes son altos fuera de producción para no estorbar a las suites; `TRUST_PROXY` indica los saltos de proxy para conocer la IP real.
  - **Respaldos** en formato custom de `pg_dump` con `sha256`, más los archivos del driver `local`: programados por el servicio `backup` de `docker-compose` y a demanda con `pnpm backup`; `pnpm restore` vacía el esquema, restaura, aplica migraciones y reporta conteos, y se niega a tocar una base no local sin `--yes`. Cada respaldo actualiza `settings.MIGRATION_LAST_BACKUP_AT` (lo exige M20).
  - **No se portan** `seed:from-backup`, `cutover` ni `legacy:extract`: en PTNV convierten respaldos de un modelo anterior; aquí los históricos entran por el CSV de M20.
  - **Control de acceso verificado contra el OpenAPI:** un spec recorre todas las operaciones documentadas y exige 401 sin token; un endpoint nuevo queda cubierto sin tocar la prueba.
  - **Cobertura:** umbral de 70 % (c8) sobre las reglas de negocio puras (`models/entity`, permisos, políticas, utilidades); los servicios se validan con las pruebas de contrato contra la API real.
  - **Auditoría de dependencias** en CI (`pnpm audit --prod --audit-level high`). Se aceptan dos avisos de `xlsx` porque solo afectan a la lectura de archivos y la API solo escribe.
- **Alternativas consideradas:** limitador propio (menos probado para lo mismo); límite en nginx (no cubre Railway, donde no hay nginx delante de la API); medir cobertura de servicios instrumentando la API durante el e2e (más frágil que útil por ahora).
- **Consecuencias / impacto:** con más de una réplica de la API el límite debe pasar a un almacén compartido. Copiar los respaldos fuera del servidor es tarea de operación. Ver [`docs/operacion/respaldos.md`](docs/operacion/respaldos.md) y [`docs/seguridad/seguridad-owasp.md`](docs/seguridad/seguridad-owasp.md).

### D-052 — Indicadores ejecutivos (M21): definiciones y cálculo en vivo
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Contexto:** M21 dejaba abiertas las fórmulas, la fuente de la proyección de ingresos, el alcance del profesor y si hacían falta vistas materializadas.
- **Decisión:**
  - **Mismo motor que M10.** Los indicadores son tipos de reporte nuevos (`dropout`, `performance-by-course`, `performance-by-teacher`, `enrollment-trend`, `delinquency`, `income-vs-projection`): heredan catálogo, filtros, alcance, exportación XLSX/PDF y bitácora. La ocupación por grupo ya la daba `enrollments-by-group`.
  - **Deserción** = bajas ÷ matrícula inicial del grupo. La matrícula inicial cuenta toda inscripción que no salió por **cambio de grupo** (D-030): un cambio no es deserción.
  - **Rendimiento** = promedio de calificaciones finales y % de acreditados sobre lo ya cerrado (`PASSED` + `FAILED`). Sin cierres el valor es `null`, no 0 %.
  - **Morosidad** = cargos vencidos con saldo ÷ cargos ya vencidos, y su monto pendiente.
  - **Ingresos contra proyección:** lo *proyectado* son los cargos vigentes (monto − descuento) y lo *cobrado*, los pagos vigentes de esos mismos cargos, agrupados por **mes de vencimiento**. No se captura una meta aparte: la proyección es lo facturado.
  - **Comparación:** el tablero (`GET /dashboard/executive`) devuelve cada indicador como `{ value, previous, delta, deltaPercent }` frente al ciclo inmediato anterior por fecha de inicio; la tendencia muestra el ciclo elegido y los cinco anteriores.
  - **Filtros** por ciclo, nivel, curso y grupo en los indicadores académicos; los de cobranza solo por ciclo (un cargo no pertenece a un grupo).
  - **Alcance:** el profesor ve los indicadores académicos de sus grupos; los de cobranza exigen `ALL` (igual que M10, D-034).
  - **Sin vistas materializadas.** Se calcula en vivo con los índices existentes; se añadirán cuando una medición muestre que hacen falta.
- **Alternativas consideradas:** un módulo aparte con su propio formato de respuesta (duplicaba exportación y permisos); capturar una meta de ingresos en `settings` (un dato más que mantener y que nadie pidió).
- **Consecuencias / impacto:** Los tipos nuevos aparecen solos en `/reports`. Si el cliente define otra fórmula, cambia en `ExecutiveService` sin tocar el contrato. Ver [`docs/modulos/M21-reportes-ejecutivos/README.md`](docs/modulos/M21-reportes-ejecutivos/README.md).

### D-053 — Lenguaje visual plano: `appearance="flat"` del Axzy UI System
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Contexto:** La referencia visual del cliente es un tablero plano: barra lateral de alto completo con la marca arriba, barra superior blanca, tarjetas con borde fino y sin sombras, encabezados sin adornos. El UI System traía un solo aspecto («soft depth»: sombras, cristal, barra de acento) con esos detalles fijos en los componentes.
- **Decisión:**
  - **Se resuelve en el UI System, opt-in.** Dos opciones nuevas que no cambian el aspecto por defecto: `<ITThemeProvider appearance="flat">` (tarjetas, barra lateral, barra superior y encabezado de página planos) y `<ITLayout sidebarFullHeight>` (barra lateral de alto completo con la marca; la superior cubre solo el contenido).
  - **La web solo configura.** `main.tsx` fija la paleta (azul `#3056B8`, barra lateral del color del fondo, tablas neutras) con `appearance="flat" radius={10} shadow={1}`; `PrivateRoutes` activa `sidebarFullHeight`.
  - **Los componentes propios siguen el aspecto** con `useITFlatAppearance()` (`KpiTile`: sin ícono ni sombra, el tono solo tiñe la línea de contexto), así volver a `soft` es cambiar una prop.
  - **El menú se colapsa con el botón de la barra superior**, no al pasar el cursor (`expandOnHover: false`): colapsado quedan solo los iconos con el nombre en tooltip, y la preferencia se recuerda en `localStorage` (`cyc_sidebar_collapsed`). Los iconos del menú pasan a trazo fino (`react-icons/lu`).
  - **Un solo margen de contenido:** lo pone el layout y todas las páginas usan `ITPage noPadding` (antes dependía de que el contenido quedara centrado y se pegaba a la barra lateral).
- **Alternativas consideradas:** sobrescribir con CSS `!important` desde la web (frágil: los detalles eran estilos en línea del componente); un tema solo de variables (no alcanza para mover la marca ni quitar la barra de acento).
- **Consecuencias / impacto:** La web necesita la versión del UI System que publica estas opciones. Quedan fuera, por ser contenido y no estilo: el buscador global de la barra superior, la gráfica de línea y los paneles nuevos del tablero de la referencia.

### D-054 — Inicio como tablero ejecutivo: gastos (M23) y contrato ampliado del tablero
- **Fecha:** 2026-10-09
- **Estado:** aceptada
- **Contexto:** el cliente pidió rehacer el tablero de Inicio enfocado en alumnos, finanzas, rendimiento académico y operación escolar, tomando como referencia una imagen con «Ingresos vs. Gastos». El esquema no tenía modelo de egresos y el tablero de Inicio (M10) solo mostraba cuatro KPIs; el tablero ejecutivo (M21 D-052) vivía en una pantalla aparte (`/executive`) con casi los mismos indicadores.
- **Decisión:**
  - **Modelo `Expense` (M23)** con `ExpenseType` (servicios, insumos, nómina, mantenimiento, impuestos, equipo, otros) y `ExpenseStatus` (`PENDING`/`PAID`/`CANCELLED`). Baja lógica con motivo y bitácora (`EXPENSE_CREATED`/`UPDATED`/`CANCELLED`): nunca se borra la fila. Permisos `expenses.view` y `expenses.manage` (solo `ALL`; hoy solo `ADMIN`, D-034). `termId` opcional: el tablero suma los gastos del ciclo **y los que no tienen ciclo**, para que un gasto sin asignar no desaparezca de los totales.
  - **«Ingresos vs. gastos» se calcula con datos reales:** ingresos = cobrado por mes de vencimiento del cargo; gastos = monto del gasto por su fecha. Las dos series se unen en `incomeVsExpenses` (unión de meses, ceros donde falta). **No se inventan egresos**: sin captura, la serie de gastos va en cero.
  - **Un solo endpoint y una sola pantalla.** El contrato de `GET /dashboard/executive` se amplía (no se crea otro) con `movements`, `enrollmentByLevel`, `incomeVsExpenses`, `expenses`, `financialPosition`, `incomeByConcept`, `recentPayments`, `recentMovements`, `groupsByOccupancy`, `alerts` e indicadores de `attendanceRate` y `pendingDocuments`. **Inicio (`/`) lo consume y `/executive` desaparece del menú y de las rutas** (M21 y M10 se funden en una pantalla).
  - **Alertas por regla, no por umbral inventado:** cartera vencida agrupada por alumno (cargo con saldo y vencimiento anterior a hoy), **expedientes incompletos** (documentos obligatorios sin validar de alumnos inscritos) y **grupos con ocupación ≥ 80 %**. Cada bloque viene en `null` cuando no aplica; con todo en orden el panel dice que no hay pendientes.
  - **Alcance intacto:** el bloque de dinero (incluidos gastos, cartera, pagos y alertas de adeudo) exige `reports.view = ALL`; el profesor ve académico y operación de sus grupos, y nunca montos.
  - **Cálculo en vivo, sin materializar** (se mantiene D-052). Los filtros de ciclo, nivel, curso y grupo viven en Inicio.
  - **La web no hace aritmética de negocio:** el backend entrega promedios, tasas y desglosos ya resueltos; los componentes solo formatean y dibujan (dona y barras en SVG propio, sin librería de gráficas).
- **Alternativas consideradas:** posponer gastos a una fase 2 (dejaba la gráfica central de la referencia sin datos); crear un endpoint nuevo `/dashboard/home` (duplicaba contrato, tipos y pruebas frente a ampliar el existente); subir el umbral de ocupación a un `setting` (parámetro que nadie pidió y que habría que mantener).
- **Consecuencias / impacto:** Un gasto sin ciclo cuenta en los totales de cualquier ciclo. `GET /dashboard` (M10) queda como código muerto en la API y sus pruebas se movieron al contrato nuevo; `DashboardView`/`ExecutiveDashboardView` se reemplazan por un único widget. Ver [`docs/modulos/M21-reportes-ejecutivos/README.md`](docs/modulos/M21-reportes-ejecutivos/README.md).

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
| A-003 | Recargos por mora | M09 | ¿Se aplican? ¿Fórmula y periodicidad? | resuelta ([D-033](#d-033--recargos-por-mora-a-demanda-resuelve-a-003)) |
| A-004 | Almacenamiento de archivos | M06 | ¿S3 (estándar PTNV) o local? | provisional: ambos ([D-023](#d-023--almacenamiento-privado-s3-o-disco-local-resuelve-a-004-de-forma-provisional)) |
| A-005 | Anti-fraude en examen | M16 | ¿Registrar cambios de pestaña? ¿Bloquear copiar/pegar? | resuelta ([D-037](#d-037--cambios-de-pestaña-se-registran-no-se-bloquean-resuelve-a-005)) |
| A-006 | Alerta de inasistencia | M18 | ¿Umbral por defecto (80%) configurable? | resuelta ([D-042](#d-042--sesión-de-asistencia-única-vigente-y-umbral-configurable-resuelve-a-006)) |
| A-007 | Acceso de alumnos | M02/M16 | ¿Los alumnos entran al portal o solo presencial? | parcial: portal para exámenes en línea ([D-040](#d-040--portal-del-alumno-para-exámenes-en-línea-resuelve-a-007-para-m16)) |
| A-008 | Notificaciones en tiempo real | M10/M19 | ¿Ably (estándar PTNV) para el tablero? | parcial: avisos internos por Ably best-effort ([D-044](#d-044--outbox-de-notificaciones-con-reintentos-y-canales-simulados)) |

---

## Cómo registrar una nueva decisión

1. Elige el siguiente `D-###` libre (hoy: `D-055`).
2. Copia la plantilla de arriba y llénala.
3. Enlaza al documento/módulo afectado.
4. Si reemplaza a otra, actualiza el estado de la anterior.
