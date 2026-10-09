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
| `REQUIRED_FIELD` / `INVALID_CURP` / `INVALID_EMAIL` / `INVALID_PHONE` / `INVALID_DATE` | 400 | Validaciones específicas (dentro de `VALIDATION_ERROR.details`) |

### Recursos y conflictos
| `code` | HTTP | Descripción |
|---|---|---|
| `ROUTE_NOT_FOUND` | 404 | Ruta inexistente |
| `RECORD_NOT_FOUND` | 404 | Registro inexistente |
| `DUPLICATE_RECORD` | 409 | Clave única repetida |
| `DUPLICATE_CURP` | 409 | CURP ya registrada |
| `DUPLICATE_STUDENT` | 409 | Homónimo (nombre + nacimiento); se confirma con `confirmDuplicate` |
| `GUARDIAN_REQUIRED` / `MULTIPLE_PAYMENT_RESPONSIBLES` | 400 | Menor sin tutor / más de un responsable de pago |
| `STUDENT_NOT_FOUND` | 404 | Alumno inexistente o fuera de alcance |
| `STUDENT_ALREADY_ACTIVE` | 409 | Reingreso de un alumno activo |
| `REASON_NOT_AVAILABLE` | 400 | Motivo de baja inexistente o inactivo |
| `FUTURE_DATE` | 400 | Fecha futura (nacimiento, movimiento) |
| `USER_ALREADY_LINKED` | 409 | La cuenta ya está vinculada a otra persona |
| `TEACHER_NOT_FOUND` / `TEACHER_EMAIL_TAKEN` | 404 / 409 | Profesor inexistente / correo usado por profesor o cuenta |
| `TEACHER_INACTIVE` / `TEACHER_ALREADY_ACTIVE` / `INVITATION_NOT_PENDING` | 409 | Conflictos de estado del profesor |
| `FILE_REQUIRED` / `DOCUMENT_TYPE_NOT_AVAILABLE` | 400 | Subida sin archivo / tipo de documento inactivo |
| `DOCUMENT_NOT_FOUND` / `DOCUMENT_FILE_MISSING` | 404 | Documento inexistente o fuera de alcance / archivo ausente |
| `DOCUMENT_ALREADY_REVIEWED` | 409 | Validar o rechazar un documento ya revisado |
| `DUPLICATE_MATRICULA` | 409 | Matrícula repetida |
| `GROUP_FULL` | 409 | Grupo sin cupo |
| `ALREADY_ENROLLED` | 409 | Doble inscripción al mismo grupo |
| `SCHEDULE_CONFLICT` | 409 | Empalme de horario |
| `STUDENT_INACTIVE` | 409 | Alumno en baja |
| `COURSE_NOT_FOUND` / `GROUP_NOT_FOUND` / `ENROLLMENT_NOT_FOUND` / `TERM_NOT_FOUND` | 404 (400 si viene en el body) | Curso, grupo, inscripción o ciclo inexistente o fuera de alcance |
| `COURSE_CLAVE_TAKEN` / `GROUP_NAME_TAKEN` | 409 | Clave de curso repetida / nombre de grupo repetido en el mismo curso y ciclo |
| `COURSE_INACTIVE` / `GROUP_INACTIVE` / `COURSE_ALREADY_ACTIVE` / `GROUP_ALREADY_ACTIVE` | 409 | Conflictos de estado de cursos y grupos |
| `LEVEL_NOT_AVAILABLE` | 400 | Nivel del curso inexistente o inactivo |
| `CUPO_BELOW_ENROLLED` / `GROUP_HAS_ENROLLMENTS` | 409 | Cupo menor que los inscritos / desactivar un grupo con inscritos |
| `GROUP_CLOSED` | 409 | El grupo ya cerró calificaciones: no cambia (captura, instrumentos, inscripciones) |
| `ENROLLMENT_NOT_ACTIVE` | 409 | Baja o cambio de una inscripción que no está vigente |
| `GROUP_CHANGE_INVALID` | 400 | El destino no es otro grupo del mismo curso y ciclo |
| `ASSESSMENT_NOT_FOUND` / `ASSESSMENT_INACTIVE` | 404 / 409 | Instrumento inexistente o desactivado |
| `WEIGHTS_EXCEED_100` | 409 | Crear/editar haría que las ponderaciones activas pasen de 100% |
| `WEIGHTS_NOT_100` | 409 | Cerrar con ponderaciones del grupo ≠ 100% |
| `ASSESSMENTS_REQUIRED` / `GRADES_INCOMPLETE` | 409 | Cerrar sin instrumentos / con calificaciones faltantes |
| `SCORE_OUT_OF_RANGE` | 400 | Calificación fuera de `[0, max_score]` |
| `MAX_SCORE_BELOW_CAPTURED` | 409 | Bajar el máximo por debajo de calificaciones ya capturadas |
| `ENROLLMENT_NOT_IN_GROUP` / `NOT_ENROLLED` | 400 / 409 | Captura para una inscripción de otro grupo / no vigente |
| `EXAM_NOT_AVAILABLE` | 409 | Examen fuera de ventana / sin intentos |
| `EXAM_PUBLISHED_LOCKED` | 409 | No editable con intentos iniciados |
| `FILE_TYPE_NOT_ALLOWED` / `FILE_TOO_LARGE` | 400 | Validación de archivos |
| `CHARGE_ALREADY_PAID` | 409 | Cargo pagado/cancelado: no admite pagos |
| `CHARGE_NOT_FOUND` / `PAYMENT_NOT_FOUND` / `FEE_CONCEPT_NOT_FOUND` | 404 (400 si viene en el body) | Cargo, pago o concepto inexistente o fuera de alcance |
| `CHARGE_ALREADY_CANCELLED` / `PAYMENT_ALREADY_CANCELLED` | 409 | Cancelar dos veces |
| `CHARGE_HAS_PAYMENTS` | 409 | Cancelar un cargo con pagos vigentes |
| `DISCOUNT_EXCEEDS_AMOUNT` | 400 | Descuento mayor al monto |
| `PAYMENT_EXCEEDS_BALANCE` | 400 | Pago mayor al saldo (`details.saldo`) |
| `FEE_CONCEPT_NAME_TAKEN` / `FEE_CONCEPT_INACTIVE` / `FEE_CONCEPT_ALREADY_ACTIVE` / `FEE_CONCEPT_RESERVED` | 409 | Conflictos de conceptos (el de recargos es del sistema) |
| `GENERATION_TARGET_REQUIRED` | 400 | Generación masiva sin grupo (`scope=group`) o ciclo (`scope=term`) |
| `LATE_FEES_DISABLED` | 409 | `LATE_FEE.enabled = false` |
| `INVALID_IDEMPOTENCY_KEY` | 400 | `Idempotency-Key` fuera de `^[A-Za-z0-9_-]{8,100}$` |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Clave usada por otra persona u operación |
| `REPORT_NOT_FOUND` | 404 | Tipo de reporte desconocido (incluye `attendance-list` hasta M18) |
| `REPORT_FORMAT_INVALID` | 400 | `format` distinto de `json`, `xlsx` o `pdf` |
| `REPORT_REQUIRES_FULL_SCOPE` | 403 | Reporte con montos sin alcance ALL |
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
