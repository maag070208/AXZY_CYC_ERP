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
| 429 | Bloqueo por intentos fallidos (`ACCOUNT_LOCKED`) o límite de peticiones por IP (`RATE_LIMITED`) |
| 500 | Error no controlado (`INTERNAL_ERROR`) |
| 503 | Dependencia no disponible (almacenamiento sin configurar, BD no lista) |

## Mapeo de errores Prisma (automático)

| Prisma | HTTP | `code` |
|---|---|---|
| P2002 | 409 | `DUPLICATE_RECORD` |
| P2025 | 404 | `RECORD_NOT_FOUND` |
| P2003 | 400 | `INVALID_REFERENCE` |
| otro | 500 | `DATABASE_ERROR` |

## Códigos de aplicación

Generado desde `api/src/core/i18n/messages/es.ts` (texto en español; el inglés vive en
`en.ts` con las mismas llaves) y de los `HttpError` del código. `{{…}}` son los
parámetros que acompañan al error en `details`.

### Genéricos
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `ROUTE_NOT_FOUND` | 404 | No existe la ruta {{method}} {{path}} |
| `RECORD_NOT_FOUND` | — | Registro no encontrado |
| `DUPLICATE_RECORD` | — | Ya existe un registro con esos datos (duplicado) |
| `INVALID_REFERENCE` | 400 | Referencia inválida: dependencia de otro registro |
| `DATABASE_ERROR` | — | Error de base de datos |
| `INTERNAL_ERROR` | 500 | Error interno del servidor |
| `VALIDATION_ERROR` | 400 | Los datos enviados no son válidos |
| `INVALID_BODY` | 400 | Body inválido |
| `INVALID_FILTER` | 400 | Valor inválido en el filtro "{{field}}" |
| `INVALID_RANGE` | 400 | La fecha inicial no puede ser posterior a la final |
| `UPDATE_FIELDS_REQUIRED` | 400 | Debe enviar al menos un campo para actualizar |
| `FIELD_REQUIRED` | 400 | {{field}} es obligatorio |
| `FIELD_TOO_LONG` | 400 | {{field}} excede {{max}} caracteres |
| `FIELD_MUST_BE_STRING` | 400 | {{field}} debe ser string |
| `FIELD_MUST_BE_BOOLEAN` | 400 | {{field}} debe ser booleano |
| `INVALID_SORT_ORDER` | 400 | sortOrder debe ser un entero mayor o igual a 0 |
| `FORBIDDEN` | — | No autorizado |
| `STORAGE_NOT_CONFIGURED` | 503 | Almacenamiento de archivos no configurado |

### Autenticación y sesión
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `TOKEN_MISSING` | 401 | No se proporcionó token |
| `INVALID_AUTHORIZATION_HEADER` | 401 | Formato de Authorization inválido |
| `INVALID_TOKEN` | 401 | Token inválido o expirado |
| `INVALID_SESSION` | 401 | Sesión inválida: el usuario ya no existe o está inactivo |
| `UNAUTHENTICATED` | 401 | No autenticado |
| `INSUFFICIENT_PERMISSIONS` | 403 | Permisos insuficientes |
| `INVALID_CREDENTIALS` | 401 | Usuario o contraseña incorrectos |
| `ACCOUNT_DEACTIVATED` | 401 | Tu cuenta fue dada de baja. Contacta al administrador. |
| `ACCOUNT_LOCKED` | 429 | La cuenta está bloqueada temporalmente por intentos fallidos. Intenta de nuevo más tarde. |
| `RATE_LIMITED` | 429 | Demasiadas peticiones. Intenta de nuevo más tarde. |
| `INVALID_REFRESH_TOKEN` | 401 | Token de renovación inválido o expirado |
| `RESET_TOKEN_INVALID` | 422 | Token de recuperación inválido, expirado o ya usado |

### Usuarios
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `USER_NOT_FOUND` | 400 / 404 | Usuario no encontrado |
| `USERNAME_TAKEN` | 409 | El username ya existe |
| `EMAIL_TAKEN` | 409 | Ya existe un usuario con ese correo |
| `INVALID_ROLE` | 400 | Rol inválido: {{role}} |
| `ROLE_INACTIVE` | 400 | El rol "{{key}}" está desactivado: actívalo antes de asignarlo |
| `CANNOT_DEACTIVATE_SELF` | 400 | No puedes darte de baja a ti mismo |
| `CANNOT_CHANGE_OWN_PERMISSIONS` | 409 | No puedes cambiar tus propios permisos |
| `USER_ALREADY_ACTIVE` | 409 | El usuario ya estaba activo |
| `USER_ALREADY_DEACTIVATED` | 409 | El usuario ya estaba dado de baja |
| `USER_ID_REQUIRED` | — | User ID requerido |

### Excepciones de permiso
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `PERMISSION_DOES_NOT_EXIST` | 400 | El permiso "{{permission}}" no existe |
| `PERMISSION_INACTIVE` | 400 | El permiso "{{permission}}" está inactivo |
| `PERMISSION_EXCEPTION_NOT_FOUND` | 404 | El usuario no tiene una excepción para "{{permission}}" |
| `SENSITIVE_PERMISSION_REQUIRES_ADMIN` | 403 | Solo ADMIN puede otorgar el permiso sensible "{{permission}}" |
| `INVALID_SCOPE_FOR_PERMISSION` | 400 | Alcance inválido para "{{permission}}": {{scope}} |

### Roles
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `ROLE_NOT_FOUND` | 404 | Rol no encontrado: {{key}} |
| `ROLE_KEY_TAKEN` | 409 | Ya existe un rol con la clave "{{key}}" |
| `ROLE_SYSTEM_PROTECTED` | 409 | El rol "{{key}}" es un rol base del sistema: no se puede renombrar, desactivar ni eliminar |
| `ROLE_HAS_USERS` | 409 | No se puede eliminar: {{userCount}} cuenta(s) tienen el rol "{{key}}" |
| `ROLE_KEY_TOO_LONG` | 400 | La clave del rol excede {{max}} caracteres |
| `INVALID_ROLE_KEY` | 400 | La clave del rol debe estar en MAYÚSCULAS (letras, dígitos y guion bajo) |
| `ADMIN_PERMISSION_REQUIRED` | 409 | No se puede dejar al sistema sin un rol activo con el permiso "{{permission}}" |

### Catálogo de permisos
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `PERMISSION_KEY_TAKEN` | 409 | Ya existe un permiso con la clave "{{key}}" |
| `PERMISSION_NOT_FOUND` | 404 | Permiso no encontrado: {{key}} |
| `INVALID_PERMISSION_KEY` | 400 | La clave debe tener el formato module.action (minúsculas, dígitos y guion bajo) |
| `KEY_TOO_LONG` | 400 | La clave excede {{max}} caracteres |
| `SCOPES_REQUIRED` | 400 | scopes debe ser un arreglo no vacío |
| `INVALID_SCOPE` | 400 | Alcance inválido: {{scope}} |
| `DUPLICATE_SCOPE` | 400 | Alcance duplicado: {{scope}} |
| `SCOPE_HAS_GRANTS` | 409 | No se pueden quitar alcances con concesiones activas ({{grants}}) |

### Matriz
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `CHANGES_ARRAY_REQUIRED` | 400 | changes debe ser un arreglo no vacío |
| `TOO_MANY_CHANGES` | 400 | changes admite máximo {{max}} filas por petición |
| `CHANGES_REQUIRED` | 400 | Debe enviar al menos un cambio en la matriz |
| `INVALID_CHANGE_ROLE` | 400 | changes[{{index}}].role inválido: {{role}} |
| `CHANGE_PERMISSION_REQUIRED` | 400 | changes[{{index}}].permission es obligatorio |
| `CHANGE_PERMISSION_TOO_LONG` | 400 | changes[{{index}}].permission excede {{max}} caracteres |
| `INVALID_CHANGE_SCOPE` | 400 | changes[{{index}}].scope inválido: {{scope}} |

### Políticas ABAC
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `POLICY_DENIED` | 403 | Una política de acceso impide esta operación ({{policy}}) |
| `POLICY_NOT_FOUND` | 404 | Política no encontrada |
| `POLICY_KEY_TAKEN` | 409 | Ya existe una política con la clave "{{key}}" |
| `POLICY_ACTION_UNKNOWN` | 400 | La acción "{{action}}" no admite políticas |
| `POLICY_FIELD_UNKNOWN` | 400 | La acción "{{action}}" no expone el campo "{{field}}" |

### Contraseña y cuenta
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `CURRENT_PASSWORD_INVALID` | 422 | La contraseña actual no es correcta |
| `PASSWORD_REUSED` | 422 | La contraseña nueva debe ser distinta de la actual |
| `USER_NOT_LOCKED` | 409 | La cuenta no está bloqueada |

### Configuración y catálogos (M11)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `SETTING_UNKNOWN` | 400 | El parámetro "{{key}}" no existe |
| `SETTING_INVALID` | 400 | Valor inválido para "{{key}}" |
| `SETTINGS_REQUIRED` | 400 | Debe enviar al menos un parámetro |
| `CATALOG_ITEM_NOT_FOUND` | 404 | Registro de catálogo no encontrado |
| `CATALOG_ITEM_ALREADY_INACTIVE` | 409 | El registro ya estaba desactivado |
| `TERM_DATES_INVALID` | 400 | La fecha de inicio no puede ser posterior a la de fin |
| `TERM_ALREADY_ACTIVE` | 409 | El ciclo ya es el activo |

### Alumnos (M03)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `STUDENT_NOT_FOUND` | 400 / 404 | Alumno no encontrado |
| `DUPLICATE_CURP` | 409 | Ya existe un alumno con esa CURP |
| `DUPLICATE_STUDENT_NUMBER` | 409 | La matrícula {{studentNumber}} ya existe |
| `DUPLICATE_STUDENT` | 409 | Ya existe un alumno con el mismo nombre y fecha de nacimiento; confirma si es otra persona |
| `GUARDIAN_REQUIRED` | 400 | Un alumno menor de edad necesita al menos un tutor |
| `MULTIPLE_PAYMENT_RESPONSIBLES` | 400 | Solo un tutor puede ser responsable de pago |
| `USER_ALREADY_LINKED` | 409 | La cuenta ya está vinculada a otra persona |
| `FUTURE_DATE` | 400 | La fecha ({{field}}) no puede ser futura |

### Bajas y reingresos (M05)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `STUDENT_INACTIVE` | 409 | El alumno ya está dado de baja |
| `STUDENT_ALREADY_ACTIVE` | 409 | El alumno ya está activo |
| `REASON_NOT_AVAILABLE` | 400 | El motivo de baja no existe o está inactivo |

### Profesores (M04)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `TEACHER_NOT_FOUND` | 400 / 404 | Profesor no encontrado |
| `TEACHER_EMAIL_TAKEN` | 409 | Ya existe un profesor o una cuenta con ese correo |
| `TEACHER_INACTIVE` | 409 | El profesor está inactivo |
| `TEACHER_ALREADY_ACTIVE` | 409 | El profesor ya está activo |
| `TEACHER_HAS_NO_ACCOUNT` | 409 | El profesor no tiene cuenta vinculada |
| `INVITATION_NOT_PENDING` | 409 | La cuenta ya definió su contraseña: no hay invitación pendiente |

### Expediente (M06)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `FILE_REQUIRED` | 400 | Debes adjuntar un archivo |
| `FILE_TYPE_NOT_ALLOWED` | 400 | Tipo de archivo no permitido (solo PDF, JPG o PNG) |
| `FILE_TOO_LARGE` | 400 | El archivo excede el máximo de {{maxMb}} MB |
| `DOCUMENT_NOT_FOUND` | 404 | Documento no encontrado |
| `DOCUMENT_TYPE_NOT_AVAILABLE` | 400 | El tipo de documento no existe o está inactivo |
| `DOCUMENT_ALREADY_REVIEWED` | 409 | El documento ya fue revisado |
| `DOCUMENT_FILE_MISSING` | 404 | El archivo del documento no está disponible |

### Cursos, grupos e inscripciones (M07)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `COURSE_NOT_FOUND` | 400 / 404 | Curso no encontrado |
| `COURSE_CODE_TAKEN` | 409 | Ya existe un curso con la clave "{{code}}" |
| `COURSE_INACTIVE` | 409 | El curso está inactivo |
| `COURSE_ALREADY_ACTIVE` | — | El curso ya está activo |
| `LEVEL_NOT_AVAILABLE` | 400 | El nivel no existe o está inactivo |
| `TERM_NOT_FOUND` | 400 / 404 | Ciclo escolar no encontrado |
| `GROUP_NOT_FOUND` | 400 / 404 | Grupo no encontrado |
| `GROUP_NAME_TAKEN` | 409 | Ya existe el grupo "{{name}}" para ese curso y ciclo |
| `GROUP_INACTIVE` | 409 | El grupo está inactivo |
| `GROUP_ALREADY_ACTIVE` | — | El grupo ya está activo |
| `GROUP_CLOSED` | 409 | El grupo ya fue cerrado: sus calificaciones e inscripciones no cambian |
| `GROUP_HAS_ENROLLMENTS` | 409 | El grupo tiene {{count}} alumno(s) inscrito(s): dalos de baja o cámbialos antes |
| `CAPACITY_BELOW_ENROLLED` | 409 | El cupo ({{capacity}}) no puede ser menor que los inscritos ({{enrolledCount}}) |
| `GROUP_FULL` | 409 | El grupo está lleno (cupo {{capacity}}) |
| `ALREADY_ENROLLED` | 409 | El alumno ya está inscrito en ese grupo |
| `SCHEDULE_CONFLICT` | 409 | El horario se empalma con el grupo {{groupName}} ({{courseName}}) el {{day}} |
| `ENROLLMENT_NOT_FOUND` | 404 | Inscripción no encontrada |
| `ENROLLMENT_NOT_ACTIVE` | 409 | La inscripción no está vigente |
| `GROUP_CHANGE_INVALID` | 400 | El grupo destino debe ser otro grupo del mismo curso y ciclo |
| `CONCURRENT_UPDATE` | 409 | Otra operación modificó los mismos datos; intenta de nuevo |

### Exámenes y calificaciones (M08)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `ASSESSMENT_NOT_FOUND` | 404 | Instrumento de evaluación no encontrado |
| `ASSESSMENT_INACTIVE` | 409 | El instrumento de evaluación está inactivo |
| `WEIGHTS_NOT_100` | 409 | Las ponderaciones activas del grupo suman {{total}}%: deben sumar 100% |
| `WEIGHTS_EXCEED_100` | 409 | Con este cambio las ponderaciones sumarían {{total}}% (máximo 100%) |
| `SCORE_OUT_OF_RANGE` | 400 | La calificación debe estar entre 0 y {{max}} |
| `MAX_SCORE_BELOW_CAPTURED` | 409 | Ya hay calificaciones capturadas mayores a {{max}} |
| `ENROLLMENT_NOT_IN_GROUP` | 400 | La inscripción no pertenece al grupo del instrumento |
| `NOT_ENROLLED` | 409 | El alumno no está inscrito (vigente) en el grupo |
| `GRADES_INCOMPLETE` | 409 | Faltan {{missing}} calificación(es) por capturar para cerrar el grupo |
| `ASSESSMENTS_REQUIRED` | 409 | El grupo no tiene instrumentos de evaluación activos |

### Colegiaturas y pagos (M09)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `FEE_CONCEPT_NOT_FOUND` | 400 / 404 / 409 | Concepto de cobro no encontrado |
| `FEE_CONCEPT_NAME_TAKEN` | 409 | Ya existe el concepto "{{name}}" |
| `FEE_CONCEPT_ALREADY_ACTIVE` | — | El concepto de cobro ya está activo |
| `FEE_CONCEPT_INACTIVE` | 409 | El concepto de cobro está inactivo |
| `FEE_CONCEPT_RESERVED` | 409 | El concepto de recargos lo administra el sistema |
| `CHARGE_NOT_FOUND` | 404 | Cargo no encontrado |
| `CHARGE_ALREADY_PAID` | 409 | El cargo ya está pagado o cancelado: no admite pagos |
| `CHARGE_ALREADY_CANCELLED` | 409 | El cargo ya estaba cancelado |
| `CHARGE_HAS_PAYMENTS` | 409 | El cargo tiene {{count}} pago(s) vigente(s): cancélalos antes |
| `DISCOUNT_EXCEEDS_AMOUNT` | 400 | El descuento no puede ser mayor que el monto |
| `PAYMENT_NOT_FOUND` | 404 | Pago no encontrado |
| `PAYMENT_ALREADY_CANCELLED` | 409 | El pago ya estaba cancelado |
| `PAYMENT_EXCEEDS_BALANCE` | 400 | El pago excede el saldo pendiente ({{balance}}) |
| `INVALID_IDEMPOTENCY_KEY` | 400 | Idempotency-Key inválida (8 a 100 caracteres: letras, dígitos, guion o guion bajo) |
| `IDEMPOTENCY_KEY_REUSED` | 409 | La Idempotency-Key ya se usó en otra operación |
| `GENERATION_TARGET_REQUIRED` | 400 | Indica el grupo (scope=group) o el ciclo (scope=term) |
| `LATE_FEES_DISABLED` | 409 | Los recargos por mora están desactivados en la configuración |

### Reportes (M10)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `REPORT_NOT_FOUND` | 404 | No existe el reporte "{{type}}" |
| `REPORT_FORMAT_INVALID` | 400 | Formato inválido: usa json, xlsx o pdf |
| `REPORT_REQUIRES_FULL_SCOPE` | 403 | Este reporte requiere alcance institucional (ALL) |

### Banco de reactivos (M14)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `QUESTION_NOT_FOUND` | 404 | Reactivo no encontrado |
| `QUESTION_OPTION_REQUIRED` | — | Las preguntas cerradas necesitan al menos una opción correcta |
| `QUESTION_OPTION_COUNT_INVALID` | — | Número de opciones inválido para el tipo de pregunta |
| `QUESTION_MULTIPLE_CORRECT` | — | Este tipo de pregunta admite una sola opción correcta |
| `QUESTION_OPEN_NO_OPTIONS` | — | Las preguntas abiertas no llevan opciones |
| `QUESTION_IN_USE` | 409 | El reactivo ya se usó en un examen aplicado: solo se puede desactivar |
| `QUESTION_ALREADY_INACTIVE` | 409 | El reactivo ya estaba inactivo |
| `QUESTION_INACTIVE` | 409 | El reactivo está inactivo |
| `CSV_INVALID` | 400 | Archivo CSV inválido: {{reason}} |

### Exámenes en línea (M15)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `EXAM_NOT_FOUND` | 404 | Examen no encontrado |
| `EXAM_NOT_EDITABLE` | 409 | El examen está cerrado: ya no se puede modificar |
| `EXAM_PUBLISHED_LOCKED` | 409 | El examen ya tiene intentos: sus preguntas y reglas no cambian |
| `EXAM_NO_QUESTIONS` | 409 | Agrega al menos una pregunta antes de publicar |
| `EXAM_SCORE_INVALID` | 400 | El puntaje aprobatorio ({{passingScore}}) no puede superar el total ({{total}}) |
| `EXAM_QUESTION_INVALID` | 400 / 409 | La pregunta no está activa o no es del curso del grupo |
| `EXAM_ALREADY_PUBLISHED` | 409 | El examen ya fue publicado |
| `EXAM_NOT_PUBLISHED` | — | El examen no está publicado |
| `EXAM_ASSESSMENT_INVALID` | 400 | La evaluación debe ser del mismo grupo y estar activa |
| `EXAM_ASSESSMENT_TAKEN` | 409 | Esa evaluación ya está vinculada a otro examen |
| `EXAM_DRAFT_ONLY` | 409 | Solo se puede eliminar un examen en borrador |

### Aplicación y calificación (M16/M17)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `EXAM_NOT_AVAILABLE` | 409 | El examen no está disponible: {{reason}} |
| `ATTEMPT_NOT_FOUND` | 404 | Intento no encontrado |
| `ATTEMPT_CLOSED` | 409 | El intento ya fue enviado: no admite cambios |
| `ATTEMPT_OPEN` | 409 | El intento sigue en curso |
| `INVALID_ANSWER` | 400 | Respuesta inválida para la pregunta {{sortOrder}} |
| `STUDENT_PROFILE_REQUIRED` | 403 | Tu cuenta no está vinculada a un alumno |
| `REVIEW_ONLY_OPEN` | 400 | Solo las preguntas abiertas se revisan a mano |

### Asistencia y justificantes (M18)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `SESSION_NOT_FOUND` | 404 | Sesión de asistencia no encontrada |
| `SESSION_DUPLICATE` | 409 | Ya existe una sesión de ese grupo en esa fecha y hora |
| `SESSION_ANNULLED` | 409 | La sesión fue anulada: ya no admite cambios |
| `ATTENDANCE_INCOMPLETE` | 400 | El pase de lista debe incluir a todos los inscritos (faltan {{count}}) |
| `ATTENDANCE_NOT_FOUND` | 404 | Registro de asistencia no encontrado |
| `JUSTIFICATION_NOT_FOUND` | 404 | Justificante no encontrado |
| `JUSTIFICATION_ONLY_ABSENCE` | 409 | Solo se justifican faltas |
| `JUSTIFICATION_EXISTS` | 409 | Esa falta ya tiene un justificante pendiente o aprobado |
| `JUSTIFICATION_ALREADY_RESOLVED` | 409 | El justificante ya fue resuelto |
| `JUSTIFICATION_NO_FILE` | 404 | El justificante no tiene archivo adjunto |

### Notificaciones (M19)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `TEMPLATE_NOT_FOUND` | 404 | Plantilla de notificación no encontrada |
| `TEMPLATE_DUPLICATE` | 409 | Ya existe una plantilla con esa clave para ese canal |
| `TEMPLATE_INACTIVE` | 409 | La plantilla está inactiva |
| `TEMPLATE_ALREADY_INACTIVE` | 409 | La plantilla ya estaba inactiva |
| `NOTIFICATION_NOT_FOUND` | 404 | Notificación no encontrada |
| `NOTIFICATION_VARIABLES_MISSING` | 400 | Faltan variables para la plantilla: {{variables}} |
| `NOTIFICATION_RECIPIENT_INVALID` | 400 | Destinatario inválido para el canal {{channel}} |
| `NOTIFICATION_NOT_RETRYABLE` | 409 | Solo se reencolan notificaciones fallidas u omitidas |

### Migración de históricos (M20)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `MIGRATION_ENTITY_INVALID` | 400 | Entidad de migración no válida |
| `BACKUP_REQUIRED` | 409 | Se requiere un respaldo reciente (últimas {{maxHours}} h) antes de importar |
| `CHECKSUM_MISMATCH` | 409 | El archivo cambió desde la vista previa; vuelve a previsualizar |
| `MIGRATION_BATCH_NOT_FOUND` | 404 | Lote de migración no encontrado |

### Programas y planes de pago (M22)
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `PROGRAM_NOT_FOUND` | 404 | Carrera no encontrada |
| `PROGRAM_CODE_TAKEN` | 409 | Ya existe una carrera con esa clave |
| `PROGRAM_INACTIVE` | 409 | La carrera está inactiva |
| `PROGRAM_PERIOD_OUT_OF_RANGE` | 400 | El periodo excede el número de periodos de la carrera |
| `PLAN_NOT_FOUND` | 404 | Plan de pagos no encontrado |
| `PLAN_NOT_ACTIVE` | 409 | El plan de pagos no está activo |
| `DISCOUNT_EXCLUSIVE` | — | Indica descuento por porcentaje o por monto, no ambos |
| `REASON_REQUIRED` | 400 | El motivo es obligatorio |

### Bitácora
| `code` | HTTP | Mensaje (es) |
|---|---|---|
| `AUDIT_LOG_NOT_FOUND` | 404 | Registro de auditoría no encontrado |

### Validación de campos (dentro de `VALIDATION_ERROR.details`)
| `code` | Mensaje (es) |
|---|---|
| `USERNAME_MIN_LENGTH` | El usuario debe tener al menos 3 caracteres |
| `PASSWORD_MIN_LENGTH` | La contraseña no cumple la longitud mínima requerida |
| `INVALID_EMAIL` | Email inválido |
| `NAME_REQUIRED` | El nombre es obligatorio |
| `REASON_MIN_LENGTH` | El motivo debe tener al menos 3 caracteres |
| `REQUIRED_FIELD` | Campo obligatorio |
| `PASSWORD_MISMATCH` | Las contraseñas no coinciden |
| `INVALID_DATE` | Fecha inválida (AAAA-MM-DD) |
| `POLICY_KEY_FORMAT` | La clave debe ir en minúsculas, dígitos y guion bajo |
| `INVALID_CURP` | CURP inválida (formato o dígito verificador) |
| `INVALID_PHONE` | Teléfono inválido |
| `INVALID_TIME` | Hora inválida (HH:mm) |
| `SCHEDULE_REQUIRED` | Agrega al menos un horario |
| `SCHEDULE_RANGE` | La hora de inicio debe ser anterior a la de fin |
| `SCHEDULE_OVERLAP` | Los horarios del grupo se empalman entre sí |
| `INVALID_DECIMAL` | Máximo dos decimales |
| `DUPLICATE_ENROLLMENT_IN_BATCH` | Una inscripción aparece más de una vez |
| `CODE_FORMAT` | Clave inválida: mayúsculas, dígitos, punto o guion |

> Política: nunca incluir stack traces, SQL ni nombres internos en `message`/`details`
> en producción. Los códigos viven en `core/i18n/messages/{es,en}`.
