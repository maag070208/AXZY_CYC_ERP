# Diccionario de datos

Detalle de tablas y campos del SGE, con las convenciones **Prisma del estándar
PTNV** (ver [D-003](../../DECISIONES.md)):

- `id String @id @default(uuid())` (los catálogos de seguridad usan clave natural `key`).
- `createdAt DateTime @default(now())` y `updatedAt DateTime @updatedAt`.
- `active Boolean @default(true)` en catálogos/entidades desactivables; **no** hay
  `deleted_at` universal. El borrado lógico es **por dominio** (`deletedAt`,
  `cancelledAt`, `voidedAt`) y nunca se hace `DELETE` físico de datos de negocio.
- Campos en **camelCase** y en **inglés** (D-046); tablas con `@@map("snake_case_plural")`.
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
`key` (PK: `ADMIN`, `SCHOOL_CONTROL`, `TEACHER`, `STUDENT`), `name`, `module`,
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
| `studentNumber` | String | no | único, `AAAA-NNNN` |
| `firstNames` | String | no | |
| `paternalSurname` | String | no | |
| `maternalSurname` | String | sí | |
| `curp` | String(18) | no | único, validado |
| `birthDate` | DateTime `@db.Date` | no | |
| `gender` | String | sí | |
| `email` / `phone` / `address` | — | sí | |
| `status` | `StudentStatus` | no | `ACTIVE` / `WITHDRAWN` |
| `enrollmentDate` | DateTime `@db.Date` | no | |
| `userId` | String | sí | único; acceso opcional |

### `guardians`
`studentId`, `name`, `relationship`, `phone`, `email`, `isPaymentResponsible`.

---

## M04 — Profesores

### `teachers`
`firstNames`, `surnames`, `email` (único), `phone`, `specialty`,
`status` (`ACTIVE`/`INACTIVE`), `userId` (único, rol `TEACHER`).

---

## M05 — Bajas y reingresos

### `student_movements`
`studentId`, `type` (`WITHDRAWN`/`REENTRY`), `reason` (obligatorio), `date`,
`notes`, `createdBy`.

---

## M06 — Kardex y expediente documental

### `documents`
`studentId`, `type` (`ACTA_NACIMIENTO`, `CURP`, `COMPROBANTE_DOMICILIO`, `OTHER`),
`filePath` (S3), `mimeType`, `size`, `status`
(`PENDING`/`VALIDATED`/`REJECTED`), `validatedBy`, `notes`.

### `kardex` (vista calculada)
No persistida: cursos, calificaciones finales y acreditación calculados desde
`grades`, `assessments`, `enrollments` y `groups`.

---

## M07 — Cursos, grupos e inscripciones

### `courses`
`name`, `nivel`, `description`, `status` (`ACTIVE`/`INACTIVE`), `active`.

### `terms`
`name`, `startDate` `@db.Date`, `endDate` `@db.Date`, `ACTIVE`.

### `groups`
`courseId`, `termId`, `teacherId`, `name`, `capacity`, `schedule Json`
(`[{ day, startTime, endTime }]`), `classroom`.

### `enrollments`
`studentId`, `groupId`, `date`, `status`
(`ENROLLED`/`WITHDRAWN`/`PASSED`/`FAILED`). Único parcial:
`(studentId, groupId)` con estatus activo.

---

## M08 — Exámenes y calificaciones

### `assessments`
`groupId`, `name`, `type` (`PARTIAL`/`FINAL`/`HOMEWORK`/`OTHER`),
`weight Decimal(5,2)`, `date`, `maxScore Decimal(6,2)`.

### `grades`
`assessmentId`, `enrollmentId`, `score Decimal(6,2)`, `notes`,
`capturedBy`, `capturedAt`. Único: `(assessmentId, enrollmentId)`.

---

## M09 — Colegiaturas y pagos

### `fee_concepts`
`name`, `amount Decimal(12,2)`,
`type` (`ENROLLMENT`/`TUITION`/`MATERIAL`/`OTHER`).

### `charges`
`studentId`, `conceptId`, `termId?`, `amount Decimal(12,2)`,
`dueDate @db.Date`, `status`
(`PENDING`/`PARTIAL`/`PAID`/`CANCELLED`), `discount Decimal(12,2)`.

### `payments`
`chargeId`, `amount Decimal(12,2)`, `date`,
`method` (`CASH`/`TRANSFER`/`DEPOSIT`/`OTHER`), `reference`,
`receiptNumber` (único, consecutivo), `registeredBy`, `cancelledAt?`,
`cancellationReason?` (no se borra: se cancela).

---

## M11 — Administración y catálogos

### `settings`
`key` (único), `value Json`, `description` — parámetros generales (calificación
mínima, datos de la escuela, logotipo, umbral de asistencia, recargos).

### `levels`
`name`, `sortOrder`, `active`.

### `cancellation_reasons`
`name`, `active`.

### `document_types`
`name`, `required`, `active`.

---

## M14 — Banco de reactivos

### `questions`
`courseId`, `topic`, `type`
(`MULTIPLE_CHOICE`/`TRUE_FALSE`/`MULTIPLE_ANSWER`/`OPEN`), `text`,
`imagen?`, `points Decimal(6,2)`, `difficulty`, `status` (`ACTIVE`/`INACTIVE`).

### `question_options`
`questionId`, `text`, `isCorrect`, `sortOrder`.

---

## M15 — Configuración de exámenes en línea

### `online_exams`
`groupId`, `title`, `instructions?`, `durationMin`, `maxAttempts`,
`opensAt`, `closesAt`, `shuffleQuestions`, `shuffleOptions`,
`showResult`, `passingScore Decimal(6,2)`, `assessmentId?` (M08),
`status` (`DRAFT`/`PUBLISHED`/`CLOSED`).

### `online_exam_questions`
`examId`, `questionId`, `points Decimal(6,2)`, `sortOrder`. Único: `(examId, questionId)`.

---

## M16 — Aplicación al alumno

### `exam_attempts`
`examId`, `studentId`, `startedAt`, `finishedAt?`,
`status` (`IN_PROGRESS`/`SUBMITTED`/`EXPIRED`), `score Decimal(6,2)?`.

### `attempt_answers`
`attemptId`, `questionId`, `answer Json?`, `isCorrect Boolean?`,
`pointsEarned Decimal(6,2)?`.

---

## M18 — Asistencia y justificantes

### `attendance_sessions`
`groupId`, `date @db.Date`, `time`, `createdBy`. Único: `(groupId, date, time)`.

### `attendance`
`sessionId`, `enrollmentId`,
`status` (`PRESENT`/`ABSENT`/`LATE`/`JUSTIFIED`). Único: `(sessionId, enrollmentId)`.

### `justifications`
`attendanceId`, `reason`, `file?` (S3),
`status` (`PENDING`/`APPROVED`/`REJECTED`), `resolvedBy`.

---

## M19 — Notificaciones

### `notification_templates`
`code` (único), `channel` (`CORREO`/`SMS`/`WHATSAPP`), `subject?`,
`body` (variables `{{name}}`, `{{amount}}`), `status`.

### `notifications`
`recipient`, `channel`, `templateId?`, `payload Json`,
`status` (`QUEUED`/`SUBMITTED`/`FAILED`), `error?`, `sentAt?`.

---

## M20 — Migración de históricos

### `migration_batches`
`mode` (`DRY_RUN`/`EXECUTE`), `totals Json`, `createdBy`, `createdAt`.

### `migration_rows`
`batchId`, `entity`, `sourceRow`, `status` (`ACCEPTED`/`REJECTED`), `reason?`,
`createdAt`.

---

## M22 — Programas, plan de estudios y plan de pagos

### `programs` (carrera)
`code` (único), `name`, `description?`, `periodType`
(`BIMONTHLY`/`TRIMESTER`/`QUADRIMESTER`/`SEMESTER`), `periodCount`,
`monthsPerPeriod?`, `monthlyFee`, `enrollmentFee` (reinscripción), `active`.

### `program_subjects` (plan de estudios)
`programId`, `courseId`, `periodIndex` (1..periodCount), `sortOrder`.
Único `(programId, courseId)`; reutiliza `courses` (M07).

### `student_plans` (plan de pagos)
`studentId`, `programId`, `termId?`, `startDate`, `periodType`, `periodCount`,
`monthlyFee`, `enrollmentFee`, `discountPercent?`/`discountAmount?`/`discountReason?`,
`status` (`ACTIVE`/`COMPLETED`/`CANCELLED`), `createdBy?`.
Genera `periodCount × (1 + monthsPerPeriod)` cargos (reinscripción por periodo +
mensualidades), con snapshot y descuento aplicado.

### Cambios en M07 (`terms`)
`calendar Json?` — periodos configurables (`[{ name, startDate, endDate }]`);
calendario natural en español por defecto (no hardcodeado).

### Cambios en M11 (`settings`)
`PAYMENT_DUE_DAY` (entero 1..28; default **5**).

### Cambios en `charges` (M09)
`planId?` y `planChargeIndex?` con único `(planId, planChargeIndex)` para no
duplicar los cargos del plan. Conceptos genéricos `ENROLLMENT`/`TUITION`.

---

## Índices y unicidad recomendados

- Únicos: `users.username`, `users.email`, `students.studentNumber`, `students.curp`,
  `teachers.email`, `payments.receiptNumber`, `roles.key`, `permissions.key`.
- Índices de filtro: `students.status`, `enrollments.groupId`,
  `charges.studentId`/`status`, `attendance.sessionId`,
  `audit_logs.(entityType, entityId)`.
- Índices únicos parciales y CHECKs que Prisma no modela se agregan por migración SQL.
