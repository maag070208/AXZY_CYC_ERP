# Diccionario de datos

Detalle de tablas y campos del SGE, con las convenciones **Prisma del estándar
PTNV** (ver [D-003](../../DECISIONES.md)):

- `id String @id @default(uuid())` (los catálogos de seguridad usan clave natural `key`).
- `createdAt DateTime @default(now())` y `updatedAt DateTime @updatedAt`.
- `active Boolean @default(true)` en catálogos/entidades desactivables; **no** hay
  `deleted_at` universal. El borrado lógico es **por dominio** (`deletedAt`,
  `cancelledAt`, `voidedAt`) y nunca se hace `DELETE` físico de datos de negocio.
- Campos en **camelCase** (se conservan los nombres del spec, que son en español);
  tablas con `@@map("snake_case_plural")`.
- Enums en `UPPER_SNAKE`; dinero/medidas en `Decimal @db.Decimal(...)`; JSON en `Json`.

## Columnas estándar

| Columna | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | String (uuid) | no | `uuid()` | Clave primaria |
| `createdAt` | DateTime | no | `now()` | Alta (UTC) |
| `updatedAt` | DateTime | no | `@updatedAt` | Última modificación (UTC) |
| `active` | Boolean | no | `true` | Vigencia en catálogos/entidades desactivables |

---

## M02 — Autenticación, roles y bitácora

### `users`
| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `username` | String | no | único |
| `email` | String | no | único |
| `passwordHash` | String | no | bcryptjs |
| `name` | String | no | Nombre completo |
| `phone` | String | sí | |
| `active` | Boolean | no | default `true` |
| `lastLoginAt` | DateTime | sí | Último acceso |
| `deactivatedAt` | DateTime | sí | Baja explícita |
| `deactivationReason` | String | sí | |
| `failedAttempts` | Int | no | default 0 (lockout) |
| `lockedUntil` | DateTime | sí | Bloqueo temporal |
| `mustChangePassword` | Boolean | no | default false |

### `roles`
`key` (PK: `ADMIN`, `CONTROL_ESCOLAR`, `PROFESOR`, `ALUMNO`), `name`, `module`,
`staff`, `system` (protegido), `active`, `sortOrder`.

### `permissions`
`key` (PK: `students.create`), `module`, `name`, `scopes Scope[]`, `sensitive`,
`active`, `sortOrder`.

### `role_permissions`
`roleKey` (FK `roles.key`), `permissionKey` (FK `permissions.key`), `scope Scope`.
Único: `(roleKey, permissionKey)`.

### `user_roles`
`userId`, `roleKey`. PK compuesta `(userId, roleKey)` (multi-rol).

### `user_permissions` (excepciones)
`userId`, `permissionKey`, `scope`, `reason`, `expiresAt`, `grantedById`.
Único: `(userId, permissionKey)`.

### `policies` / `policy_conditions` / `policy_roles`
`policies`: `key`, `action`, `effect` (`ALLOW`/`DENY`), `priority`, `active`.
`policy_conditions`: `policyId`, `field`, `operator`, `value`.
`policy_roles`: `policyId`, `roleKey`.

### `audit_logs`
`action`, `entityType`, `entityId`, `userId?`, `userName?`, `previousState Json?`,
`newState Json?`, `metadata Json?`, `createdAt`. Índices por `action`,
`(entityType, entityId)`, `userId`, `createdAt`.

### `refresh_tokens` / `password_reset_tokens`
Tokens guardados como hash, con `expiresAt`; refresh con `revokedAt` (rotación).

---

## M03 — Alumnos

### `students`
| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `matricula` | String | no | único, `AAAA-NNNN` |
| `nombres` | String | no | |
| `apellidoPaterno` | String | no | |
| `apellidoMaterno` | String | sí | |
| `curp` | String(18) | no | único, validado |
| `fechaNacimiento` | DateTime `@db.Date` | no | |
| `genero` | String | sí | |
| `email` / `telefono` / `direccion` | — | sí | |
| `status` | `StudentStatus` | no | `ACTIVO` / `BAJA` |
| `fechaIngreso` | DateTime `@db.Date` | no | |
| `userId` | String | sí | único; acceso opcional |

### `guardians`
`studentId`, `nombre`, `parentesco`, `telefono`, `email`, `esResponsablePago`.

---

## M04 — Profesores

### `teachers`
`nombres`, `apellidos`, `email` (único), `telefono`, `especialidad`,
`status` (`ACTIVO`/`INACTIVO`), `userId` (único, rol `PROFESOR`).

---

## M05 — Bajas y reingresos

### `student_movements`
`studentId`, `tipo` (`BAJA`/`REINGRESO`), `motivo` (obligatorio), `fecha`,
`observaciones`, `createdBy`.

---

## M06 — Kardex y expediente documental

### `documents`
`studentId`, `tipo` (`ACTA_NACIMIENTO`, `CURP`, `COMPROBANTE_DOMICILIO`, `OTRO`),
`filePath` (S3), `mimeType`, `size`, `status`
(`PENDIENTE`/`VALIDADO`/`RECHAZADO`), `validatedBy`, `notas`.

### `kardex` (vista calculada)
No persistida: cursos, calificaciones finales y acreditación calculados desde
`grades`, `assessments`, `enrollments` y `groups`.

---

## M07 — Cursos, grupos e inscripciones

### `courses`
`nombre`, `nivel`, `descripcion`, `status` (`ACTIVO`/`INACTIVO`), `active`.

### `terms`
`nombre`, `fechaInicio` `@db.Date`, `fechaFin` `@db.Date`, `activo`.

### `groups`
`courseId`, `termId`, `teacherId`, `nombre`, `cupo`, `horario Json`
(`[{ dia, horaInicio, horaFin }]`), `aula`.

### `enrollments`
`studentId`, `groupId`, `fecha`, `status`
(`INSCRITO`/`BAJA`/`ACREDITADO`/`REPROBADO`). Único parcial:
`(studentId, groupId)` con estatus activo.

---

## M08 — Exámenes y calificaciones

### `assessments`
`groupId`, `nombre`, `tipo` (`PARCIAL`/`FINAL`/`TAREA`/`OTRO`),
`ponderacion Decimal(5,2)`, `fecha`, `maxScore Decimal(6,2)`.

### `grades`
`assessmentId`, `enrollmentId`, `score Decimal(6,2)`, `observaciones`,
`capturedBy`, `capturedAt`. Único: `(assessmentId, enrollmentId)`.

---

## M09 — Colegiaturas y pagos

### `fee_concepts`
`nombre`, `monto Decimal(12,2)`,
`tipo` (`INSCRIPCION`/`COLEGIATURA`/`MATERIAL`/`OTRO`).

### `charges`
`studentId`, `conceptId`, `termId?`, `monto Decimal(12,2)`,
`fechaVencimiento @db.Date`, `status`
(`PENDIENTE`/`PARCIAL`/`PAGADO`/`CANCELADO`), `descuento Decimal(12,2)`.

### `payments`
`chargeId`, `monto Decimal(12,2)`, `fecha`,
`metodo` (`EFECTIVO`/`TRANSFERENCIA`/`DEPOSITO`/`OTRO`), `referencia`,
`reciboFolio` (único, consecutivo), `registeredBy`, `cancelledAt?`,
`cancellationReason?` (no se borra: se cancela).

---

## M11 — Administración y catálogos

### `settings`
`key` (único), `value Json`, `description` — parámetros generales (calificación
mínima, datos de la escuela, logotipo, umbral de asistencia, recargos).

### `levels`
`nombre`, `orden`, `active`.

### `cancellation_reasons`
`nombre`, `active`.

### `document_types`
`nombre`, `obligatorio`, `active`.

---

## M14 — Banco de reactivos

### `questions`
`courseId`, `tema`, `tipo`
(`OPCION_MULTIPLE`/`VERDADERO_FALSO`/`MULTIPLE_RESPUESTA`/`ABIERTA`), `enunciado`,
`imagen?`, `puntos Decimal(6,2)`, `dificultad`, `status` (`ACTIVA`/`INACTIVA`).

### `question_options`
`questionId`, `texto`, `esCorrecta`, `orden`.

---

## M15 — Configuración de exámenes en línea

### `online_exams`
`groupId`, `titulo`, `instrucciones?`, `duracionMin`, `intentosMax`,
`fechaApertura`, `fechaCierre`, `aleatorizarPreguntas`, `aleatorizarOpciones`,
`mostrarResultado`, `puntajeAprobatorio Decimal(6,2)`, `assessmentId?` (M08),
`status` (`BORRADOR`/`PUBLICADO`/`CERRADO`).

### `online_exam_questions`
`examId`, `questionId`, `puntos Decimal(6,2)`, `orden`. Único: `(examId, questionId)`.

---

## M16 — Aplicación al alumno

### `exam_attempts`
`examId`, `studentId`, `startedAt`, `finishedAt?`,
`status` (`EN_CURSO`/`ENVIADO`/`EXPIRADO`), `score Decimal(6,2)?`.

### `attempt_answers`
`attemptId`, `questionId`, `respuesta Json?`, `esCorrecta Boolean?`,
`puntosObtenidos Decimal(6,2)?`.

---

## M18 — Asistencia y justificantes

### `attendance_sessions`
`groupId`, `fecha @db.Date`, `hora`, `createdBy`. Único: `(groupId, fecha, hora)`.

### `attendance`
`sessionId`, `enrollmentId`,
`status` (`PRESENTE`/`FALTA`/`RETARDO`/`JUSTIFICADA`). Único: `(sessionId, enrollmentId)`.

### `justifications`
`attendanceId`, `motivo`, `archivo?` (S3),
`status` (`PENDIENTE`/`APROBADA`/`RECHAZADA`), `resueltoPor`.

---

## M19 — Notificaciones

### `notification_templates`
`clave` (único), `canal` (`CORREO`/`SMS`/`WHATSAPP`), `asunto?`,
`cuerpo` (variables `{{nombre}}`, `{{monto}}`), `status`.

### `notifications`
`destinatario`, `canal`, `templateId?`, `payload Json`,
`status` (`EN_COLA`/`ENVIADO`/`FALLIDO`), `error?`, `sentAt?`.

---

## M20 — Migración de históricos

### `migration_batches`
`mode` (`DRY_RUN`/`EXECUTE`), `totals Json`, `createdBy`, `createdAt`.

### `migration_rows`
`batchId`, `entity`, `sourceRow`, `status` (`ACCEPTED`/`REJECTED`), `reason?`,
`createdAt`.

---

## Índices y unicidad recomendados

- Únicos: `users.username`, `users.email`, `students.matricula`, `students.curp`,
  `teachers.email`, `payments.reciboFolio`, `roles.key`, `permissions.key`.
- Índices de filtro: `students.status`, `enrollments.groupId`,
  `charges.studentId`/`status`, `attendance.sessionId`,
  `audit_logs.(entityType, entityId)`.
- Índices únicos parciales y CHECKs que Prisma no modela se agregan por migración SQL.
