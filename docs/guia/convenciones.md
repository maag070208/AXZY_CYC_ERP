# Estándares y convenciones generales

Reglas transversales del SGE. Reflejan los **estándares de la casa (PTNV)** y el
**Axzy UI System**. Si una excepción es necesaria, se documenta en
[`../../DECISIONES.md`](../../DECISIONES.md).

> Fuentes de verdad: [`../arquitectura/stack.md`](../arquitectura/stack.md),
> [`../arquitectura/estructura-repositorio.md`](../arquitectura/estructura-repositorio.md),
> [`../api/convenciones.md`](../api/convenciones.md),
> [`../seguridad/roles-permisos.md`](../seguridad/roles-permisos.md).

## 1. Repositorios y paquetes

- `api/` y `web/` son **repos git independientes**; la raíz solo tiene
  `docker-compose.yml` y `docs/`. Build y commit por separado.
- Gestor de paquetes: **pnpm** (`pnpm-lock.yaml`). No agregar
  `package-lock.json` ni `yarn.lock`.
- Node LTS; TypeScript estricto.
- Path aliases (preferidos sobre rutas relativas):
  - API: `@src/*` → `src/*`, `@core/*` → `src/core/*`, `@modules/*` → `src/modules/*`.
  - Web: `@app`, `@shared`, `@entities`, `@features`, `@widgets`, `@pages`.

## 2. API (Express + TypeScript)

- Prefijo `/api/v1`; respuestas JSON.
- Un módulo = carpeta bajo `src/modules/<modulo>/` con
  `routes/ · controllers/ · services/ · models/{dto,entity}/` (y `mappers/` si aplica).
- **Capas:** `routes` (endpoints + `requiresPermission` + Swagger), `controllers`
  (valida Zod, responde), `services` (reglas + Prisma + alcance), `models/dto`
  (Zod + OpenAPI), `models/entity` (tipos puros).
- Montaje y **wiring DIP** en `src/modules/api.router.ts` (puertos de auditoría,
  notificaciones, sys-config; sin imports cruzados entre módulos).
- Todo handler async envuelto en `asyncHandler`.
- Validación de entrada con **Zod** en el controller (whitelist estricta).
- Errores: envelope **plano** `{ error, code, message, details }` con `code`
  UPPER_SNAKE traducible → ver [`../api/errores.md`](../api/errores.md).
- OpenAPI documentado en el propio `*.routes.ts` con `registerPath`.
- Listados server-side: **`POST /…/query`** con `{ page, limit, filters, sort }`.
- Escrituras no idempotentes aceptan `Idempotency-Key`.
- Toda escritura pasa por el **`AuditPort`** con `previousState`/`newState`.

## 3. Base de datos (Prisma + PostgreSQL)

- `id String @id @default(uuid())` (o clave natural `key` en catálogos).
- `createdAt DateTime @default(now())`; `updatedAt DateTime @updatedAt`.
- `active Boolean @default(true)` para catálogos/entidades desactivables.
- Borrado lógico **por dominio** (`deletedAt`, `cancelledAt`, `voidedAt`); nunca
  `DELETE` físico de datos de negocio (ver [D-003](../../DECISIONES.md)).
- Campos `camelCase`; tablas `snake_case` plural vía `@@map("...")`.
- Enums PascalCase con valores `UPPER_SNAKE`.
- **Idioma:** identificadores, columnas, enums y claves en **inglés**; comentarios
  en español (ver [D-046](../../DECISIONES.md) y [`convenciones.md` §11](../guia/convenciones.md)).
- Dinero/medidas con `Decimal @db.Decimal(...)`; nunca punto flotante.
- JSON en `Json`/`jsonb` (snapshots de bitácora, respuestas, horarios).
- Fechas de calendario con `@db.Date`; instantes con `timestamptz` (UTC).
- Índices `@@index` en FKs y campos de filtro; `@@unique` para claves de negocio;
  índices únicos parciales y CHECKs que Prisma no modela se agregan en migración SQL.

## 4. Autorización (RBAC + ABAC)

- Permisos como `recurso.acción` (`students.create`), catálogo en BD.
- Alcances `NONE < OWN < AREA < ALL`; la unión de roles toma el **alcance mayor**.
- Excepciones por persona (`user_permissions`, con vigencia) y políticas ABAC
  (`policies`, primera regla que casa por prioridad; sin coincidencia → allow).
- **Fail-closed**: sin catálogo/matriz cargada, todo es `NONE`.
- El alcance por dato se aplica en la consulta (`AND`), nunca en el cliente.

## 5. Web (React + FSD)

- Feature-Sliced Design con límites **forzados por ESLint**
  (`eslint-plugin-boundaries`, `default: disallow`):
  `app → shared/entities/features/widgets/pages`; `shared` es hoja; `entities` usa
  `shared`; `features` usa `app`(solo tipos `RootState`/`AppDispatch`),
  `entities`, `shared`; `widgets` usa `features` y hacia abajo; `pages` puede todo.
- Cliente Axios único (`@shared/api/client`) con inyección de Bearer por hooks de
  sesión y refresh single-flight + auto-logout en 401.
- Tablas con `ITDataTable` y `tableRequest`/`tableQuery`; client-side con
  `makeClientTableFetch`.
- Estado global Redux solo para lo transversal (auth, toast, notificaciones); el
  resto con API + hooks por feature.
- Router **HashRouter**; todas las rutas tras `PrivateRoutes`; gate por
  `<RequiresPermission>` y `usePermission`.
- i18n con `i18next` (namespaces por dominio); validación con
  `@shared/validation` (validadores puros que devuelven `string | null`).
- Contexto no seguro: usar `newId()` (no `crypto.randomUUID` directo).
- Entry point real: `src/app/main.tsx`.

## 6. UI (Axzy UI System)

- Solo componentes `IT*` de `@axzydev/axzy_ui_system` + Tailwind v4.
- CSS del kit importado **por capas**:
  `@layer theme, base, axzy-ui-system, components, utilities;` y
  `@import "@axzydev/axzy_ui_system/dist/index.css" layer(axzy-ui-system);`.
- Envolver con `ITThemeProvider`; dark mode en `localStorage["it-theme-dark-mode"]`.
- Layout `ITLayout` + `ITPage`; secciones con `PanelCard`; KPIs con `KpiTile`.
- Por el kit sin capa, se usa el `!` de Tailwind para sobreescribir utilidades.
- Ver [`../arquitectura/axzy-ui-system.md`](../arquitectura/axzy-ui-system.md).

## 7. Pruebas

- **Playwright** en ambos paquetes: `tests/unit` (lógica) y `tests/e2e` (contrato
  o navegador contra servicios reales).
- Regla de trabajo: **correr solo el spec del cambio**, nunca la suite completa.
- Aislamiento por prefijo `E2E`; la API es dueña de la BD y expone
  `test:e2e:provision`/`test:e2e:clean`.
- Cobertura objetivo ≥ 70% en lógica de servicios/reglas.

## 8. Entrega por módulo

Cada módulo entrega: **migración, módulo API (routes/controller/service/dto/entity),
pantallas web (entity/feature/page con UI kit), pruebas y README** siguiendo la
[plantilla](../plantillas/plantilla-modulo.md). Nada se considera terminado sin
criterios de aceptación y pruebas del spec correspondiente.

## 9. Fechas, dinero y secretos

- API: ISO 8601 en UTC; web: conversión a zona local (`America/Mexico_City` por
  defecto). Filtros de fecha viajan como rango ISO **con zona local**.
- Montos como `Decimal`; en API se serializan como número decimal.
- Variables sensibles solo en `.env` (nunca versionado; `.env.example` documenta).

## 10. Documentación y commits

- Documentación en **español**, Markdown, en `docs/`.
- Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
  Ej.: `feat(students): alta con validación de CURP`.
- Cada módulo documenta sus decisiones abiertas y enlaza a `DECISIONES.md`.

## 11. Idioma, identificadores e i18n

**Regla (ver [D-046](../../DECISIONES.md)):** **todo el código en inglés, los
comentarios en español y todo lo visible vía i18n** (API y WEB).

### 11.1 Identificadores en inglés
- Nombres de **variables, funciones, clases, tipos, enums, modelos Prisma,
  columnas, DTOs, rutas, permisos y claves** en **inglés**.
- Valores de enum en `UPPER_SNAKE` **en inglés** (`ACTIVE`, `INACTIVE`,
  `ENROLLED`, `PENDING`, `TUITION`, `CASH`, `MONTHLY`…).
- Prisma: campos `camelCase` en inglés, tablas `snake_case` plural.
- Comentarios y documentación (`docs/`) en **español**.
- Los identificadores existentes en español se migran a inglés (refactor
  transversal, [D-046](../../DECISIONES.md)); el código **nuevo** nace en inglés.

### 11.2 i18n (todo lo visible se traduce)
- **API**: mensajes de error, validaciones y etiquetas de catálogo salen por
  `i18n` (`src/core/i18n/messages/{es,en}`) a partir de `Accept-Language`. Las
  claves de error son códigos (`STUDENT_NOT_FOUND`), nunca texto.
- **WEB**: namespaces de `i18next` por dominio (`students`, `finance`,
  `programs`…); **cero texto hardcodeado**. Los catálogos dinámicos (roles,
  niveles, permisos) se muestran por **clave + i18n**, no por un `name` en la BD.
- **Roles**: claves en inglés `ADMIN`, `SCHOOL_CONTROL`, `TEACHER`, `STUDENT`;
  el nombre visible se traduce por i18n (`roles.ADMIN`, `roles.TEACHER`…).
- Fechas/montos se formatean por locale en la web; la API entrega ISO/Decimal.
