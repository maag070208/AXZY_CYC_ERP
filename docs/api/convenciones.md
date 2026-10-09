# Convenciones de API

API REST con prefijo **`/api/v1`** y respuestas **JSON**, al estilo PTNV
(Express + Zod + Prisma).

## 1. Recursos y rutas

- Sustantivos en plural, `kebab-case`: `/students`, `/fee-concepts`, `/online-exams`.
- Subrecursos anidados: `/students/:id/documents`, `/groups/:id/enroll`, `/students/:id/kardex`.
- Acciones no-CRUD como segmento: `/students/:id/withdrawal`, `/online-exams/:id/publish`.
- **Listados** de tabla: `POST /<recurso>/query` (ver §3).

| Método | Uso |
|---|---|
| `GET` | Detalle |
| `POST` | Crear / ejecutar acción / consultar tabla (`/query`) |
| `PATCH` | Actualización parcial |
| `PUT` | Reemplazo total (p. ej. `PUT /settings`) |
| `DELETE` | Baja lógica / cancelación |

## 2. Formato de respuesta

- Detalle y mutaciones devuelven el recurso (o un envoltorio propio del endpoint).
- Errores con envelope **plano** (ver [`errores.md`](errores.md)):
  ```json
  { "error": "ValidationError", "code": "VALIDATION_ERROR", "message": "…", "details": [] }
  ```
- Sin contenido: `204 No Content`.

## 3. Tablas server-side (contrato ITDataTable)

Los listados densos **no** usan `?page=&limit=`: usan **POST** para poder enviar
filtros complejos.

**Request** `POST /api/v1/students/query`
```json
{
  "page": 1,
  "limit": 20,
  "filters": { "status": "ACTIVE", "firstNames": "juan", "enrollment_date": ["2026-01-01T00:00:00.000-06:00", "2026-06-30T23:59:59.999-06:00"] },
  "sort": { "key": "firstNames", "direction": "asc" }
}
```

**Response**
```json
{
  "data": [ { "…": "…" } ],
  "total": 137,
  "page": 1,
  "pageIndex": 0,
  "totalPages": 7,
  "totalCount": 137,
  "limit": 20,
  "hasPreviousPage": false,
  "hasNextPage": true
}
```

Reglas:
- `limit` por defecto 10, tope **200** (`TABLE_DEFAULT_LIMIT` / `TABLE_MAX_LIMIT`).
- Cada filtro se lee con un lector validado; un valor que la columna no admite
  es 400 `INVALID_FILTER` (rango invertido: `INVALID_RANGE`), nunca 500.
- El **alcance RBAC** va en `AND` para que ningún filtro lo amplíe.
- Fechas: la web envía rango ISO **con zona local**; la API usa
  `filterDateRange` (instantes) o `filterDayRange` (`@db.Date`, sin correr a UTC).
- Helpers: API `parseTableParams`/`ci`/`orderByOf`/`filter*`/`paginatedQuery`;
  web `tableRequest`/`tableQuery`/`makeClientTableFetch`.

## 4. Idempotencia

`POST` con riesgo de duplicado (`/charges/generate`, `/payments`,
`/questions/import`, importaciones M20) acepta la cabecera `Idempotency-Key`
(`^[A-Za-z0-9_-]{8,100}$`). Repetir la petición devuelve el mismo resultado;
reusar la clave con otro usuario responde 409 `IDEMPOTENCY_KEY_REUSED`.

## 5. Autenticación

`Authorization: Bearer <access_token>` en endpoints protegidos. Ver
[`autenticacion.md`](autenticacion.md). El JWT solo identifica: rol, permisos y
alcance se releen de la BD en cada petición.

## 6. Validación

- DTOs con **Zod** en `models/dto`; whitelist estricta.
- Mensajes de error son **códigos** de negocio traducibles (p. ej. `INVALID_CURP`).
- `ZodError` → 400 `VALIDATION_ERROR` con `details` por campo.

## 7. Fechas, montos y enums

- Fechas/hora en ISO 8601 UTC; solo-fecha `YYYY-MM-DD`; filtros como rango local.
- Montos `Decimal` serializados como número decimal.
- Enums en `UPPER_SNAKE` (`ACTIVE`, `PARTIAL`, …).

## 8. Documentación y versionado

- OpenAPI generado con `zod-to-openapi`; UI en `/docs`, JSON en `/docs/json`.
- Cambios incompatibles → nuevo prefijo (`/api/v2`).
- `/health` (liveness, sin BD) y `/health/ready` (chequeo de BD, 503 si falla).
