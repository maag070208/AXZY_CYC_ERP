# Catálogo de errores

Envelope **plano** (estándar PTNV):
```json
{
  "error": "ValidationError",
  "code": "VALIDATION_ERROR",
  "message": "El correo ya está registrado.",
  "details": [ { "field": "email", "message": "DUPLICATE_RECORD" } ]
}
```

- `error`: clase del error (`ValidationError`, `HttpError`, `NotFoundError`, …).
- `code`: identificador estable `UPPER_SNAKE`, traducible.
- `message`: texto legible (traducido según `Accept-Language` / idioma del sistema).
- `details`: detalle opcional (Zod por campo, u objeto del dominio).

## HTTP y origen

| HTTP | Se produce cuando |
|---|---|
| 400 | `ZodError` (`VALIDATION_ERROR`), body JSON malformado (`INVALID_BODY`), filtro inválido (`INVALID_FILTER`) |
| 401 | Token ausente/inválido/expirado, sesión inválida, cuenta desactivada |
| 403 | Sin permiso/alcance, política ABAC lo niega |
| 404 | Recurso o ruta inexistente |
| 409 | Duplicado (`DUPLICATE_RECORD`), conflicto de estado (cupo, empalme, carrera) |
| 429 | Rate limiting / bloqueo por intentos |
| 500 | Error no controlado (`INTERNAL_ERROR`) |
| 503 | Dependencia no disponible (S3, BD no lista) |

## Mapeo de errores Prisma (automático)

| Prisma | HTTP | `code` |
|---|---|---|
| P2002 | 409 | `DUPLICATE_RECORD` |
| P2025 | 404 | `RECORD_NOT_FOUND` |
| P2003 | 400 | `INVALID_REFERENCE` |
| otro | 500 | `DATABASE_ERROR` |

## Códigos de aplicación

### Autenticación (M02)
| `code` | HTTP | Descripción |
|---|---|---|
| `TOKEN_MISSING` | 401 | Falta la cabecera Authorization |
| `INVALID_AUTHORIZATION_HEADER` | 401 | Cabecera malformada |
| `INVALID_TOKEN` | 401 | Access token inválido/expirado |
| `INVALID_SESSION` | 401 | Usuario inexistente/inactivo |
| `INVALID_CREDENTIALS` | 401 | Usuario o contraseña incorrectos |
| `ACCOUNT_DEACTIVATED` | 401 | Cuenta desactivada |
| `ACCOUNT_LOCKED` | 429 | Bloqueo temporal por intentos |
| `RESET_TOKEN_INVALID` | 422 | Token de recuperación inválido/expirado/usado |
| `CURRENT_PASSWORD_INVALID` | 422 | Cambio de contraseña con la actual incorrecta |
| `PASSWORD_REUSED` | 422 | La contraseña nueva es igual a la actual |
| `USER_NOT_LOCKED` | 409 | Desbloqueo de una cuenta que no está bloqueada |

### Autorización
| `code` | HTTP | Descripción |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Endpoint protegido sin sesión |
| `INSUFFICIENT_PERMISSIONS` | 403 | Sin permiso o alcance NONE |
| `POLICY_DENIED` | 403 | Política ABAC denegó (se audita como `ACCESS_DENIED`) |
| `POLICY_ACTION_UNKNOWN` / `POLICY_FIELD_UNKNOWN` | 400 | La política apunta a una acción o campo no registrado |
| `POLICY_KEY_TAKEN` | 409 | Clave de política repetida |
| `CANNOT_CHANGE_OWN_PERMISSIONS` | 409 | No puede alterar sus propios permisos |

### Validación y datos
| `code` | HTTP | Descripción |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Regla de validación Zod |
| `INVALID_BODY` | 400 | Cuerpo malformado |
| `INVALID_FILTER` | 400 | Valor de filtro no admitido por la columna |
| `INVALID_RANGE` | 400 | Rango de fechas invertido |
| `INVALID_IDEMPOTENCY_KEY` | 400 | `Idempotency-Key` con formato inválido |
| `REQUIRED_FIELD` / `INVALID_CURP` / `INVALID_EMAIL` / `INVALID_FORMAT` | 400 | Validaciones específicas |

### Recursos y conflictos
| `code` | HTTP | Descripción |
|---|---|---|
| `ROUTE_NOT_FOUND` | 404 | Ruta inexistente |
| `RECORD_NOT_FOUND` | 404 | Registro inexistente |
| `DUPLICATE_RECORD` | 409 | Clave única repetida |
| `DUPLICATE_CURP` | 409 | CURP ya registrada |
| `DUPLICATE_MATRICULA` | 409 | Matrícula repetida |
| `GROUP_FULL` | 409 | Grupo sin cupo |
| `ALREADY_ENROLLED` | 409 | Doble inscripción al mismo grupo |
| `SCHEDULE_CONFLICT` | 409 | Empalme de horario |
| `STUDENT_INACTIVE` | 409 | Alumno en baja |
| `WEIGHTS_NOT_100` | 409 | Ponderaciones del grupo ≠ 100% |
| `SCORE_OUT_OF_RANGE` | 400 | Calificación fuera de `[0, max_score]` |
| `EXAM_NOT_AVAILABLE` | 409 | Examen fuera de ventana / sin intentos |
| `EXAM_PUBLISHED_LOCKED` | 409 | No editable con intentos iniciados |
| `FILE_TYPE_NOT_ALLOWED` / `FILE_TOO_LARGE` | 400 | Validación de archivos |
| `CHARGE_ALREADY_PAID` | 409 | Cargo pagado/cancelado |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Clave usada por otro usuario |
| `CONCURRENT_UPDATE` | 409 | Choque en transacción serializable |
| `STORAGE_NOT_CONFIGURED` | 503 | S3 no configurado |
| `SETTING_UNKNOWN` / `SETTING_INVALID` / `SETTINGS_REQUIRED` | 400 | `PUT /settings` con clave desconocida, valor inválido o vacío (todo o nada) |
| `CATALOG_ITEM_NOT_FOUND` | 404 | Registro de catálogo M11 inexistente |
| `CATALOG_ITEM_ALREADY_INACTIVE` | 409 | Desactivar un registro ya inactivo |
| `TERM_DATES_INVALID` | 400 | Ciclo con inicio posterior al fin |
| `TERM_ALREADY_ACTIVE` | 409 | Activar el ciclo que ya es el activo |
| `RATE_LIMITED` | 429 | Demasiadas peticiones |
| `INTERNAL_ERROR` / `DATABASE_ERROR` | 500 | Error no controlado |

> Política: nunca incluir stack traces, SQL ni nombres internos en `message`/`details`
> en producción. Los códigos viven en `core/i18n/messages/{es,en}`.
