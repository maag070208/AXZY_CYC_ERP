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

## 1. Objetivo

Calificar automáticamente las preguntas cerradas al enviar el intento, dejar las
abiertas pendientes de revisión manual del profesor y escribir el puntaje final
como `Grade` en el `Assessment` vinculado (M08), respetando el criterio de
intentos configurado; el kardex se actualiza al recalcular la calificación final
del grupo.

## 2. Alcance

**Incluye**
- Calificación automática de preguntas cerradas (`opcion_multiple`,
  `verdadero_falso`, `multiple_respuesta`) contra `question_options.es_correcta`.
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
// M15 (dueño): el examen apunta al Assessment de M08 — ESTE es el vínculo
model OnlineExam {
  id           String  @id @default(uuid())
  groupId      String
  assessmentId String? @map("assessment_id")
  // duracion_min, intentos_max, fecha_apertura, fecha_cierre, status…
  assessment Assessment?  @relation(fields: [assessmentId], references: [id])
  attempts   ExamAttempt[]
  @@map("online_exams")
}

// M16 (dueño): intento y respuestas; M17 escribe score y estados de revisión
model ExamAttempt {
  id         String        @id @default(uuid())
  examId     String
  studentId  String
  finishedAt DateTime?
  status     AttemptStatus @default(EN_CURSO) // EN_CURSO | ENVIADO | EXPIRADO
  score      Decimal?      @db.Decimal(6, 2)  // puntaje final calculado
  gradedAt   DateTime?                        // propuesto: último cálculo automático
  reviewedBy String?                          // propuesto: profesor que cierra revisión
  reviewedAt DateTime?                        // propuesto: cierre de revisión manual
  answers    AttemptAnswer[]
  @@map("exam_attempts")
}

model AttemptAnswer {
  id              String   @id @default(uuid())
  attemptId       String
  questionId      String
  respuesta       Json?
  esCorrecta      Boolean? // NULL = pendiente de revisión manual
  puntosObtenidos Decimal? @db.Decimal(6, 2)
  @@unique([attemptId, questionId])
  @@map("attempt_answers")
}

// M08 (dueño): destino de la calificación
model Assessment {
  id          String  @id @default(uuid())
  groupId     String
  ponderacion Decimal @db.Decimal(5, 2)
  maxScore    Decimal @db.Decimal(6, 2)
  onlineExam  OnlineExam?
  grades      Grade[]
  @@map("assessments")
}

model Grade {
  id           String   @id @default(uuid())
  assessmentId String
  enrollmentId String
  score        Decimal? @db.Decimal(6, 2)
  capturedBy   String?
  capturedAt   DateTime?
  @@unique([assessmentId, enrollmentId])
  @@map("grades")
}
```

**Vínculo y cálculo (documentado):**
- `ExamAttempt` → `OnlineExam.assessmentId` → `Assessment` (M08).
- La **inscripción** destino se deriva de `ExamAttempt.studentId` +
  `OnlineExam.groupId` → `Enrollment` activo de ese grupo; si no existe, es un
  error de datos (`INVALID_REFERENCE`).
- El `Grade` se guarda con `upsert` por `(assessmentId, enrollmentId)`.
- `score` del intento = Σ `AttemptAnswer.puntosObtenidos` (0 si aún hay
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

1. **Calificación automática de cerradas.** Al pasar un intento a `ENVIADO` o
   `EXPIRADO`, las preguntas `opcion_multiple`, `verdadero_falso` y
   `multiple_respuesta` se comparan con `question_options.es_correcta`; se fija
   `esCorrecta` y `puntosObtenidos` (todo o nada según `online_exam_questions.puntos`).
2. **Pendientes de revisión.** Las preguntas `abierta` quedan con `esCorrecta = NULL`
   y `puntosObtenidos = NULL` hasta que el profesor las revise.
3. **Puntaje del intento.** `ExamAttempt.score` = suma de
   `AttemptAnswer.puntosObtenidos`; se recalcula en cada cambio de respuestas o de
   revisión. Si quedan pendientes, el intento se marca como «parcialmente
   calificado» (no se escribe `Grade` definitivo hasta cerrar).
4. **Escritura al Assessment (criterio de intentos).** Se hace `upsert` de un
   único `Grade` por `(assessmentId, enrollmentId)`, aplicando el criterio
   configurado: el **mejor** intento (`MAX(score)`) o el **último**
   (`ORDER BY finishedAt DESC`). Nunca se escribe un `Grade` por intento.
5. **Rango de calificación.** El `score` escrito respeta `[0, max_score]` del
   `Assessment`; fuera de rango → 400 `SCORE_OUT_OF_RANGE`.
6. **Revisión manual recalcula.** `PATCH /attempts/:id/review` fija
   `esCorrecta`/`puntosObtenidos` de una respuesta abierta y, al completar todas,
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

Módulo bajo `api/src/modules/attempts/` (la calificación se apoya en el recurso
`online-exams` de M15). Los listados densos de resultados usan el contrato
server-side.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/online-exams/:id/results` | Resultados del examen (intentos, puntajes, estatus) | `attempts.view` (AREA) |
| POST | `/api/v1/online-exams/:id/results/query` | Listado server-side de resultados (alternativa densa) | `attempts.view` (AREA) |
| GET | `/api/v1/attempts/:id` | Detalle del intento con respuestas y revisión | `attempts.view` (AREA) |
| PATCH | `/api/v1/attempts/:id/review` | Revisión manual de una respuesta abierta | `attempts.review` (AREA) |
| POST | `/api/v1/attempts/:id/regrade` | Recalcula y reescribe el `Grade` (idempotente) | `attempts.review` (AREA) |

**Revisión manual** `PATCH /api/v1/attempts/:id/review`:

```json
{ "questionId": "…", "esCorrecta": true, "puntosObtenidos": 4 }
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
prefiere `POST .../results/query` con `{ page, limit, filters, sort }`.

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
| `attempts.view` | `ADMIN`/`CONTROL_ESCOLAR` (`ALL`), `PROFESOR` (`AREA`), `ALUMNO` (`OWN`) | por rol | El alumno ve su propio resultado si `mostrar_resultado`. |
| `attempts.review` | `PROFESOR` | `AREA` | Revisión manual y regrade; solo grupos del profesor. |
| `grades.capture` | `PROFESOR` | `AREA` | M08; M17 escribe el `Grade` con esta semántica de área. |

El scoping se aplica en la consulta (por `group_id` del examen para AREA, por
`studentId` para OWN) y va en `AND`. Escrituras fuera de alcance → 403
`INSUFFICIENT_PERMISSIONS`. El alumno **no** puede revisar ni recalificar.

## 8. Validaciones

Zod en `models/dto`; `ZodError` → 400 `VALIDATION_ERROR`.

| DTO | Campos | Reglas / código |
|---|---|---|
| `ReviewAnswerSchema` | `questionId` (uuid), `esCorrecta` (bool), `puntosObtenidos` (number ≥ 0) | `puntosObtenidos ≤ online_exam_questions.puntos`; si no → 400 `SCORE_OUT_OF_RANGE` |
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
| `ATTEMPT_REVIEWED` | `AttemptAnswer` | `{ esCorrecta: null, puntosObtenidos: null }` → `{ esCorrecta, puntosObtenidos }` |
| `GRADE_WRITTEN` | `Grade` | `null`/previo → `{ assessmentId, enrollmentId, score, criterion }` |

`criterion` (`MEJOR`/`ULTIMO`) se guarda en `metadata` para explicar por qué se
escribió ese puntaje. El regrade idempotente sin cambio de valor no genera un
nuevo `GRADE_WRITTEN`.

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): comparación de respuestas cerradas,
  cálculo de `score` con pendientes, selección del criterio mejor/último,
  validación de rango (reglas 1, 3, 4, 5).
- **Contrato** (`api/tests/e2e`): `results`/`review`/`regrade` con `ctxProfesor`;
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

- [ ] Migración/campos de trazabilidad sobre `ExamAttempt` (si se aprueban).
- [ ] Servicio de calificación automática de cerradas y de pendientes de abiertas.
- [ ] Escritura de `Grade` en el `Assessment` con criterio de intentos configurado.
- [ ] Módulo API (`routes/controller/service/dto`) con permisos AREA y bitácora.
- [ ] Pantallas de resultados y revisión con UI kit (`ITDataTable`, `KpiTile`, `ITDialog`).
- [ ] Specs del módulo pasando (solo los del módulo).
- [ ] Este README completo.

## 12. Decisiones abiertas

- **Dónde vive el criterio de intentos** (mejor/último): ¿campo en `OnlineExam`
  (M15), en el `Assessment` (M08) o en `settings` (M11)? Afecta a quién se le
  acredita el ajuste.
- **Columnas de trazabilidad** `gradedAt`/`reviewedBy`/`reviewedAt` en
  `ExamAttempt`: confirmar si se agregan o se modela una entidad de revisión.
- **Momento de escritura del `Grade`:** ¿solo al cerrar la revisión, o un valor
  provisional y luego el definitivo? Impacta reportes en vivo.
- **Puntaje parcial en preguntas de varias respuestas** (`multiple_respuesta`):
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
