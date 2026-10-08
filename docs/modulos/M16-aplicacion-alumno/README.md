# M16 — Aplicación al alumno (examen en línea)

| Campo | Valor |
|---|---|
| **Código** | M16 |
| **Versión** | 0.1 |
| **Estado** | Planeado |
| **Fase** | Calidad y examen en línea |
| **Depende de** | M15 (Configuración de exámenes), M14 (Banco de reactivos), M07 (Cursos, grupos e inscripciones), M02 (Autenticación, roles y bitácora) |
| **Habilita a** | M17 (Calificación automática al kardex), M10/M21 (reportes) |
| **Permisos** | `attempts.take` (OWN) |

## 1. Objetivo

Permitir que el alumno **inscrito** presente un examen publicado en línea desde el
navegador, con el tiempo controlado por el servidor, guardado automático de
respuestas para no perderlas y envío manual o automático al expirar el tiempo.

## 2. Alcance

**Incluye**
- Inicio del intento validando inscripción al grupo, ventana de fechas e intentos disponibles.
- Guardado automático de respuestas (`PUT /attempts/:id/answers`).
- Envío manual y **envío automático al expirar** (expiración calculada en el servidor).
- Registro **opcional** de eventos de cambio de pestaña/visibilidad (señales de foco).
- Pantalla de examen con temporizador derivado de la hora del servidor y aviso de expiración.

**No incluye (en este módulo)**
- Creación, edición, publicación y configuración del examen (M15).
- Banco de reactivos y sus opciones (M14).
- Calificación, revisión manual y escritura al kardex (M17).
- Recordatorios de apertura/cierre (M19); solo se consumen si existen.

## 3. Modelo de datos (Prisma)

Los intentos y sus respuestas son registros **transaccionales e inmutables** una
vez enviados: no llevan `active` ni borrado lógico, se conservan íntegros para
auditoría y para la calificación de M17 ([D-003](../../../DECISIONES.md)).
Los nombres conservan los campos del spec; tablas en `snake_case` plural y enums
`UPPER_SNAKE`.

```prisma
enum AttemptStatus {
  EN_CURSO
  ENVIADO
  EXPIRADO
}

model ExamAttempt {
  id         String        @id @default(uuid())
  examId     String
  studentId  String
  startedAt  DateTime      @default(now())
  finishedAt DateTime?
  status     AttemptStatus @default(EN_CURSO)
  score      Decimal?      @db.Decimal(6, 2) // lo completa M17
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  exam    OnlineExam     @relation(fields: [examId], references: [id])
  student Student        @relation(fields: [studentId], references: [id])
  answers AttemptAnswer[]

  @@index([examId, studentId])
  @@index([studentId, status])
  @@map("exam_attempts")
}

model AttemptAnswer {
  id              String   @id @default(uuid())
  attemptId       String
  questionId      String
  respuesta       Json?    // respuesta elegida/capturada (opción, arreglo, texto)
  esCorrecta      Boolean? // NULL mientras requiere revisión manual (M17)
  puntosObtenidos Decimal? @db.Decimal(6, 2)
  answeredAt      DateTime @default(now())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  attempt  ExamAttempt @relation(fields: [attemptId], references: [id])
  question Question    @relation(fields: [questionId], references: [id])

  @@unique([attemptId, questionId])
  @@index([attemptId])
  @@map("attempt_answers")
}
```

**Índices:**
- `exam_attempts`: `(examId, studentId)` para contar intentos y recuperar el vigente;
  `(studentId, status)` para el historial del alumno.
- `attempt_answers`: único `(attemptId, questionId)` para que el autosave sea un
  `upsert` idempotente; `(attemptId)` para cargar/ envíar todo el intento.

**Relaciones:**
- `ExamAttempt.exam → OnlineExam` (M15) — de aquí salen `duracion_min`,
  `intentos_max`, `fecha_apertura`, `fecha_cierre` y `group_id`.
- `ExamAttempt.student → Student` (M03) — dueño del intento.
- `AttemptAnswer.question → Question` (M14) — debe existir en
  `online_exam_questions` del examen.
- Un alumno puede tener varios intentos del mismo examen (hasta `intentos_max`);
  por eso **no** hay único `(examId, studentId)`.

> Columnas estándar `created_at`/`updated_at` en ambas tablas; `deleted_at` **No
> aplica** (registros inmutables). Detalle en
> [`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md#m16--aplicación-al-alumno).

## 4. Reglas de negocio

Numeradas y verificables (cada una mapea a una prueba de §10):

1. **Inscripción obligatoria.** Solo el alumno con `enrollment` **activo** en el
   `group_id` del examen puede iniciar. En otro caso: 403 `INSUFFICIENT_PERMISSIONS`
   (o 404 si el examen no existe).
2. **Ventana de fechas.** El intento solo inicia si `fecha_apertura ≤ now ≤ fecha_cierre`
   y el examen está en status `PUBLICADO`. Fuera de eso: 409 `EXAM_NOT_AVAILABLE`.
3. **Intentos disponibles.** `count(ExamAttempt del alumno para el examen) < intentos_max`.
   Si se agotó: 409 `EXAM_NOT_AVAILABLE`. No se crean intentos de reemplazo.
4. **Tiempo en el servidor.** La hora de expiración es `startedAt + duracion_min`,
   calculada en el servidor. Al vencer, el intento se envía automáticamente con
   status `EXPIRADO` (verificación perezosa en cada request + worker programado).
   El cliente nunca decide el tiempo.
5. **Guardado automático.** `PUT /attempts/:id/answers` persiste las respuestas
   recibidas con `upsert` por `(attemptId, questionId)`; puede llamarse varias
   veces sin duplicar. El front agrupa los cambios cada pocos segundos.
6. **Inmutabilidad al cerrar.** Un intento `ENVIADO` o `EXPIRADO` no admite más
   respuestas ni un segundo `submit`: 409 `EXAM_NOT_AVAILABLE`.
7. **Respuestas válidas.** Cada `questionId` enviado debe pertenecer a
   `online_exam_questions` del examen del intento; si no, 400 `INVALID_REFERENCE`.
8. **Eventos de foco (opcional).** Los cambios de pestaña/visibilidad se registran
   como eventos de sesión (contador + marcas de tiempo en `metadata`) sin bloquear
   el intento ni invalidarlo.

## 5. API

Módulo bajo `api/src/modules/attempts/` (`routes/ · controllers/ · services/ ·
models/{dto,entity}/`). El alta de intentos cuelga del recurso `online-exams`
(M15); el resto, de `attempts`.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| POST | `/api/v1/online-exams/:id/start` | Inicia un intento del alumno | `attempts.take` (OWN) |
| GET | `/api/v1/attempts/:id` | Estado del intento + temporizador + respuestas persistidas | `attempts.take` (OWN) |
| PUT | `/api/v1/attempts/:id/answers` | Guardado automático de respuestas | `attempts.take` (OWN) |
| POST | `/api/v1/attempts/:id/submit` | Envía el intento y fija `finishedAt` | `attempts.take` (OWN) |
| POST | `/api/v1/attempts/:id/events` | Evento de cambio de pestaña (opcional) | `attempts.take` (OWN) |

**Inicio** `POST /api/v1/online-exams/:id/start` (sin body; acepta
`Idempotency-Key` para no crear dos intentos por doble clic):

```json
{
  "attemptId": "8f0e…",
  "status": "EN_CURSO",
  "startedAt": "2026-06-01T15:00:00.000Z",
  "endsAt": "2026-06-01T16:00:00.000Z",
  "remainingSeconds": 3600,
  "questions": [
    { "questionId": "…", "tipo": "opcion_multiple", "enunciado": "…",
      "puntos": 2, "orden": 1, "respuesta": null }
  ]
}
```

> `endsAt`/`remainingSeconds` los calcula el servidor; el cliente solo los
> presenta. Las opciones se sirven sin `es_correcta` cuando
> `mostrar_resultado=false`.

**Autosave** `PUT /api/v1/attempts/:id/answers`:

```json
{ "answers": [
  { "questionId": "…", "respuesta": "b" },
  { "questionId": "…", "respuesta": [1, 3] }
] }
```

Responde `200` con `{ "saved": 2, "savedAt": "2026-06-01T15:00:42.000Z" }`.
Si el intento ya cerró → 409 `EXAM_NOT_AVAILABLE`.

**Envío** `POST /api/v1/attempts/:id/submit` (body opcional con las respuestas
pendientes; cierra y marca `finishedAt`):

```json
{ "attemptId": "8f0e…", "status": "ENVIADO",
  "finishedAt": "2026-06-01T15:55:10.000Z", "score": null }
```

`score` queda `null` hasta que M17 califique. Si el envío es por expiración,
`status` es `EXPIRADO`.

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `attemptApi` / tipos | `entities/attempt` | API contra `@shared/api/client` + modelo `ExamAttempt`/`AttemptAnswer` |
| `useAttempt` | `entities/attempt` | Hooks de datos del intento vigente |
| `start-exam` | `features/attempt/start-exam` | Inicia el intento y navega al runner |
| `autosave-answer` | `features/attempt/autosave-answer` | `useAutosave` (intervalo/debounce) + `PUT answers` |
| `submit-attempt` | `features/attempt/submit-attempt` | Envío manual con `ITConfirmDialog` |
| `exam-timer` | `widgets/exam-timer` | Temporizador derivado de `endsAt` (no del reloj local) |
| `ExamRunnerPage` | `pages/exam` | Pantalla de examen |
| `AttemptResultPage` | `pages/attempt` | Acuse de recibo (sin puntaje si `mostrar_resultado=false`) |

Pantalla con chasis `ITPage` + secciones `PanelCard`; las preguntas se renderizan
con `ITFormBuilder` (campos `custom` por tipo) o componentes `IT*`, y el envío se
confirma con `ITDialog`/`ITConfirmDialog`; el aviso de expiración usa `ITAlert`.
Entidad y features según la tabla; i18n con namespace **`attempts`**
(`shared/i18n/locales/{es,en}/attempts.json`). El temporizador nunca confía en la
hora del navegador: parte de `remainingSeconds`/`endsAt` del servidor.

## 7. Permisos y alcance

Ver [`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md).

| Permiso | Roles | Alcance | Notas |
|---|---|---|---|
| `attempts.take` | `ALUMNO` | `OWN` | Solo sus propios intentos (`studentId = @user.student`). |
| `attempts.view` | `ADMIN`, `CONTROL_ESCOLAR` (`ALL`), `PROFESOR` (`AREA`) | por rol | Lectura de intentos (usado por M17). |
| `attempts.review` | `PROFESOR` | `AREA` | Revisión manual (M17). |

Reglas de scoping: el servicio aplica `withinScope` por `studentId` (OWN) o por
`group_id` del examen (AREA); el alcance se agrega en `AND` en la consulta, nunca
en el cliente. Una política ABAC puede denegar el inicio fuera de condiciones
(p. ej. bloqueo por incidentes) → 403 `POLICY_DENIED`.

## 8. Validaciones

Zod en `models/dto`; whitelist estricta. `ZodError` → 400 `VALIDATION_ERROR` con
`details` por campo ([`../../api/errores.md`](../../api/errores.md)).

| DTO | Campos | Reglas / código |
|---|---|---|
| `StartAttemptParams` | `id` (uuid) | `REQUIRED_FIELD` |
| `SaveAnswersSchema` | `answers[] { questionId, respuesta }` | arreglo 1..N; `questionId` uuid; `respuesta` string/number/arreglo → `INVALID_FORMAT` |
| `SubmitAttemptSchema` | `answers[]?` | opcional; si viene, mismas reglas |
| `AttachEventSchema` | `type` (`TAB_BLUR`/`TAB_FOCUS`), `at?` | enum → `INVALID_FORMAT` |

Validaciones de dominio (no Zod): inscripción activa, ventana, intentos máximos e
inmutabilidad → 409 `EXAM_NOT_AVAILABLE`; pregunta ajena al examen → 400
`INVALID_REFERENCE`.

## 9. Bitácora

Vía `AuditPort` ([`../../seguridad/bitacora.md`](../../seguridad/bitacora.md)),
con `previousState`/`newState` y atada a la transacción del cambio.

| Acción | `entityType` | `previousState` / `newState` |
|---|---|---|
| `ATTEMPT_STARTED` | `ExamAttempt` | `null` → `{ examId, studentId, status: EN_CURSO }` |
| `ATTEMPT_SUBMITTED` | `ExamAttempt` | `{ status: EN_CURSO }` → `{ status: ENVIADO/EXPIRADO, finishedAt }` |
| `ATTEMPT_EXPIRED` | `ExamAttempt` | `{ status: EN_CURSO }` → `{ status: EXPIRADO }` (autor sistema/worker) |

El autosave **no** genera un log por respuesta (evita ruido); los eventos de foco
(opcional) se persisten como `metadata` del intento y, si se requieren
trazables, con una acción agregada `ATTEMPT_FOCUS_EVENT`. Nunca se registran
respuestas correctas ni el contenido de los reactivos.

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): cálculo de expiración
  (`startedAt + duracion_min`), evaluación de ventana, conteo de intentos, upsert
  idempotente de respuestas (reglas 3, 4, 5).
- **Contrato** (`api/tests/e2e`): `start`/`answers`/`submit` con `ctxAlumno`;
  401 sin token, 403 fuera de alcance, 409 `EXAM_NOT_AVAILABLE` fuera de ventana y
  sin intentos, 409 al responder un intento cerrado, validación 400 (reglas 1–7).
- **Navegador** (`web/tests/e2e`): flujo completo de examen, autosave, envío
  manual y aviso/expiración; verifica que el temporizador no use el reloj local.
- **Spec del módulo:** `api/tests/e2e/m16-aplicacion-alumno.spec.ts` y
  `web/tests/e2e/m16-aplicacion-alumno.spec.ts`.
- **Una prueba por regla numerada** de §4 (checklist de
  [`../../pruebas/estrategia-pruebas.md`](../../pruebas/estrategia-pruebas.md)).
- Cobertura objetivo ≥ 70 % en los servicios del módulo.

## 11. Criterios de aceptación

- [ ] Migración y modelos Prisma (`ExamAttempt`, `AttemptAnswer`, enum `AttemptStatus`).
- [ ] Módulo API (`routes/controller/service/dto/entity`) con permisos, alcance e idempotencia.
- [ ] Autosave, envío manual y expiración automática en el servidor.
- [ ] Pantalla de examen con `ITPage`/`PanelCard` y UI kit (temporizador de servidor, autosave, aviso).
- [ ] Bitácora (`ATTEMPT_STARTED`, `ATTEMPT_SUBMITTED`, `ATTEMPT_EXPIRED`) verificada.
- [ ] Specs del módulo pasando (solo los del módulo).
- [ ] Este README completo.

## 12. Decisiones abiertas

- **Expiración:** ¿worker dedicado (cola/cron) o verificación perezosa en cada
  request + barrido periódico? Impacta la garantía de envío automático.
- **Eventos de foco:** ¿se persisten (tabla/columna) o solo se emiten como
  telemetría? ¿Se sanciona con intentos extra o invalidación? Ver
  [`../../../DECISIONES.md`](../../../DECISIONES.md).
- **Aleatorización:** ¿el orden de preguntas/opciones se fija por intento
  (snapshot) o se recalcula? Afecta la reproducibilidad en M17.
- **Reconexión:** ¿se permite reanudar un `EN_CURSO` tras caída de red? (por
  ahora sí, mientras no expire).
- **Idempotencia de `start`:** confirmar clave por intento vs. por examen.

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
- Módulos relacionados: [M15](../M15-examenes-configuracion/README.md),
  [M17](../M17-calificacion-kardex/README.md), [M07](../M07-cursos-grupos-inscripciones/README.md).
