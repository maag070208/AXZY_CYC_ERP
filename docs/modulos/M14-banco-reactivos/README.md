# M14 — Banco de reactivos

| Campo | Valor |
|---|---|
| **Código** | M14 |
| **Versión** | 0.1 |
| **Estado** | Terminado (F5) |
| **Fase** | Examen en línea |
| **Depende de** | M07 (cursos), M02 (RBAC/bitácora) |
| **Habilita a** | M15 (configuración de exámenes) → M16/M17 |
| **Permisos** | `questions.view` · `questions.create` · `questions.edit` · `questions.import` (con alcance) |

## Implementación (F5, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/questions` y `web/src/{entities/question,features/question}`; página `/questions` (menú «Reactivos», requiere `questions.view`).

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST | `/api/v1/questions/query` | `questions.view` | Tabla server-side (curso, tipo, dificultad, estatus, texto) |
| POST | `/api/v1/questions` | `questions.create` | Reglas de opciones por tipo |
| GET / PATCH | `/api/v1/questions/:id` | `questions.view` / `questions.edit` | Editar se bloquea si ya se respondió (`QUESTION_IN_USE`) |
| DELETE · POST `…/reactivate` | `/api/v1/questions/:id` | `questions.edit` | Desactivar / reactivar (baja lógica) |
| POST | `/api/v1/questions/import?preview=true` | `questions.import` | CSV multipart `file`; aplicar exige `Idempotency-Key` |

Decisiones (sección 12):
- Tipos `MULTIPLE_CHOICE` (una correcta), `TRUE_FALSE` (dos opciones, una correcta), `MULTIPLE_ANSWER` (≥1 correcta) y `OPEN` (sin opciones, revisión manual).
- El AREA del profesor son los cursos de sus grupos.
- Un reactivo usado en un intento queda congelado (solo desactivar). Ver [D-038](../../../DECISIONES.md).
- Importación en dos pasos: vista previa con filas rechazadas y aplicar idempotente. Ver [D-041](../../../DECISIONES.md).

## 1. Objetivo

Administrar el banco de reactivos del que se arman los exámenes en línea: crear,
editar, clasificar, desactivar e importar preguntas (opción múltiple, verdadero/
falso, respuesta múltiple y abierta) por curso y tema. Lo usan profesores y
control escolar; lo consumen los módulos de exámenes.

## 2. Alcance

**Incluye**
- CRUD de preguntas y sus opciones de respuesta.
- Clasificación por curso, tema, tipo, dificultad y estado (`ACTIVE`/`INACTIVE`).
- Imagen opcional por pregunta.
- **Importación masiva** desde CSV con vista previa e idempotencia.
- Desactivación lógica (nunca borrado físico de preguntas ya usadas).

**No incluye (en este módulo)**
- Armar/publicar exámenes y su aleatorización: M15.
- Aplicar exámenes y calificar: M16/M17.
- Gestión de cursos y grupos: M07.

## 3. Modelo de datos (Prisma)

Convenciones: `id uuid`, `createdAt`/`updatedAt`, `@@map` snake_case plural,
enums `UPPER_SNAKE`. La desactivación es el borrado lógico de dominio
(`status = INACTIVE`); no se hace `DELETE` físico.

```prisma
enum QuestionType {
  MULTIPLE_CHOICE
  TRUE_FALSE
  MULTIPLE_ANSWER
  OPEN
}

enum QuestionDifficulty {
  EASY
  MEDIUM
  HARD
}

enum QuestionStatus {
  ACTIVE
  INACTIVE
}

model Question {
  id         String              @id @default(uuid())
  courseId   String              @map("course_id")
  topic      String?
  type       QuestionType
  text       String              @db.Text
  /// Puntos sugeridos al agregarla a un examen (M15 puede cambiarlos).
  points     Decimal             @db.Decimal(6, 2)
  difficulty QuestionDifficulty?
  status     QuestionStatus      @default(ACTIVE)
  createdBy  String?             @map("created_by")
  createdAt  DateTime            @default(now()) @map("created_at")
  updatedAt  DateTime            @updatedAt @map("updated_at")

  course        Course               @relation(fields: [courseId], references: [id])
  options       QuestionOption[]
  examQuestions OnlineExamQuestion[]
  answers       AttemptAnswer[]

  @@index([courseId])
  @@index([type])
  @@index([difficulty])
  @@index([status])
  @@map("questions")
}

model QuestionOption {
  id         String   @id @default(uuid())
  questionId String   @map("question_id")
  text       String   @db.Text
  isCorrect  Boolean  @default(false) @map("is_correct")
  sortOrder  Int      @map("sort_order")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@index([questionId])
  @@map("question_options")
}
```

**Índices:** por `courseId`, `type`, `difficulty`, `status` y `questionId` (para
los filtros de tabla y la carga de opciones).
**Relaciones:** `Question` → `Course` (M07); `Question` 1‑N `QuestionOption`;
`Question` 1‑N `OnlineExamQuestion` (M15). El alcance por curso filtra por
`courseId`.

## 4. Reglas de negocio

1. Toda pregunta **cerrada** (`MULTIPLE_CHOICE`, `TRUE_FALSE`,
   `MULTIPLE_ANSWER`) debe tener **al menos una opción correcta**.
2. `TRUE_FALSE` tiene exactamente **2 opciones** y **una** correcta.
3. `MULTIPLE_CHOICE` tiene **exactamente una** opción correcta.
4. `MULTIPLE_ANSWER` tiene **al menos una** opción correcta.
5. `OPEN` no lleva opciones.
6. Las preguntas ya **usadas en exámenes aplicados** (con intentos iniciados) no se
   eliminan: solo se **desactivan** (`status = INACTIVE`).
7. `points` debe ser mayor que 0.
8. `courseId` debe existir y estar activo.
9. El import CSV es **idempotente** (`Idempotency-Key`) y siempre permite una
   pasada de **vista previa** que no persiste.
10. Una pregunta `INACTIVE` no puede agregarse a un examen nuevo (M15).

## 5. API

Módulo en `api/src/modules/questions/`
(`routes/ · controllers/ · services/ · models/{dto,entity}/`), montado en
`api.router.ts` con wiring DIP del `AuditPort`.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/questions/:id` | Detalle con opciones | `questions.view` |
| POST | `/api/v1/questions/query` | Listado server-side | `questions.view` |
| POST | `/api/v1/questions` | Crear pregunta + opciones | `questions.create` |
| PATCH | `/api/v1/questions/:id` | Editar pregunta/opciones | `questions.edit` |
| DELETE | `/api/v1/questions/:id` | Desactivar (lógico) | `questions.edit` |
| POST | `/api/v1/questions/import?preview=true` | Vista previa del CSV | `questions.import` |
| POST | `/api/v1/questions/import` | Importación masiva (CSV) | `questions.import` |

**Listado** `POST /api/v1/questions/query` (contrato `ITDataTable`):
```json
{
  "page": 1,
  "limit": 20,
  "filters": { "courseId": "…", "type": "MULTIPLE_CHOICE", "status": "ACTIVE", "topic": "álgebra" },
  "sort": { "key": "topic", "direction": "asc" }
}
```

**Crear** `POST /api/v1/questions` (Zod `CreateQuestionSchema`):
```json
{
  "courseId": "uuid",
  "topic": "Ecuaciones lineales",
  "type": "MULTIPLE_CHOICE",
  "text": "Resuelve 2x + 3 = 7",
  "points": 2,
  "difficulty": "MEDIUM",
  "options": [
    { "text": "x = 2", "isCorrect": true, "sortOrder": 1 },
    { "text": "x = 5", "isCorrect": false, "sortOrder": 2 }
  ]
}
```

**Importar** `POST /api/v1/questions/import` (multipart CSV, cabecera
`Idempotency-Key` obligatoria al aplicar; `?preview=true` solo devuelve el diff):
```json
{
  "total": 120,
  "created": 118,
  "updated": 0,
  "rejected": [
    { "row": 7, "code": "QUESTION_OPTION_REQUIRED", "message": "…" }
  ]
}
```

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `questionApi` | `entities/question/api` | `/questions/query`, CRUD e import | 
| `types` / `useQuestion` | `entities/question/model` | Tipos y hooks de datos |
| `createQuestion` | `features/question/create` | Alta con `ITFormBuilder` |
| `editQuestion` | `features/question/edit` | Edición y opciones |
| `importQuestions` | `features/question/import` | `ITDropfile` (CSV) + preview |
| `deactivateQuestion` | `features/question/deactivate` | `ITDialog` de confirmación |
| `QuestionsPage` | `pages/questions` | `ITPage` + `ITDataTable` |

Pantallas con `ITPage` + `ITDataTable` (filtros y orden por columna, según la
regla de la casa) y `ITFormBuilder` para alta/edición; `ITDropfile` para la
importación. i18n con el namespace **`questions`**
(`shared/i18n/locales/{es,en}/questions.json`).

## 7. Permisos y alcance

Permisos `recurso.accion` con alcance (`NONE < OWN < AREA < ALL`), aplicados en el
servicio (`AND` en la consulta):

| Permiso | Descripción | Alcance típico |
|---|---|---|
| `questions.view` | Ver preguntas | PROFESOR `AREA` (sus cursos), CONTROL_ESCOLAR `ALL`, ADMIN `ALL` |
| `questions.create` | Crear | PROFESOR `AREA`, ADMIN `ALL` |
| `questions.edit` | Editar/desactivar | PROFESOR `AREA`, ADMIN `ALL` |
| `questions.import` | Importación masiva | ADMIN `ALL` (PROFESOR `AREA` opcional) |

`AREA` se resuelve por `courseId` (cursos del profesor). Ver
[`roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

Zod en `models/dto/questions.dto.ts` (`Schema.parse` en el controller →
`VALIDATION_ERROR` con `details` por campo):

- `text`: requerido, longitud mínima.
- `type`: enum `QuestionType`.
- `points`: `> 0`.
- `courseId`: UUID válido y existente (`INVALID_REFERENCE`).
- `options`: reglas de correctas por tipo (códigos `QUESTION_OPTION_REQUIRED`,
  `QUESTION_OPTION_COUNT_INVALID`, `QUESTION_MULTIPLE_CORRECT`).
- Import CSV: columnas obligatorias, tipo de fila y tamaño máximo
  (`FILE_TOO_LARGE`); filas inválidas se rechazan una por una en `rejected`
  sin abortar el lote.
- `Idempotency-Key`: `^[A-Za-z0-9_-]{8,100}$` (`INVALID_IDEMPOTENCY_KEY`);
  reuso por otro usuario → `IDEMPOTENCY_KEY_REUSED`.

## 9. Bitácora

Acciones vía `AuditPort` con `previousState`/`newState`:

| Acción | Cuándo |
|---|---|
| `QUESTION_CREATED` | Alta de pregunta |
| `QUESTION_UPDATED` | Edición de pregunta u opciones |
| `QUESTION_DEACTIVATED` | Desactivación lógica |
| `QUESTIONS_IMPORTED` | Importación masiva (total, creados, rechazados) |

Ver [`bitacora.md`](../../seguridad/bitacora.md).

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): reglas 1–5 de opciones correctas por tipo;
  regla 7 de puntos; parser y validación del CSV; `status` por defecto.
- **Contrato API E2E** (`api/tests/e2e`): CRUD, `query`, permisos (401/403),
  idempotencia y preview de importación; bitácora en escrituras.
- **Navegador Web E2E** (`web/tests/e2e`): alta con `ITFormBuilder`, listado con
  filtros, importación de CSV y desactivación.
- **Spec(s) del módulo**: `api/tests/e2e/questions.spec.ts`,
  `web/tests/e2e/questions.spec.ts`.

Regla de trabajo: correr solo el spec del cambio. Ver
[`estrategia-pruebas.md`](../../pruebas/estrategia-pruebas.md).

## 11. Criterios de aceptación

- [ ] Migración y modelo Prisma (`Question`, `QuestionOption`).
- [ ] Módulo API (routes/controller/service/dto/entity) con permisos y bitácora.
- [ ] Importación CSV con preview e idempotencia.
- [ ] Pantallas web con `ITDataTable` + `ITFormBuilder` + `ITDropfile`.
- [ ] Specs pasando (solo los del módulo).
- [ ] Este README completo.

## 12. Decisiones abiertas

- ¿Edición masiva de puntos/dificultad desde el listado?
- Formato exacto del CSV de importación (cabeceras y codificación).
- ¿Se permiten preguntas compartidas entre cursos del mismo nivel?
- Política de imágenes: tamaño máximo y reutilización entre reactivos.
- ¿Versionado de reactivos para conservar el texto original usado en un examen?

Registrar en [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Diccionario de datos — M14](../../modelo-datos/diccionario-datos.md)
- [API modular](../../arquitectura/api-modular.md) · [Convenciones de API](../../api/convenciones.md)
- [Catálogo de errores](../../api/errores.md)
- [Web FSD](../../arquitectura/web-fsd.md) · [Axzy UI System](../../arquitectura/axzy-ui-system.md)
- [Roles y permisos](../../seguridad/roles-permisos.md) · [Bitácora](../../seguridad/bitacora.md)
- [M15 — Configuración de exámenes](../M15-examenes-configuracion/README.md)
- [Roadmap](../../guia/roadmap.md) · [Índice de módulos](../README.md)
