# API modular (Express + TypeScript)

Patrón de organización del backend, igual que PTNV: `src/core` para lo
transversal y `src/modules/<dominio>` para el negocio.

## 1. Estructura de un módulo

```
src/modules/students/
├── index.ts                      # factory createStudentModule(...) — wiring DIP
├── routes/students.routes.ts     # endpoints + requiresPermission + Swagger
├── controllers/students.controller.ts
├── services/students.service.ts
├── models/
│   ├── dto/students.dto.ts       # esquemas Zod + .openapi(...)
│   └── entity/students.entity.ts # interfaces TS puras
└── mappers/students.mapper.ts    # Prisma row → entity (si aplica)
```

### Responsabilidades
| Capa | Hace | No hace |
|---|---|---|
| `routes` | define endpoints, aplica `authenticate` + `requiresPermission`, registra OpenAPI, monta multer | lógica de negocio |
| `controllers` | valida el body con Zod (`Schema.parse`), lee `req.user`, responde JSON | Prisma |
| `services` | reglas, Prisma, transacciones, alcance por registro, bitácora, correo | HTTP |
| `models/dto` | esquemas Zod + `.openapi("Name")` + `registry.register` | efectos |
| `models/entity` | tipos de dominio puros | — |

## 2. Registro y montaje

`src/app.ts` monta el router raíz:
```ts
app.use("/api/v1", languageMiddleware, apiRouter);
```

`src/modules/api.router.ts` instancia cada módulo y hace el **wiring DIP**
(puertos, no imports cruzados):
```ts
const { router: auditRouter, service: auditService } = createAuditModule();
const auditPort = { createLog: (...args) => auditService.createLog(...args) };

apiRouter.use("/auth", createAuthModule().router);
apiRouter.use("/users", createUserModule(auditPort, notificationPort));
apiRouter.use("/audit", auditRouter);
// /health (liveness) y /health/ready (SELECT 1, 503 si falla)
```

Ejemplo de endpoint:
```ts
router.use(authenticate);
router.get("/", requiresPermission("students.view"), asyncHandler(controller.list));
router.post("/", requiresPermission("students.create"), asyncHandler(controller.create));
router.post("/query", requiresPermission("students.view"), asyncHandler(controller.query));
```
Las rutas públicas se declaran **antes** de `router.use(authenticate)`. Todo
handler async va envuelto en `asyncHandler`.

## 3. Validación con Zod

En `models/dto`, importando `{ z, registry } from "@core/swagger/registry"`:
```ts
export const CreateStudentSchema = z.object({
  firstNames: z.string().min(1, "REQUIRED_FIELD"),
  curp: z.string().length(18, "INVALID_CURP"),
  // ...
}).openapi("CreateStudent");
registry.register("CreateStudent", CreateStudentSchema);
```
El controller hace `const input = CreateStudentSchema.parse(req.body)`; un
`ZodError` escala al `errorMiddleware` → 400 `VALIDATION_ERROR` con `details`.

## 4. Errores

Envelope **plano** `{ error, code, message, details }`. Lanzar con:
```ts
throw new HttpError(409, "GROUP_FULL", { group: id });
```
El `errorMiddleware` traduce `code`/`message` según el idioma y mapea errores
Prisma conocidos (P2002→409 `DUPLICATE_RECORD`, P2025→404 `RECORD_NOT_FOUND`, …).
Ver [`../api/errores.md`](../api/errores.md).

## 5. Tablas server-side

Helpers en `@core/utils/table.ts`: `parseTableParams`, `ci`, `orderByOf`,
`filterId`/`filterEnum`/`filterText`/`filterBool`/`filterDateRange`/`filterDayRange`;
`paginatedQuery` en `@core/db/table.ts`. El alcance RBAC va en `AND` para que
ningún filtro lo amplíe. Ver [`../api/convenciones.md`](../api/convenciones.md).

## 6. Bitácora (AuditPort)

```ts
await this.audit?.({
  action: "STUDENT_CREATED", entityType: "Student", entityId: id,
  userId: actorId, previousState, newState, metadata,
}, tx); // tx opcional: ata el log a la transacción
```

## 7. Idempotencia

```ts
const key = parseIdempotencyKey(req); // ^[A-Za-z0-9_-]{8,100}$
```
Se persiste (columna única o `idempotency_records` con la respuesta); repetir
devuelve el resultado previo y reusar la clave con otra persona u operación
responde 409 `IDEMPOTENCY_KEY_REUSED`.

## 8. OpenAPI

Cada endpoint se documenta con `registerPath({ method, path, tags, security, request, responses })`
en `*.routes.ts`; el documento se arma con `OpenApiGeneratorV3` y se sirve en
`/docs` (UI) y `/docs/json`.

## 9. i18n

`core/i18n` (mensajes `es`/`en`) con `AsyncLocalStorage`; `t(key, params)`,
`translateValidation`. El idioma del sistema sale de `settings.LANGUAGE` y se
puede sobreescribir con `Accept-Language`. Las llaves de `en.ts` se tipan contra
`es.ts`, así que no pueden desalinearse. Ningún texto visible se escribe en el
código: errores, correos, encabezados de exportación y etiquetas de reportes
salen del catálogo.
