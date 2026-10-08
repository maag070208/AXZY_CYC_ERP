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
| A-002 | Regla de aprobación | M08 | ¿Umbral 70 configurable por nivel/ciclo? | abierta |
| A-003 | Recargos por mora | M09 | ¿Se aplican? ¿Fórmula y periodicidad? | abierta |
| A-004 | Almacenamiento de archivos | M06 | ¿S3 (estándar PTNV) o local? | abierta |
| A-005 | Anti-fraude en examen | M16 | ¿Registrar cambios de pestaña? ¿Bloquear copiar/pegar? | abierta |
| A-006 | Alerta de inasistencia | M18 | ¿Umbral por defecto (80%) configurable? | abierta |
| A-007 | Acceso de alumnos | M02/M16 | ¿Los alumnos entran al portal o solo presencial? | abierta |
| A-008 | Notificaciones en tiempo real | M10/M19 | ¿Ably (estándar PTNV) para el tablero? | abierta |

---

## Cómo registrar una nueva decisión

1. Elige el siguiente `D-###` libre (hoy: `D-018`).
2. Copia la plantilla de arriba y llénala.
3. Enlaza al documento/módulo afectado.
4. Si reemplaza a otra, actualiza el estado de la anterior.
