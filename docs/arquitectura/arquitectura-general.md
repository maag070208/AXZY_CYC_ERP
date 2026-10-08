# Arquitectura general

Vista de componentes y flujos del SGE, con el **estándar PTNV**: API Express
modular + web React con Feature-Sliced Design + Axzy UI System.

## 1. Vista de componentes

```
┌────────────────────────────────────────────────────────────────────┐
│                        Cliente (navegador)                          │
│  React 19 + Vite + Redux Toolkit + React Router (Hash) + Tailwind   │
│  Axzy UI System (ITLayout · ITPage · ITDataTable · ITFormBuilder)   │
│  Electron (escritorio opcional) · i18next (es)                      │
└───────────────┬────────────────────────────────────────────────────┘
                │ HTTPS · JSON · JWT Bearer (access + refresh)
┌───────────────▼────────────────────────────────────────────────────┐
│                    API (Express + TypeScript)                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ src/core/  config · middlewares · permissions · policies        │ │
│  │            services (mail, storage/S3, ably) · swagger · i18n   │ │
│  │            utils (table, security, logger) · db                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ src/modules/<dominio>/  routes · controllers · services ·       │ │
│  │            models/{dto,entity} · mappers                       │ │
│  │  auth · users · permissions · audit · students · teachers · …  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  Montaje y wiring DIP en src/modules/api.router.ts (/api/v1)        │
└───┬───────────────┬───────────────────┬───────────────┬─────────────┘
    │               │                   │               │
┌───▼───────┐ ┌─────▼──────┐    ┌───────▼───────┐ ┌────▼──────────┐
│PostgreSQL │ │ Redis      │    │ AWS S3        │ │ Resend / SMTP │
│(Prisma)   │ │/BullMQ     │    │ (expedientes) │ │ Ably (realtime)│
└───────────┘ └────────────┘    └───────────────┘ └───────────────┘
```

## 2. Capas del backend

| Capa | Responsabilidad | Ubicación |
|---|---|---|
| **Presentación** | HTTP, validación Zod, serialización | `modules/*/controllers` + `routes` |
| **Aplicación** | Casos de uso y reglas de negocio | `modules/*/services` |
| **Dominio** | Tipos puros e invariantes | `modules/*/models/entity` |
| **Infraestructura** | Prisma, S3, correo, Ably | `core/services`, `core/config` |
| **Transversal** | Auth/RBAC/ABAC, bitácora, errores, i18n, logging | `core/*` |

Las reglas de negocio viven en **services**, no en controllers. Cada regla
numerada en un módulo debe mapear a una prueba.

## 3. Flujos clave

### 3.1 Petición autenticada
1. La web inyecta `Authorization: Bearer <access>` (desde el store vía `setSessionHooks`).
2. `authenticate` valida el JWT y **relee la BD**: usuario activo, rol(es), departamento y excepciones frescas.
3. `requiresPermission("recurso.acción")` verifica el alcance (`NONE/OWN/AREA/ALL`); un 403 se audita como `ACCESS_DENIED`.
4. Las **políticas ABAC** (`evaluateActionPolicies`) pueden confirmar o denegar según contexto.
5. El controller valida el body con Zod y llama al servicio.
6. El servicio aplica reglas, persiste (a veces en transacción), registra bitácora con `previousState`/`newState`.
7. Los errores pasan por `errorMiddleware` → envelope plano `{ error, code, message, details }`.

### 3.2 Listado (tabla server-side)
1. La web envía `POST /…/query` con `{ page, limit, filters, sort }` (fechas en rango ISO con zona local).
2. El servicio arma `where` (alcance RBAC en `AND`) y `orderBy` con helpers validados.
3. `paginatedQuery` corre `count` + `findMany` y devuelve `{ data, total, … }`.

### 3.3 Cálculo de kardex (M06/M08/M17)
1. Se capturan `Grade` por `Assessment`.
2. Al cerrar el grupo se calcula la calificación final ponderada por alumno.
3. Se actualiza el estatus de `Enrollment` (`acreditado`/`reprobado`).
4. `Kardex` es una **vista calculada** (no persistida), servida por endpoint y exportable a PDF.

### 3.4 Examen en línea (M14–M17)
1. El profesor arma y publica un `OnlineExam` vinculado a un `Assessment`.
2. El alumno inicia un `ExamAttempt`; el servidor controla el tiempo.
3. Las respuestas se guardan automáticamente (`AttemptAnswer`).
4. Al enviar: calificación automática de cerradas; las abiertas quedan en revisión.
5. El puntaje se escribe como `Grade` en el `Assessment` vinculado.

### 3.5 Notificaciones asíncronas (M19)
1. Un evento encola un registro `PENDING` en `email_logs`/`notifications` (patrón outbox).
2. Un worker drena con reintentos y backoff.
3. El proveedor (Resend/SMTP; SMS/WhatsApp por definir) se invoca tras una interfaz común.
4. El resultado se persiste (`SENT`/`FAILED`).
5. Los eventos en vivo viajan por **Ably** (canales `user:<id>`, `dashboard`, etc.).

## 4. Decisiones de arquitectura

- **Modularidad por dominio:** cada módulo es autocontenido y se cablea por DIP en `api.router.ts`.
- **RBAC + ABAC dinámicos:** catálogo, roles y políticas en BD, con cache en memoria y **fail-closed**.
- **Bitácora como puerto:** los módulos registran vía `AuditPort`, atable a la transacción.
- **Errores planos y traducibles:** un solo formato, códigos estables.
- **Tablas server-side:** contrato único `POST …/query` para listados densos.
- **UI kit propio:** consistencia visual y de comportamiento en todas las pantallas.

Ver [D-001 … D-017](../../DECISIONES.md), [api-modular.md](api-modular.md) y
[web-fsd.md](web-fsd.md).
