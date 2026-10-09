# M15 — Creación y configuración de exámenes

| Campo | Valor |
|---|---|
| **Código** | M15 |
| **Versión** | 0.1 |
| **Estado** | Terminado (F5) |
| **Fase** | Examen en línea |
| **Depende de** | M14 (banco de reactivos), M07 (grupos), M08 (exámenes y calificaciones), M02 |
| **Habilita a** | M16 (aplicación al alumno) → M17 (calificación al kardex) |
| **Permisos** | `exams.view` · `exams.manage` · `exams.publish` (con alcance) |

## Implementación (F5, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/exams` (`exam.service.ts`) y `web/src/{entities/online-exam,features/exam/{exam-form,exams-list,exam-builder}}`; páginas `/exams` y `/exams/:id` (pestañas Configuración, Reactivos y Resultados).

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST | `/api/v1/online-exams/query` | `exams.view` | El alumno ve solo publicados de sus grupos |
| POST | `/api/v1/online-exams` | `exams.manage` | Grupo abierto del alcance; evaluación de M08 opcional (1:1) |
| GET / PATCH / DELETE | `/api/v1/online-exams/:id` | `exams.view` / `exams.manage` | Eliminar solo en borrador |
| POST · DELETE | `/api/v1/online-exams/:id/questions[/:questionId]` | `exams.manage` | Reemplaza la lista (orden y puntos propios) |
| POST | `/api/v1/online-exams/:id/publish` | `exams.publish` | Requiere preguntas activas y aprobatorio ≤ total |
| POST | `/api/v1/online-exams/:id/close` | `exams.manage` | Envía y califica los intentos en curso |

Decisiones (sección 12):
- Configuración: ventana (apertura/cierre), duración, intentos, barajar preguntas/opciones, mostrar resultado, puntaje aprobatorio y criterio `BEST`/`LAST`.
- Con el primer intento solo cambian instrucciones, cierre y mostrar resultado. Ver [D-038](../../../DECISIONES.md).
- La web captura fecha (calendario del kit) y hora en pasos de 15 min.

## 1. Objetivo

Permitir al profesor configurar exámenes en línea por grupo: seleccionar y ordenar
reactivos del banco, definir puntos, duración, ventana de apertura/cierre,
intentos, aleatorización y puntaje aprobatorio, vincular el examen a una evaluación
de M08 y publicarlo para su aplicación. Lo usa el profesor; lo consume M16.

## 2. Alcance

**Incluye**
- CRUD de exámenes en estado `DRAFT`.
- Constructor de examen: selección de reactivos, orden, puntos y aleatorización.
- Configuración de reglas (duración, intentos, ventana de fechas, mostrar
  resultado, puntaje aprobatorio).
- **Publicación** (`DRAFT → PUBLISHED`) y **cierre** (`CLOSED`).
- Vínculo opcional a una evaluación (`assessmentId`, M08).

**No incluye (en este módulo)**
- La captura/edición de reactivos: M14.
- Aplicar el examen y guardar respuestas: M16.
- Calificar y escribir al kardex: M17.

## 3. Modelo de datos (Prisma)

Convenciones: `id uuid`, `createdAt`/`updatedAt`, `@@map` snake_case plural,
enums `UPPER_SNAKE`. El estado del examen (`status`) gobierna su ciclo de vida;
no se hace `DELETE` físico de exámenes publicados.

```prisma
enum OnlineExamStatus {
  DRAFT
  PUBLISHED
  CLOSED
}

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

model OnlineExamQuestion {
  id         String   @id @default(uuid())
  examId     String   @map("exam_id")
  questionId String   @map("question_id")
  points     Decimal  @db.Decimal(6, 2)
  sortOrder  Int      @map("sort_order")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  exam     OnlineExam @relation(fields: [examId], references: [id], onDelete: Cascade)
  question Question   @relation(fields: [questionId], references: [id])

  @@unique([examId, questionId])
  @@index([questionId])
  @@map("online_exam_questions")
}
```

**Índices:** por `groupId`, `assessmentId`, `status`; único `(examId, questionId)`
en `online_exam_questions`.
**Relaciones:** `OnlineExam` → `Group` (M07) y `Assessment` (M08, opcional);
`OnlineExam` 1‑N `OnlineExamQuestion`; `OnlineExamQuestion` → `Question` (M14);
`OnlineExam` 1‑N `ExamAttempt` (M16). El alcance por grupo se aplica en el servicio.

## 4. Reglas de negocio

1. Un examen **publicado** no puede cambiar sus preguntas si ya tiene **intentos
   iniciados** (error `EXAM_PUBLISHED_LOCKED`).
2. `opensAt` debe ser anterior a `closesAt`.
3. `durationMin` > 0 e `maxAttempts` ≥ 1.
4. Solo se publica un examen con **al menos una pregunta**.
5. Todas las preguntas deben estar `ACTIVE` (M14) y pertenecer al curso del grupo.
6. `passingScore` debe ser ≤ a la suma de puntos de las preguntas.
7. La suma de puntos del examen es la suma de `OnlineExamQuestion.points`.
8. `assessmentId` (si viene) debe pertenecer al **mismo grupo** que el examen.
9. Un examen `CLOSED` no admite edición ni nuevas preguntas.
10. No se permite borrar físicamente un examen publicable/aplicado: se **cierra**.
11. Editar preguntas/fechas de un examen sin intentos reinicia la consistencia
    (recalcular total de puntos).

## 5. API

Módulo en `api/src/modules/online-exams/`
(`routes/ · controllers/ · services/ · models/{dto,entity}/`), montado en
`api.router.ts` con wiring DIP del `AuditPort`.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/online-exams/:id` | Detalle con preguntas | `exams.view` |
| POST | `/api/v1/online-exams/query` | Listado server-side | `exams.view` |
| POST | `/api/v1/online-exams` | Crear examen (borrador) | `exams.manage` |
| PATCH | `/api/v1/online-exams/:id` | Editar configuración | `exams.manage` |
| DELETE | `/api/v1/online-exams/:id` | Cerrar/baja lógica | `exams.manage` |
| POST | `/api/v1/online-exams/:id/questions` | Fijar/reemplazar preguntas | `exams.manage` |
| DELETE | `/api/v1/online-exams/:id/questions/:questionId` | Quitar pregunta | `exams.manage` |
| POST | `/api/v1/online-exams/:id/publish` | Publicar (`DRAFT → PUBLISHED`) | `exams.publish` |
| POST | `/api/v1/online-exams/:id/close` | Cerrar (`→ CLOSED`) | `exams.manage` |

**Listado** `POST /api/v1/online-exams/query`:
```json
{
  "page": 1,
  "limit": 20,
  "filters": { "groupId": "…", "status": "PUBLISHED", "title": "PARTIAL" },
  "sort": { "key": "opensAt", "direction": "desc" }
}
```

**Fijar preguntas** `POST /api/v1/online-exams/:id/questions`:
```json
{
  "questions": [
    { "questionId": "uuid", "points": 2, "sortOrder": 1 },
    { "questionId": "uuid", "points": 3, "sortOrder": 2 }
  ]
}
```

**Publicar** `POST /api/v1/online-exams/:id/publish` — responde 200 con el examen
publicado; 409 `EXAM_PUBLISHED_LOCKED` si hay intentos iniciados y se intentó
modificar preguntas; 409 `VALIDATION_ERROR`/`RECORD_NOT_FOUND` según el caso.

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `onlineExamApi` | `entities/online-exam/api` | `/online-exams/query`, CRUD, publish |
| `types` / `useOnlineExam` | `entities/online-exam/model` | Tipos, hooks y estado |
| `manageExam` | `features/exam/manage` | Configuración con `ITFormBuilder` |
| `buildExam` | `features/exam/builder` | Selección/orden de reactivos (`ITDataTable`) |
| `publishExam` | `features/exam/publish` | `ITDialog` de confirmación |
| `OnlineExamsPage` / `OnlineExamDetailPage` | `pages/exams` | Listado y constructor |

Constructor de examen con **`ITDataTable`** (banco de reactivos filtrable, con
puntos editables y orden por drag/reorden) y **`ITFormBuilder`** (configuración),
más `ITDialog` para publicar/cerrar. i18n con el namespace **`exams`**
(`shared/i18n/locales/{es,en}/exams.json`).

## 7. Permisos y alcance

Permisos `recurso.accion` con alcance (`NONE < OWN < AREA < ALL`), aplicados en el
servicio:

| Permiso | Descripción | Alcance típico |
|---|---|---|
| `exams.view` | Ver exámenes | PROFESOR `AREA` (sus grupos), ALUMNO `OWN` (exámenes publicados de sus grupos), ADMIN/CONTROL_ESCOLAR `ALL` |
| `exams.manage` | Crear/editar/configurar/cerrar | PROFESOR `AREA`, ADMIN `ALL` |
| `exams.publish` | Publicar | PROFESOR `AREA`, ADMIN `ALL` |

`AREA` se resuelve por `groupId` (grupos del profesor). Ver
[`roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

Zod en `models/dto/online-exams.dto.ts` (`Schema.parse` en el controller →
`VALIDATION_ERROR` con `details` por campo):

- `title`: requerido; `durationMin` > 0; `maxAttempts` ≥ 1.
- `opensAt`/`closesAt`: ISO UTC, apertura < cierre (`INVALID_RANGE`).
- `passingScore`: ≥ 0 y ≤ total de puntos (`EXAM_SCORE_INVALID`).
- `groupId`/`assessmentId`: UUID existente y coherente (`INVALID_REFERENCE`).
- `questions`: no vacío al publicar; reactivos `ACTIVE` y del curso del grupo.
- Bloqueo de publicación: `EXAM_PUBLISHED_LOCKED` (409) al editar preguntas con
  intentos iniciados.
- `Idempotency-Key` en `publish`/`create` si se expone reintento
  (`INVALID_IDEMPOTENCY_KEY`, `IDEMPOTENCY_KEY_REUSED`).

## 9. Bitácora

Acciones vía `AuditPort` con `previousState`/`newState`:

| Acción | Cuándo |
|---|---|
| `EXAM_CREATED` | Alta del examen |
| `EXAM_UPDATED` | Cambios de configuración |
| `EXAM_QUESTIONS_SET` | Alta/reemplazo/quita de reactivos |
| `EXAM_PUBLISHED` | Publicación |
| `EXAM_CLOSED` | Cierre manual |
| `EXAM_DEACTIVATED` | Baja lógica (solo borradores) |

Ver [`bitacora.md`](../../seguridad/bitacora.md) (acciones M15/M16).

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): reglas 1–8 (ventana de fechas, intentos,
  puntaje aprobatorio, coherencia de grupo/evaluación, suma de puntos).
- **Contrato API E2E** (`api/tests/e2e`): CRUD, `query`, fijar preguntas,
  publicar/cerrar; `EXAM_PUBLISHED_LOCKED` con intentos iniciados; permisos
  (401/403); bitácora.
- **Navegador Web E2E** (`web/tests/e2e`): crear examen, seleccionar reactivos,
  publicar y verificar bloqueo tras un intento.
- **Spec(s) del módulo**: `api/tests/e2e/online-exams.spec.ts`,
  `web/tests/e2e/online-exams.spec.ts`.

Regla de trabajo: correr solo el spec del cambio. Ver
[`estrategia-pruebas.md`](../../pruebas/estrategia-pruebas.md).

## 11. Criterios de aceptación

- [ ] Migración y modelo Prisma (`OnlineExam`, `OnlineExamQuestion`).
- [ ] Módulo API (routes/controller/service/dto/entity) con permisos y bitácora.
- [ ] Bloqueo `EXAM_PUBLISHED_LOCKED` implementado y probado.
- [ ] Constructor de examen web con `ITDataTable`/`ITFormBuilder`.
- [ ] Specs pasando (solo los del módulo).
- [ ] Este README completo.

## 12. Decisiones abiertas

- ¿Puntos por pregunta heredan `Question.points` o se definen por examen?
- ¿Se permite duplicar un examen como plantilla?
- Comportamiento al agregar un alumno al grupo después de publicar.
- ¿Publicación programada o solo manual?
- ¿Se admite más de un examen vinculado a la misma evaluación de M08?

Registrar en [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Diccionario de datos — M15](../../modelo-datos/diccionario-datos.md)
- [API modular](../../arquitectura/api-modular.md) · [Convenciones de API](../../api/convenciones.md)
- [Catálogo de errores](../../api/errores.md) (`EXAM_PUBLISHED_LOCKED`, `EXAM_NOT_AVAILABLE`)
- [Web FSD](../../arquitectura/web-fsd.md) · [Axzy UI System](../../arquitectura/axzy-ui-system.md)
- [Roles y permisos](../../seguridad/roles-permisos.md) · [Bitácora](../../seguridad/bitacora.md)
- [M14 — Banco de reactivos](../M14-banco-reactivos/README.md) · [M16 — Aplicación al alumno](../M16-aplicacion-alumno/README.md)
- [Roadmap](../../guia/roadmap.md) · [Índice de módulos](../README.md)
