# M17 — Calificación automática al kardex

| Campo | Valor |
|---|---|
| **Código** | M17 |
| **Versión** | 0.1 |
| **Estado** | Terminado (F5) |
| **Fase** | Calidad y examen en línea |
| **Depende de** | M16 (Aplicación al alumno), M15 (Configuración de exámenes), M14 (Banco de reactivos), M08 (Exámenes y calificaciones), M07 (Cursos, grupos e inscripciones) |
| **Habilita a** | M06 (Kardex y expediente), M10/M21 (reportes y tablero) |
| **Permisos** | `attempts.view` (AREA), `attempts.review` (AREA) |

## Implementación (F5, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/exams` (`exam-rules.ts`, `attempt.service.ts`) y `web/src/features/exam/exam-results`; pestaña «Resultados» de `/exams/:id`.

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| GET | `/api/v1/online-exams/:id/results` | `attempts.view` | KPIs (inscritos, presentaron, promedio, aprobados, por revisar) y renglón por alumno |
| PATCH | `/api/v1/attempts/:id/review` | `attempts.review` | Puntos (0…valor) y comentario de una abierta |
| POST | `/api/v1/attempts/:id/regrade` | `attempts.review` | Recalifica las cerradas y reescribe la calificación |

Decisiones (sección 12):
- Las cerradas se califican al cerrar el intento (todo o nada; en respuesta múltiple, conjunto exacto); las abiertas quedan pendientes.
- El puntaje elegido por criterio se normaliza a la escala de la evaluación vinculada y se escribe en el libro de M08; el kardex lo recibe al cerrar el grupo. Ver [D-039](../../../DECISIONES.md).
- Bitácora: cierre del intento (enviado/expirado), revisión, recalificación y la escritura de la calificación.

> **Cómo leer este documento:** la sección «Implementación» de arriba describe lo
> construido y **manda** sobre el diseño original de las secciones siguientes.
> Los nombres de campos, enums, rutas y códigos ya están en inglés
> ([D-046](../../../DECISIONES.md), [D-049](../../../DECISIONES.md)).

## 1. Objetivo

Calificar automáticamente las preguntas cerradas al enviar el intento, dejar las
abiertas pendientes de revisión manual del profesor y escribir el puntaje final
como `Grade` en el `Assessment` vinculado (M08), respetando el criterio de
intentos configurado; el kardex se actualiza al recalcular la calificación final
del grupo.

## 2. Alcance

**Incluye**
- Calificación automática de preguntas cerradas (`MULTIPLE_CHOICE`,
  `TRUE_FALSE`, `MULTIPLE_ANSWER`) contra `question_options.is_correct`.
- Pending de revisión manual para preguntas abiertas.
- Cálculo del puntaje final del intento y escritura de `Grade` en el `Assessment`.
- Aplicación del **criterio de intentos** (el mejor o el último) para el `Grade`.
- Endpoints de resultados del examen y de revisión manual.

**No incluye (en este módulo)**
- Captura/edición manual de calificaciones y cálculo de la calificación final del
  grupo (M08); M17 solo **escribe** el `Grade` del examen.
- Presentación del examen y autosave (M16).
- Definición de preguntas y opciones (M14).
- Vista/persistencia del kardex (M06); M17 alimenta sus insumos.

## 3. Modelo de datos (Prisma)

M17 **no crea tablas de negocio propias**: reutiliza `ExamAttempt`/`AttemptAnswer`
(M16) y `Grade`/`Assessment` (M08), apoyándose en el vínculo
`OnlineExam.assessmentId` (M15). Se muestran las porciones relevantes; el modelo
completo pertenece a cada módulo dueño.

```prisma
model OnlineExam {
  id               String           @id @default(uuid())
  groupId          String           @map("group_id")
  title            String
  instructions     String?          @db.Text
  durationMin      Int              @map("duration_min")
  maxAttempts      Int              @default(1) @map("max_attempts")
  opensAt          DateTime         @map("opens_at") @db.Timestamptz
  closesAt         DateTime         @map("closes_at") @db.Timestamptz
  shuffleQuestions Boolean          @default(false) @map("shuffle_questions")
  shuffleOptions   Boolean          @default(false) @map("shuffle_options")
  showResult       Boolean          @default(true) @map("show_result")
  passingScore     Decimal          @map("passing_score") @db.Decimal(6, 2)
  attemptCriterion AttemptCriterion @default(BEST) @map("attempt_criterion")
  /// Evaluación de M08 que recibe la calificación (una por examen).
  assessmentId     String?          @unique @map("assessment_id")
  status           OnlineExamStatus @default(DRAFT)
  publishedAt      DateTime?        @map("published_at")
  closedAt         DateTime?        @map("closed_at")
  createdBy        String?          @map("created_by")
  createdAt        DateTime         @default(now()) @map("created_at")
  updatedAt        DateTime         @updatedAt @map("updated_at")

  group      Group                @relation(fields: [groupId], references: [id])
  assessment Assessment?          @relation(fields: [assessmentId], references: [id])
  questions  OnlineExamQuestion[]
  attempts   ExamAttempt[]

  @@index([groupId])
  @@index([status])
  @@map("online_exams")
}

model ExamAttempt {
  id           String        @id @default(uuid())
  examId       String        @map("exam_id")
  studentId    String        @map("student_id")
  number       Int
  startedAt    DateTime      @default(now()) @map("started_at")
  /// Fin calculado en el servidor: min(inicio + duración, cierre del examen).
  endsAt       DateTime      @map("ends_at")
  finishedAt   DateTime?     @map("finished_at")
  status       AttemptStatus @default(IN_PROGRESS)
  /// Orden fijo del intento: `[{ questionId, optionIds[] }]` (aleatorización reproducible).
  layout       Json
  score        Decimal?      @db.Decimal(6, 2)
  pendingCount Int           @default(0) @map("pending_count")
  gradedAt     DateTime?     @map("graded_at")
  reviewedBy   String?       @map("reviewed_by")
  reviewedAt   DateTime?     @map("reviewed_at")
  focusLosses  Int           @default(0) @map("focus_losses")
  events       Json          @default("[]")
  createdAt    DateTime      @default(now()) @map("created_at")
  updatedAt    DateTime      @updatedAt @map("updated_at")

  exam    OnlineExam      @relation(fields: [examId], references: [id])
  student Student         @relation(fields: [studentId], references: [id])
  answers AttemptAnswer[]

  @@unique([examId, studentId, number])
  @@index([examId, studentId])
  @@index([studentId, status])
  @@index([status, endsAt])
  @@map("exam_attempts")
}

model AttemptAnswer {
  id           String    @id @default(uuid())
  attemptId    String    @map("attempt_id")
  questionId   String    @map("question_id")
  /// Opción (`optionId`), arreglo de opciones o texto, según el tipo.
  answer       Json?
  /// NULL = pendiente de revisión manual (abiertas).
  isCorrect    Boolean?  @map("is_correct")
  pointsEarned Decimal?  @map("points_earned") @db.Decimal(6, 2)
  comment      String?
  answeredAt   DateTime  @default(now()) @map("answered_at")
  reviewedAt   DateTime? @map("reviewed_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  attempt  ExamAttempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  question Question    @relation(fields: [questionId], references: [id])

  @@unique([attemptId, questionId])
  @@index([attemptId])
  @@map("attempt_answers")
}

model Assessment {
  id        String         @id @default(uuid())
  groupId   String         @map("group_id")
  name      String
  type      AssessmentType
  /// Porcentaje; la suma de los activos del grupo debe ser 100.00 para cerrar.
  weight    Decimal        @db.Decimal(5, 2)
  date      DateTime?      @db.Date
  maxScore  Decimal        @map("max_score") @db.Decimal(6, 2)
  active    Boolean        @default(true)
  createdAt DateTime       @default(now()) @map("created_at")
  updatedAt DateTime       @updatedAt @map("updated_at")

  group      Group       @relation(fields: [groupId], references: [id])
  grades     Grade[]
  onlineExam OnlineExam?

  @@index([groupId])
  @@map("assessments")
}

model Grade {
  id           String    @id @default(uuid())
  assessmentId String    @map("assessment_id")
  enrollmentId String    @map("enrollment_id")
  score        Decimal?  @db.Decimal(6, 2)
  notes        String?
  capturedBy   String?   @map("captured_by")
  capturedAt   DateTime? @map("captured_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  assessment Assessment @relation(fields: [assessmentId], references: [id])
  enrollment Enrollment @relation(fields: [enrollmentId], references: [id])

  @@unique([assessmentId, enrollmentId])
  @@index([enrollmentId])
  @@map("grades")
}
```

**Vínculo y cálculo (documentado):**
- `ExamAttempt` → `OnlineExam.assessmentId` → `Assessment` (M08).
- La **inscripción** destino se deriva de `ExamAttempt.studentId` +
  `OnlineExam.groupId` → `Enrollment` activo de ese grupo; si no existe, es un
  error de datos (`INVALID_REFERENCE`).
- El `Grade` se guarda con `upsert` por `(assessmentId, enrollmentId)`.
- `score` del intento = Σ `AttemptAnswer.pointsEarned` (0 si aún hay
  pendientes, hasta cerrar la revisión).
- `gradedAt`/`reviewedBy`/`reviewedAt` son campos **propuestos** de M17 sobre
  `ExamAttempt` para trazabilidad (ver §12).

**Índices (existentes y de apoyo):**
- `ExamAttempt`: `(examId, studentId)` — base del criterio «mejor/último».
- `AttemptAnswer`: único `(attemptId, questionId)`.
- `Grade`: único `(assessmentId, enrollmentId)`.
- `OnlineExam.assessmentId` indexado (FK).

> `deleted_at` **No aplica**: intentos, respuestas y calificaciones se conservan
> por auditoría. Ver
> [`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md).

## 4. Reglas de negocio

Numeradas y verificables (cada una mapea a una prueba de §10):

1. **Calificación automática de cerradas.** Al pasar un intento a `SUBMITTED` o
   `EXPIRED`, las preguntas `MULTIPLE_CHOICE`, `TRUE_FALSE` y
   `MULTIPLE_ANSWER` se comparan con `question_options.is_correct`; se fija
   `isCorrect` y `pointsEarned` (todo o nada según `online_exam_questions.points`).
2. **Pendientes de revisión.** Las preguntas `OPEN` quedan con `isCorrect = NULL`
   y `pointsEarned = NULL` hasta que el profesor las revise.
3. **Puntaje del intento.** `ExamAttempt.score` = suma de
   `AttemptAnswer.pointsEarned`; se recalcula en cada cambio de respuestas o de
   revisión. Si quedan pendientes, el intento se marca como «parcialmente
   calificado» (no se escribe `Grade` definitivo hasta cerrar).
4. **Escritura al Assessment (criterio de intentos).** Se hace `upsert` de un
   único `Grade` por `(assessmentId, enrollmentId)`, aplicando el criterio
   configurado: el **mejor** intento (`MAX(score)`) o el **último**
   (`ORDER BY finishedAt DESC`). Nunca se escribe un `Grade` por intento.
5. **Rango de calificación.** El `score` escrito respeta `[0, max_score]` del
   `Assessment`; fuera de rango → 400 `SCORE_OUT_OF_RANGE`.
6. **Revisión manual recalcula.** `PATCH /attempts/:id/review` fija
   `isCorrect`/`pointsEarned` de una respuesta abierta y, al completar todas,
   recalcula `score` y reescribe el `Grade` según la regla 4.
7. **Kardex al recalcular el grupo.** M17 no actualiza el kardex por intento: el
   kardex (M06) se refresca cuando M08 recalcula la calificación final del grupo,
   leyendo los `Grade` ya escritos.
8. **Alcance del profesor.** Un profesor solo revisa/consulta intentos de sus
   grupos (`AREA`); fuera de alcance → 403 o lista filtrada.
9. **Idempotencia.** Recalificar el mismo evento no duplica `Grade` ni cambia el
   resultado (`upsert` + lectura determinista del criterio); reintentos con
   `Idempotency-Key` devuelven el mismo payload.

## 5. API

Módulo bajo `api/src/modules/exams/` (`exam-rules.ts`, `attempt.service.ts`; la calificación se apoya en el recurso
`online-exams` de M15). Los listados densos de resultados usan el contrato
server-side.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/online-exams/:id/results` | Resultados del examen (intentos, puntajes, estatus) | `attempts.view` (AREA) |
| GET | `/api/v1/attempts/:id` | Detalle del intento con respuestas y revisión | `attempts.view` (AREA) |
| PATCH | `/api/v1/attempts/:id/review` | Revisión manual de una respuesta abierta | `attempts.review` (AREA) |
| POST | `/api/v1/attempts/:id/regrade` | Recalcula y reescribe el `Grade` (idempotente) | `attempts.review` (AREA) |

**Revisión manual** `PATCH /api/v1/attempts/:id/review`:

```json
{ "questionId": "…", "isCorrect": true, "pointsEarned": 4 }
```

Responde `200` con el intento actualizado y el efecto en el `Grade`:

```json
{
  "attemptId": "8f0e…",
  "score": 18.5,
  "pendingCount": 0,
  "grade": { "assessmentId": "…", "enrollmentId": "…", "score": 18.5 }
}
```

Si tras la revisión quedan abiertas sin revisar, `pendingCount > 0` y no se
reescribe el `Grade` definitivo.

**Resultados** `GET /api/v1/online-exams/:id/results` devuelve, por alumno del
grupo: intentos, puntaje vigente y si hay pendientes. Con paginación densa se
se evaluará una variante server-side (no implementada: el grupo cabe en una respuesta).

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `attemptApi` / `gradeApi` | `entities/attempt`, `entities/grade` | API + tipos de intento y calificación |
| `useExamResults` | `entities/attempt` | Resultados paginados del examen |
| `review-attempt` | `features/attempt/review-attempt` | Revisión manual de respuestas abiertas |
| `regrade-attempt` | `features/attempt/regrade-attempt` | Recalcular y escribir `Grade` |
| `ExamResultsPage` | `pages/exam-results` | Tabla de resultados (profesor) |
| `AttemptReviewPage` | `pages/attempt-review` | Revisión pregunta a pregunta |

Pantallas con `ITPage` + `ITDataTable` para los resultados (columna por columna con
filtro y orden, regla de la casa) y `PanelCard` para el detalle; KPIs (promedio,
aprobados, pendientes) con `KpiTile`; confirmaciones de regrade con `ITDialog`.
i18n con namespace **`attempts`** (resultados/revisión). Los botones de revisión se
gated con `usePermission("attempts.review")`.

## 7. Permisos y alcance

Ver [`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md).

| Permiso | Roles | Alcance | Notas |
|---|---|---|---|
| `attempts.view` | `ADMIN`/`SCHOOL_CONTROL` (`ALL`), `TEACHER` (`AREA`), `STUDENT` (`OWN`) | por rol | El alumno ve su propio resultado si `show_result`. |
| `attempts.review` | `TEACHER` | `AREA` | Revisión manual y regrade; solo grupos del profesor. |
| `grades.capture` | `TEACHER` | `AREA` | M08; M17 escribe el `Grade` con esta semántica de área. |

El scoping se aplica en la consulta (por `group_id` del examen para AREA, por
`studentId` para OWN) y va en `AND`. Escrituras fuera de alcance → 403
`INSUFFICIENT_PERMISSIONS`. El alumno **no** puede revisar ni recalificar.

## 8. Validaciones

Zod en `models/dto`; `ZodError` → 400 `VALIDATION_ERROR`.

| DTO | Campos | Reglas / código |
|---|---|---|
| `ReviewAnswerSchema` | `questionId` (uuid), `isCorrect` (bool), `pointsEarned` (number ≥ 0) | `pointsEarned ≤ online_exam_questions.points`; si no → 400 `SCORE_OUT_OF_RANGE` |
| `ResultQuerySchema` | `page`, `limit`, `filters`, `sort` | tope `limit` 200; filtro inválido → `INVALID_FILTER` |
| `ParamsId` | `id` (uuid) | `REQUIRED_FIELD` |

Validaciones de dominio (no Zod): pregunta pertenece al examen (`INVALID_REFERENCE`),
intento enviado/expirado (409 `EXAM_NOT_AVAILABLE`), calificación dentro de
`[0, max_score]` (`SCORE_OUT_OF_RANGE`).

## 9. Bitácora

Vía `AuditPort` ([`../../seguridad/bitacora.md`](../../seguridad/bitacora.md)) con
`previousState`/`newState`.

| Acción | `entityType` | `previousState` / `newState` |
|---|---|---|
| `ATTEMPT_GRADED` | `ExamAttempt` | `{ score: null }` → `{ score, gradedAt }` (calificación automática) |
| `ATTEMPT_REVIEWED` | `AttemptAnswer` | `{ isCorrect: null, pointsEarned: null }` → `{ isCorrect, pointsEarned }` |
| `GRADE_WRITTEN` | `Grade` | `null`/previo → `{ assessmentId, enrollmentId, score, criterion }` |

`criterion` (`BEST`/`LAST`) se guarda en `metadata` para explicar por qué se
escribió ese puntaje. El regrade idempotente sin cambio de valor no genera un
nuevo `GRADE_WRITTEN`.

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): comparación de respuestas cerradas,
  cálculo de `score` con pendientes, selección del criterio mejor/último,
  validación de rango (reglas 1, 3, 4, 5).
- **Contrato** (`api/tests/e2e`): `results`/`review`/`regrade` con `teacher`;
  401/403 (alumno u otro grupo), escritura de `Grade` verificada por API,
  idempotencia del regrade, `SCORE_OUT_OF_RANGE` (reglas 4–9).
- **Navegador** (`web/tests/e2e`): resultados del examen y flujo de revisión
  manual con actualización del promedio.
- **Spec del módulo:** `api/tests/e2e/m17-calificacion-kardex.spec.ts` y
  `web/tests/e2e/m17-calificacion-kardex.spec.ts`.
- **Una prueba por regla numerada** de §4, y verificación de bitácora
  (`ATTEMPT_GRADED`, `ATTEMPT_REVIEWED`, `GRADE_WRITTEN`).
- Cobertura objetivo ≥ 70 % en los servicios del módulo.

## 11. Criterios de aceptación

- [x] Migración/campos de trazabilidad sobre `ExamAttempt` (si se aprueban).
- [x] Servicio de calificación automática de cerradas y de pendientes de abiertas.
- [x] Escritura de `Grade` en el `Assessment` con criterio de intentos configurado.
- [x] Módulo API (`routes/controller/service/dto`) con permisos AREA y bitácora.
- [x] Pantallas de resultados y revisión con UI kit (`ITDataTable`, `KpiTile`, `ITDialog`).
- [x] Specs del módulo pasando (solo los del módulo).
- [x] Este README completo.

## 12. Decisiones abiertas

- **Dónde vive el criterio de intentos** (mejor/último): ¿campo en `OnlineExam`
  (M15), en el `Assessment` (M08) o en `settings` (M11)? Afecta a quién se le
  acredita el ajuste.
- **Columnas de trazabilidad** `gradedAt`/`reviewedBy`/`reviewedAt` en
  `ExamAttempt`: confirmar si se agregan o se modela una entidad de revisión.
- **Momento de escritura del `Grade`:** ¿solo al cerrar la revisión, o un valor
  provisional y luego el definitivo? Impacta reportes en vivo.
- **Puntaje parcial en preguntas de varias respuestas** (`MULTIPLE_ANSWER`):
  ¿todo o nada o proporcional? Por defecto todo o nada.
- **Condiciones de reprobación en kardex:** regla de acreditación final
  (M06/M08) — ver [`../../../DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- Plantilla: [`../../plantillas/plantilla-modulo.md`](../../plantillas/plantilla-modulo.md).
- Convenciones: [`../../guia/convenciones.md`](../../guia/convenciones.md).
- API modular: [`../../arquitectura/api-modular.md`](../../arquitectura/api-modular.md);
  web FSD: [`../../arquitectura/web-fsd.md`](../../arquitectura/web-fsd.md);
  UI kit: [`../../arquitectura/axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).
- API: [`../../api/convenciones.md`](../../api/convenciones.md),
  [`../../api/errores.md`](../../api/errores.md).
- Permisos/bitácora: [`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md),
  [`../../seguridad/bitacora.md`](../../seguridad/bitacora.md).
- Datos: [`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md).
- Pruebas: [`../../pruebas/estrategia-pruebas.md`](../../pruebas/estrategia-pruebas.md).
- Módulos relacionados: [M16](../M16-aplicacion-alumno/README.md),
  [M15](../M15-examenes-configuracion/README.md),
  [M08](../M08-examenes-calificaciones/README.md),
  [M06](../M06-kardex-expediente/README.md).
