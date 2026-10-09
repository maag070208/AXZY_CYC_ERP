# Diccionario de datos

Tablas y campos del SGE. **Este documento se genera desde
`api/prisma/schema.prisma`** (fuente de verdad): si cambia el esquema, se
regenera; no se edita a mano.

Convenciones (ver [D-003](../../DECISIONES.md) y [D-046](../../DECISIONES.md)):

- Identificadores en **inglés**: modelos `PascalCase`, campos `camelCase`,
  tablas y columnas `snake_case` (`@@map` / `@map`), enums `UPPER_SNAKE`.
- `id String @id @default(uuid())` (los catálogos de seguridad usan clave natural `key`).
- `createdAt` / `updatedAt` en casi todas las tablas; `active` en catálogos y
  entidades desactivables. **No** hay `deleted_at` universal: el borrado lógico
  es por dominio (`deletedAt`, `cancelledAt`, `withdrawnAt`) y nunca se hace
  `DELETE` físico de datos de negocio.
- Dinero y medidas en `Decimal`; fechas de calendario en `@db.Date`; instantes en UTC.
- `Kardex` **no** es una tabla: es una vista calculada desde inscripciones,
  evaluaciones y calificaciones.

Las relaciones se omiten aquí (están en el [diagrama entidad-relación](entidad-relacion.md));
se listan las columnas escalares, incluidas las llaves foráneas (`…Id`).

---

## M02 — Autenticación, roles y bitácora

### `users` (`User`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `username` | String | no | único |
| `email` | String | no | único |
| `passwordHash` | String | no |  |
| `name` | String | no |  |
| `phone` | String | sí |  |
| `active` | Boolean | no | default `true` |
| `lastLoginAt` | DateTime | sí |  |
| `deactivatedAt` | DateTime | sí |  |
| `deactivationReason` | String | sí |  |
| `failedAttempts` | Int | no | default `0` |
| `lockedUntil` | DateTime | sí |  |
| `mustChangePassword` | Boolean | no | default `false` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([active])`

### `roles` (`Role`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `key` | String | no | PK |
| `name` | String | no |  |
| `module` | String | sí |  |
| `staff` | Boolean | no | default `false` |
| `system` | Boolean | no | default `false` |
| `active` | Boolean | no | default `true` |
| `sortOrder` | Int | no | default `0` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

### `permissions` (`Permission`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `key` | String | no | PK |
| `module` | String | no |  |
| `name` | String | no |  |
| `scopes` | Scope[] | no | default `[NONE, OWN, AREA, ALL]`; `NONE` / `OWN` / `AREA` / `ALL` |
| `sensitive` | Boolean | no | default `false` |
| `active` | Boolean | no | default `true` |
| `sortOrder` | Int | no | default `0` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([module])`

### `role_permissions` (`RolePermission`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `roleKey` | String | no |  |
| `permissionKey` | String | no |  |
| `scope` | Scope | no | default `NONE`; `NONE` / `OWN` / `AREA` / `ALL` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([roleKey, permissionKey])`

### `user_roles` (`UserRole`)

Multi-rol: un usuario puede tener varios roles (la unión toma el alcance mayor).

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `userId` | String | no |  |
| `roleKey` | String | no |  |

`@@id([userId, roleKey])` · `@@index([roleKey])`

### `user_permissions` (`UserPermission`)

Excepción de permiso por persona: reemplaza lo que dice su rol.

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `userId` | String | no |  |
| `permissionKey` | String | no |  |
| `scope` | Scope | no | `NONE` / `OWN` / `AREA` / `ALL` |
| `reason` | String | sí |  |
| `expiresAt` | DateTime | sí |  |
| `grantedById` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([userId, permissionKey])`

### `policies` (`Policy`)

Política ABAC: actúa DESPUÉS del RBAC sobre una acción registrada (`core/policies/actions.ts`). La primera que casa (menor `priority`) decide; sin coincidencia se permite.

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `key` | String | no | único |
| `name` | String | no |  |
| `description` | String | sí |  |
| `action` | String | no |  |
| `effect` | PolicyEffect | no | default `DENY`; `ALLOW` / `DENY` |
| `priority` | Int | no | default `100` |
| `active` | Boolean | no | default `true` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([action, active])`

### `policy_conditions` (`PolicyCondition`)

Condición `campo operador valor` (todas deben cumplirse). `value` es JSON y admite referencias al actor (`"@user.id"`, `"@user.roles"`).

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `policyId` | String | no |  |
| `field` | String | no |  |
| `operator` | String | no |  |
| `value` | Json | no |  |
| `sortOrder` | Int | no | default `0` |
| `createdAt` | DateTime | no | default `now()` |

`@@index([policyId])`

### `policy_roles` (`PolicyRole`)

Roles a los que aplica la política (sin filas = aplica a todos).

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `policyId` | String | no |  |
| `roleKey` | String | no |  |

`@@id([policyId, roleKey])` · `@@index([roleKey])`

### `refresh_tokens` (`RefreshToken`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `userId` | String | no |  |
| `tokenHash` | String | no | único |
| `expiresAt` | DateTime | no |  |
| `revokedAt` | DateTime | sí |  |
| `createdAt` | DateTime | no | default `now()` |

`@@index([userId])`

### `password_reset_tokens` (`PasswordResetToken`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `userId` | String | no |  |
| `tokenHash` | String | no | único |
| `expiresAt` | DateTime | no |  |
| `usedAt` | DateTime | sí |  |
| `createdAt` | DateTime | no | default `now()` |

`@@index([userId])`

### `audit_logs` (`AuditLog`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `action` | String | no |  |
| `entityType` | String | no |  |
| `entityId` | String | sí |  |
| `userId` | String | sí |  |
| `userName` | String | sí |  |
| `previousState` | Json | sí |  |
| `newState` | Json | sí |  |
| `metadata` | Json | sí |  |
| `createdAt` | DateTime | no | default `now()` |

`@@index([action])` · `@@index([entityType, entityId])` · `@@index([userId])` · `@@index([createdAt])`

---

## M11 — Administración y catálogos

### `settings` (`Setting`)

Parámetro general clave/valor. La `key` la fija la migración (no se crea desde el cliente); solo se actualiza `value`.

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `key` | String | no | único |
| `value` | Json | no |  |
| `description` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

### `levels` (`Level`)

Nivel educativo.

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `name` | String | no | único |
| `sortOrder` | Int | sí |  |
| `active` | Boolean | no | default `true` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([active])`

### `terms` (`Term`)

Ciclo escolar. Solo uno `active` a la vez (índice único parcial en SQL). M07 lo amplía con sus relaciones (grupos).

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `name` | String | no | único |
| `startDate` | DateTime | no | `Date` |
| `endDate` | DateTime | no | `Date` |
| `active` | Boolean | no | default `false` |
| `calendar` | Json | sí | Calendario/periodos configurables (M22): [{ name, startDate, endDate }]. |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([active])`

### `cancellation_reasons` (`CancellationReason`)

Motivo de baja (lo consume M05).

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `name` | String | no | único |
| `active` | Boolean | no | default `true` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([active])`

### `document_types` (`DocumentType`)

Tipo de documento del expediente (lo consume M06).

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `name` | String | no | único |
| `required` | Boolean | no | default `false` |
| `active` | Boolean | no | default `true` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([active])`

---

## M03 — Alumnos

### `students` (`Student`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `studentNumber` | String | no | único; `AAAA-NNNN`: año de ingreso + consecutivo. Inmutable. |
| `firstNames` | String | no |  |
| `paternalSurname` | String | no |  |
| `maternalSurname` | String | sí |  |
| `curp` | String | no | único |
| `birthDate` | DateTime | no | `Date` |
| `gender` | String | sí |  |
| `email` | String | sí |  |
| `phone` | String | sí |  |
| `address` | String | sí |  |
| `status` | StudentStatus | no | default `ACTIVE`; `ACTIVE` / `WITHDRAWN` |
| `enrollmentDate` | DateTime | no | `Date` |
| `userId` | String | sí | único |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([status])` · `@@index([paternalSurname, maternalSurname, firstNames])`

### `student_number_sequences` (`StudentNumberSequence`)

Consecutivo de matrícula por año de ingreso (se incrementa en la transacción del alta).

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `year` | Int | no | PK |
| `last` | Int | no | default `0` |

### `guardians` (`Guardian`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `studentId` | String | no |  |
| `name` | String | no |  |
| `relationship` | String | no |  |
| `phone` | String | no |  |
| `email` | String | sí |  |
| `isPaymentResponsible` | Boolean | no | default `false` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([studentId])`

---

## M05 — Bajas y reingresos

### `student_movements` (`StudentMovement`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `studentId` | String | no |  |
| `type` | MovementType | no | `WITHDRAWAL` / `REENTRY` |
| `reason` | String | no |  |
| `reasonId` | String | sí | Motivo del catálogo M11 (opcional; `motivo` guarda el texto). |
| `date` | DateTime | no | `Date` |
| `notes` | String | sí |  |
| `createdBy` | String | no |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([studentId, date])` · `@@index([type])` · `@@index([createdBy])`

---

## M04 — Profesores

### `teachers` (`Teacher`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `firstNames` | String | no |  |
| `surnames` | String | no |  |
| `email` | String | no | único |
| `phone` | String | sí |  |
| `specialty` | String | sí |  |
| `status` | TeacherStatus | no | default `ACTIVE`; `ACTIVE` / `INACTIVE` |
| `userId` | String | sí | único |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([status])` · `@@index([surnames, firstNames])`

---

## M06 — Expediente documental

### `documents` (`Document`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `studentId` | String | no |  |
| `documentTypeId` | String | no |  |
| `filePath` | String | no | Clave privada del objeto (nombre aleatorio); nunca una URL pública. |
| `originalName` | String | no |  |
| `mimeType` | String | no |  |
| `size` | Int | no |  |
| `status` | DocumentStatus | no | default `PENDING`; `PENDING` / `VALIDATED` / `REJECTED` |
| `uploadedBy` | String | no |  |
| `validatedBy` | String | sí |  |
| `validatedAt` | DateTime | sí |  |
| `notes` | String | sí |  |
| `deletedAt` | DateTime | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([studentId, documentTypeId, status])` · `@@index([status])`

---

## M07 — Cursos, grupos e inscripciones

### `courses` (`Course`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `code` | String | no | único; Clave corta e inmutable en la práctica (p. ej. `MAT-101`). |
| `name` | String | no |  |
| `levelId` | String | sí |  |
| `description` | String | sí |  |
| `active` | Boolean | no | default `true` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([active])` · `@@index([name])`

### `groups` (`Group`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `courseId` | String | no |  |
| `termId` | String | no |  |
| `teacherId` | String | sí |  |
| `name` | String | no |  |
| `capacity` | Int | no |  |
| `schedule` | Json | no | `[{ dia: "LUNES", horaInicio: "08:00", horaFin: "09:00" }]` |
| `classroom` | String | sí |  |
| `active` | Boolean | no | default `true` |
| `closedAt` | DateTime | sí | Cierre de calificaciones (M08): finales escritas y estatus aplicados. |
| `closedBy` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([courseId, termId, name])` · `@@index([termId])` · `@@index([teacherId])` · `@@index([active])`

### `enrollments` (`Enrollment`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `studentId` | String | no |  |
| `groupId` | String | no |  |
| `date` | DateTime | no | `Date` |
| `status` | EnrollmentStatus | no | default `ENROLLED`; `ENROLLED` / `WITHDRAWN` / `PASSED` / `FAILED` |
| `finalGrade` | Decimal | sí | `Decimal(5, 2)`; Calificación final escrita al cerrar el grupo (M08). |
| `withdrawnAt` | DateTime | sí |  |
| `withdrawalReason` | String | sí |  |
| `transferredToId` | String | sí | único; Si la baja fue por cambio de grupo, la inscripción destino. |
| `createdBy` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |
| `attendanceAlertAt` | DateTime | sí | Cuándo se emitió la alerta de inasistencia vigente (M18); se limpia al recuperar el umbral. |

`@@index([studentId, status])` · `@@index([groupId, status])`

---

## M08 — Evaluaciones y calificaciones

### `assessments` (`Assessment`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `groupId` | String | no |  |
| `name` | String | no |  |
| `type` | AssessmentType | no | `PARTIAL` / `FINAL` / `HOMEWORK` / `OTHER` |
| `weight` | Decimal | no | `Decimal(5, 2)`; Porcentaje; la suma de los activos del grupo debe ser 100.00 para cerrar. |
| `date` | DateTime | sí | `Date` |
| `maxScore` | Decimal | no | `Decimal(6, 2)` |
| `active` | Boolean | no | default `true` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([groupId])`

### `grades` (`Grade`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `assessmentId` | String | no |  |
| `enrollmentId` | String | no |  |
| `score` | Decimal | sí | `Decimal(6, 2)` |
| `notes` | String | sí |  |
| `capturedBy` | String | sí |  |
| `capturedAt` | DateTime | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([assessmentId, enrollmentId])` · `@@index([enrollmentId])`

---

## M09 — Colegiaturas y pagos

### `fee_concepts` (`FeeConcept`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `name` | String | no | único |
| `description` | String | sí |  |
| `amount` | Decimal | no | `Decimal(12, 2)` |
| `type` | FeeConceptType | no | `ENROLLMENT` / `TUITION` / `MATERIAL` / `LATE_FEE` / `OTHER` |
| `active` | Boolean | no | default `true` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([active])`

### `charges` (`Charge`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `studentId` | String | no |  |
| `conceptId` | String | no |  |
| `termId` | String | sí |  |
| `planId` | String | sí | Plan de pagos que originó el cargo (M22). |
| `planChargeIndex` | Int | sí | Índice del cargo dentro del plan (0..n) para idempotencia. |
| `description` | String | sí | Texto libre visible en el estado de cuenta (p. ej. «Colegiatura septiembre»). |
| `amount` | Decimal | no | `Decimal(12, 2)` |
| `discount` | Decimal | no | default `0`; `Decimal(12, 2)` |
| `dueDate` | DateTime | no | `Date` |
| `status` | ChargeStatus | no | default `PENDING`; `PENDING` / `PARTIAL` / `PAID` / `CANCELLED` |
| `parentChargeId` | String | sí | único; Recargo por mora: el cargo vencido que lo origina (uno por cargo). |
| `createdBy` | String | sí |  |
| `cancelledAt` | DateTime | sí |  |
| `cancelReason` | String | sí |  |
| `cancelledBy` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([planId, planChargeIndex])` · `@@index([studentId])` · `@@index([status])` · `@@index([termId])` · `@@index([dueDate])`

### `payments` (`Payment`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `chargeId` | String | no |  |
| `amount` | Decimal | no | `Decimal(12, 2)` |
| `date` | DateTime | no | `Date` |
| `method` | PaymentMethod | no | `CASH` / `TRANSFER` / `DEPOSIT` / `CARD` / `OTHER` |
| `reference` | String | sí |  |
| `receiptNumber` | String | no | único; `REC-AAAA-NNNNNN`, consecutivo por año e irrepetible. |
| `registeredBy` | String | no |  |
| `registeredByName` | String | no | Nombre de quien cobró al momento del pago (el recibo no cambia si la cuenta cambia). |
| `idempotencyKey` | String | sí | único |
| `cancelledAt` | DateTime | sí |  |
| `cancelReason` | String | sí |  |
| `cancelledBy` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([chargeId])` · `@@index([date])`

### `receipt_sequences` (`ReceiptSequence`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `year` | Int | no | PK |
| `last` | Int | no | default `0` |

### `idempotency_records` (`IdempotencyRecord`)

Respuesta guardada de una operación con `Idempotency-Key` (generación masiva).

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `key` | String | no | PK |
| `userId` | String | no |  |
| `scope` | String | no |  |
| `response` | Json | no |  |
| `createdAt` | DateTime | no | default `now()` |

---

## M14 — Banco de reactivos

### `questions` (`Question`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `courseId` | String | no |  |
| `topic` | String | sí |  |
| `type` | QuestionType | no | `MULTIPLE_CHOICE` / `TRUE_FALSE` / `MULTIPLE_ANSWER` / `OPEN` |
| `text` | String | no | `Text` |
| `points` | Decimal | no | `Decimal(6, 2)`; Puntos sugeridos al agregarla a un examen (M15 puede cambiarlos). |
| `difficulty` | QuestionDifficulty | sí | `EASY` / `MEDIUM` / `HARD` |
| `status` | QuestionStatus | no | default `ACTIVE`; `ACTIVE` / `INACTIVE` |
| `createdBy` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([courseId])` · `@@index([type])` · `@@index([difficulty])` · `@@index([status])`

### `question_options` (`QuestionOption`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `questionId` | String | no |  |
| `text` | String | no | `Text` |
| `isCorrect` | Boolean | no | default `false` |
| `sortOrder` | Int | no |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([questionId])`

---

## M15 — Exámenes en línea

### `online_exams` (`OnlineExam`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `groupId` | String | no |  |
| `title` | String | no |  |
| `instructions` | String | sí | `Text` |
| `durationMin` | Int | no |  |
| `maxAttempts` | Int | no | default `1` |
| `opensAt` | DateTime | no | `Timestamptz` |
| `closesAt` | DateTime | no | `Timestamptz` |
| `shuffleQuestions` | Boolean | no | default `false` |
| `shuffleOptions` | Boolean | no | default `false` |
| `showResult` | Boolean | no | default `true` |
| `passingScore` | Decimal | no | `Decimal(6, 2)` |
| `attemptCriterion` | AttemptCriterion | no | default `BEST`; `BEST` / `LAST` |
| `assessmentId` | String | sí | único; Evaluación de M08 que recibe la calificación (una por examen). |
| `status` | OnlineExamStatus | no | default `DRAFT`; `DRAFT` / `PUBLISHED` / `CLOSED` |
| `publishedAt` | DateTime | sí |  |
| `closedAt` | DateTime | sí |  |
| `createdBy` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([groupId])` · `@@index([status])`

### `online_exam_questions` (`OnlineExamQuestion`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `examId` | String | no |  |
| `questionId` | String | no |  |
| `points` | Decimal | no | `Decimal(6, 2)` |
| `sortOrder` | Int | no |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([examId, questionId])` · `@@index([questionId])`

---

## M16/M17 — Intentos y calificación

### `exam_attempts` (`ExamAttempt`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `examId` | String | no |  |
| `studentId` | String | no |  |
| `number` | Int | no |  |
| `startedAt` | DateTime | no | default `now()` |
| `endsAt` | DateTime | no | Fin calculado en el servidor: min(inicio + duración, cierre del examen). |
| `finishedAt` | DateTime | sí |  |
| `status` | AttemptStatus | no | default `IN_PROGRESS`; `IN_PROGRESS` / `SUBMITTED` / `EXPIRED` |
| `layout` | Json | no | Orden fijo del intento: `[{ questionId, optionIds[] }]` (aleatorización reproducible). |
| `score` | Decimal | sí | `Decimal(6, 2)` |
| `pendingCount` | Int | no | default `0` |
| `gradedAt` | DateTime | sí |  |
| `reviewedBy` | String | sí |  |
| `reviewedAt` | DateTime | sí |  |
| `focusLosses` | Int | no | default `0` |
| `events` | Json | no | default `"[]"` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([examId, studentId, number])` · `@@index([examId, studentId])` · `@@index([studentId, status])` · `@@index([status, endsAt])`

### `attempt_answers` (`AttemptAnswer`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `attemptId` | String | no |  |
| `questionId` | String | no |  |
| `answer` | Json | sí | Opción (`optionId`), arreglo de opciones o texto, según el tipo. |
| `isCorrect` | Boolean | sí | NULL = pendiente de revisión manual (abiertas). |
| `pointsEarned` | Decimal | sí | `Decimal(6, 2)` |
| `comment` | String | sí |  |
| `answeredAt` | DateTime | no | default `now()` |
| `reviewedAt` | DateTime | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([attemptId, questionId])` · `@@index([attemptId])`

---

## M18 — Asistencia y justificantes

### `attendance_sessions` (`AttendanceSession`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `groupId` | String | no |  |
| `date` | DateTime | no | `Date` |
| `time` | String | sí | `VarChar(5)`; `HH:mm` opcional (varias sesiones el mismo día). |
| `topic` | String | sí | `VarChar(200)` |
| `createdBy` | String | no |  |
| `deletedAt` | DateTime | sí | Anulación lógica: la sesión deja de contar para el porcentaje. |
| `deletedBy` | String | sí |  |
| `deleteReason` | String | sí | `VarChar(300)` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([groupId, date])`

### `attendance` (`Attendance`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `sessionId` | String | no |  |
| `enrollmentId` | String | no |  |
| `status` | AttendanceStatus | no | `PRESENT` / `ABSENT` / `LATE` / `JUSTIFIED` |
| `recordedBy` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([sessionId, enrollmentId])` · `@@index([enrollmentId, status])`

### `justifications` (`Justification`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `attendanceId` | String | no | único |
| `reason` | String | no | `VarChar(1000)` |
| `fileKey` | String | sí | Clave privada en el almacenamiento (S3 o disco); nunca una URL pública. |
| `fileName` | String | sí | `VarChar(255)` |
| `fileMime` | String | sí | `VarChar(100)` |
| `fileSize` | Int | sí |  |
| `status` | JustificationStatus | no | default `PENDING`; `PENDING` / `APPROVED` / `REJECTED` |
| `requestedBy` | String | no |  |
| `resolvedBy` | String | sí |  |
| `resolvedAt` | DateTime | sí |  |
| `note` | String | sí | `VarChar(500)` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([status])`

---

## M19 — Notificaciones

### `notification_templates` (`NotificationTemplate`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `code` | String | no | `VarChar(60)`; Evento que la dispara (p. ej. `ALERTA_INASISTENCIA`); una por canal. |
| `name` | String | no | `VarChar(150)` |
| `channel` | NotificationChannel | no | `EMAIL` / `SMS` / `WHATSAPP` / `IN_APP` |
| `subject` | String | sí | `VarChar(200)` |
| `body` | String | no |  |
| `variables` | Json | no | default `"[]"`; Variables declaradas que el payload debe cubrir (`["nombre", "monto"]`). |
| `required` | Boolean | no | default `false`; Transaccional obligatorio: ignora la baja (opt-out). |
| `active` | Boolean | no | default `true` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([code, channel])` · `@@index([channel, active])`

### `notifications` (`Notification`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `recipient` | String | no | `VarChar(200)`; Correo, teléfono o `user:<id>` para la bandeja interna. |
| `channel` | NotificationChannel | no | `EMAIL` / `SMS` / `WHATSAPP` / `IN_APP` |
| `templateId` | String | sí |  |
| `userId` | String | sí | Cuenta destinataria (bandeja y tiempo real), si se conoce. |
| `origin` | String | no | default `"MANUAL"`; `VarChar(60)`; Evento o módulo de origen (`ALERTA_INASISTENCIA`, `MANUAL`…). |
| `payload` | Json | no | default `"{}"` |
| `subject` | String | sí | `VarChar(200)` |
| `body` | String | no |  |
| `status` | NotificationStatus | no | default `QUEUED`; `QUEUED` / `SENT` / `FAILED` / `SKIPPED` |
| `attempts` | Int | no | default `0` |
| `maxAttempts` | Int | no | default `5` |
| `nextRetryAt` | DateTime | no | default `now()` |
| `lockedUntil` | DateTime | sí | Reclamo del worker (evita que dos instancias envíen lo mismo). |
| `error` | String | sí | `VarChar(500)` |
| `providerMessageId` | String | sí |  |
| `dryRun` | Boolean | no | default `false`; Enviado en modo simulado (sin proveedor real configurado). |
| `idempotencyKey` | String | sí | único; `VarChar(200)` |
| `readAt` | DateTime | sí |  |
| `sentAt` | DateTime | sí |  |
| `createdBy` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([status, nextRetryAt])` · `@@index([recipient])` · `@@index([userId, channel, createdAt])` · `@@index([templateId])`

### `notification_preferences` (`NotificationPreference`)

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `recipient` | String | no | `VarChar(200)` |
| `channel` | NotificationChannel | no | `EMAIL` / `SMS` / `WHATSAPP` / `IN_APP` |
| `optOut` | Boolean | no | default `false` |
| `reason` | String | sí | `VarChar(300)` |
| `updatedBy` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@unique([recipient, channel])`

---

## M20 — Migración de históricos

### `migration_batches` (`MigrationBatch`)

Lote de migración (una ejecución dry-run o real). Trazabilidad del proceso; el dataset final vive en cada módulo destino.

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `entity` | String | no | Entidad destino: Student, Teacher… |
| `file` | String | no | Nombre del archivo origen (el contenido no se guarda). |
| `checksum` | String | no | `VarChar(64)`; sha256 del archivo; la confirmación revalida que coincide. |
| `mode` | MigrationMode | no | `DRY_RUN` / `EXECUTE` |
| `status` | MigrationBatchStatus | no | default `IN_PROGRESS`; `IN_PROGRESS` / `COMPLETED` / `FAILED` / `CANCELLED` |
| `idempotencyKey` | String | sí | único; `VarChar(200)` |
| `totalsJson` | Json | no | default `"{}"`; { read, valid\|inserted, updated?, rejected } |
| `createdBy` | String | no |  |
| `executedAt` | DateTime | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([entity, status])` · `@@index([createdAt])`

### `migration_rows` (`MigrationRow`)

Resultado fila a fila de un lote (se guardan las filas no aceptadas).

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `batchId` | String | no |  |
| `rowNumber` | Int | no |  |
| `entity` | String | no |  |
| `naturalKey` | String | sí | `VarChar(200)` |
| `status` | MigrationRowStatus | no | `ACCEPTED` / `REJECTED` / `SKIPPED` |
| `reason` | String | sí | `VarChar(120)` |
| `raw` | Json | sí |  |
| `createdAt` | DateTime | no | default `now()` |

`@@index([batchId, status])` · `@@index([naturalKey])`

---

## M22 — Programas, plan de estudios y plan de pagos

### `programs` (`Program`)

Carrera/programa: costos y esquema de periodos.

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `code` | String | no | único; `VarChar(30)` |
| `name` | String | no |  |
| `description` | String | sí |  |
| `periodType` | PeriodType | no | `BIMONTHLY` / `TRIMESTER` / `QUADRIMESTER` / `SEMESTER` |
| `periodCount` | Int | no |  |
| `monthsPerPeriod` | Int | sí | Meses por periodo (2/3/4/6). Null = derivado de `periodType`. |
| `monthlyFee` | Decimal | no | `Decimal(12, 2)` |
| `enrollmentFee` | Decimal | no | `Decimal(12, 2)`; Reinscripción cobrada una vez por periodo (0 = no se cobra). |
| `active` | Boolean | no | default `true` |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([active])`

### `program_subjects` (`ProgramSubject`)

Plan de estudios: materia (curso de M07) en un periodo de la carrera.

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `programId` | String | no |  |
| `courseId` | String | no |  |
| `periodIndex` | Int | no |  |
| `sortOrder` | Int | no | default `0` |
| `createdAt` | DateTime | no | default `now()` |

`@@unique([programId, courseId])` · `@@index([programId, periodIndex])`

### `student_plans` (`StudentPlan`)

Plan de pagos de un alumno (snapshot de montos y descuento al generarlo).

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | String | no | PK; default `uuid()` |
| `studentId` | String | no |  |
| `programId` | String | no |  |
| `termId` | String | sí |  |
| `startDate` | DateTime | no | `Date` |
| `periodType` | PeriodType | no | `BIMONTHLY` / `TRIMESTER` / `QUADRIMESTER` / `SEMESTER` |
| `periodCount` | Int | no |  |
| `monthlyFee` | Decimal | no | `Decimal(12, 2)` |
| `enrollmentFee` | Decimal | no | `Decimal(12, 2)` |
| `discountPercent` | Decimal | sí | `Decimal(5, 2)`; Descuento/beca: porcentaje (0..100) o monto; el porcentaje gana si ambos. |
| `discountAmount` | Decimal | sí | `Decimal(12, 2)` |
| `discountReason` | String | sí | `VarChar(200)` |
| `status` | PlanStatus | no | default `ACTIVE`; `ACTIVE` / `COMPLETED` / `CANCELLED` |
| `createdBy` | String | sí |  |
| `createdAt` | DateTime | no | default `now()` |
| `updatedAt` | DateTime | no | `@updatedAt` |

`@@index([studentId, status])` · `@@index([programId])`

---

## Enums

| Enum | Valores |
|---|---|
| `Scope` | `NONE` · `OWN` · `AREA` · `ALL` |
| `PolicyEffect` | `ALLOW` · `DENY` |
| `StudentStatus` | `ACTIVE` · `WITHDRAWN` |
| `MovementType` | `WITHDRAWAL` · `REENTRY` |
| `TeacherStatus` | `ACTIVE` · `INACTIVE` |
| `DocumentStatus` | `PENDING` · `VALIDATED` · `REJECTED` |
| `EnrollmentStatus` | `ENROLLED` · `WITHDRAWN` · `PASSED` · `FAILED` |
| `AssessmentType` | `PARTIAL` · `FINAL` · `HOMEWORK` · `OTHER` |
| `FeeConceptType` | `ENROLLMENT` · `TUITION` · `MATERIAL` · `LATE_FEE` · `OTHER` |
| `ChargeStatus` | `PENDING` · `PARTIAL` · `PAID` · `CANCELLED` |
| `PaymentMethod` | `CASH` · `TRANSFER` · `DEPOSIT` · `CARD` · `OTHER` |
| `QuestionType` | `MULTIPLE_CHOICE` · `TRUE_FALSE` · `MULTIPLE_ANSWER` · `OPEN` |
| `QuestionDifficulty` | `EASY` · `MEDIUM` · `HARD` |
| `QuestionStatus` | `ACTIVE` · `INACTIVE` |
| `OnlineExamStatus` | `DRAFT` · `PUBLISHED` · `CLOSED` |
| `AttemptCriterion` | `BEST` · `LAST` |
| `AttemptStatus` | `IN_PROGRESS` · `SUBMITTED` · `EXPIRED` |
| `AttendanceStatus` | `PRESENT` · `ABSENT` · `LATE` · `JUSTIFIED` |
| `JustificationStatus` | `PENDING` · `APPROVED` · `REJECTED` |
| `NotificationChannel` | `EMAIL` · `SMS` · `WHATSAPP` · `IN_APP` |
| `NotificationStatus` | `QUEUED` · `SENT` · `FAILED` · `SKIPPED` |
| `MigrationMode` | `DRY_RUN` · `EXECUTE` |
| `MigrationBatchStatus` | `IN_PROGRESS` · `COMPLETED` · `FAILED` · `CANCELLED` |
| `MigrationRowStatus` | `ACCEPTED` · `REJECTED` · `SKIPPED` |
| `PeriodType` | `BIMONTHLY` · `TRIMESTER` · `QUADRIMESTER` · `SEMESTER` |
| `PlanStatus` | `ACTIVE` · `COMPLETED` · `CANCELLED` |

## JSON guardado

| Columna | Forma |
|---|---|
| `groups.schedule` | `[{ day, startTime, endTime }]` con `day` ∈ `MONDAY…SUNDAY` y horas `HH:mm` |
| `terms.calendar` | `[{ name, startDate, endDate }]` (periodos del ciclo) |
| `settings.value` | Escalar u objeto validado por clave (`LATE_FEE = { enabled, dailyRate, graceDays }`) |
| `exam_attempts.layout` | `[{ questionId, optionIds }]` (orden fijado al iniciar el intento) |
| `exam_attempts.events` | `[{ type, at }]` con `type` ∈ `TAB_BLUR` / `TAB_FOCUS` (últimos 200) |
| `attempt_answers.answer` | Id de opción, arreglo de ids o texto, según el tipo de pregunta |
| `notification_templates.variables` | `["name", "courseName", …]` (variables `{{…}}` que usa la plantilla) |
| `policy_conditions.value` | Valor JSON de la condición; admite `"@user.id"`, `"@user.username"`, `"@user.roles"` |

Los índices únicos parciales y los `CHECK` que Prisma no modela viven en las
migraciones SQL (`terms_single_active`, inscripción vigente única por alumno y
grupo, un intento `IN_PROGRESS` por alumno y examen, sesión vigente única).
