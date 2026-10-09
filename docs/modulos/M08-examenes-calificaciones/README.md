# M08 — Exámenes y calificaciones (captura manual)

| Campo | Valor |
|---|---|
| **Código** | M08 |
| **Versión** | 0.1 |
| **Estado** | Terminado (F3) |
| **Fase** | Académico |
| **Depende de** | M03 (alumnos), M04 (profesores), M07 (cursos, grupos e inscripciones), M11 (parámetros: calificación mínima) |
| **Habilita a** | M06 (kardex), M10 (reportes), M17 (calificación automática al kardex) |
| **Permisos** | `assessments.view`, `assessments.manage`, `grades.view`, `grades.capture`, `grades.export` (con alcance) |

## Implementación (F3, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/grades` y `web/src/{entities/grade,features/grades}`; se usa desde la pestaña «Calificaciones» de `/groups/:id` (instrumentos + libro editable).

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST · GET | `/api/v1/assessments/query` · `/assessments/:id` | `assessments.view` | Filtro `groupId`; OWN = grupos donde está inscrito |
| POST · PATCH · DELETE | `/api/v1/assessments` · `/assessments/:id` | `assessments.manage` | Suma activa ≤ 100 (`409 WEIGHTS_EXCEED_100`); fuera de su ámbito → 403 |
| POST | `/api/v1/assessments/:id/grades` | `grades.capture` | Lote (≤ 500) con upsert; `null` vacía la calificación |
| POST | `/api/v1/grades/query` | `grades.view` | El alumno solo ve las suyas |
| GET | `/api/v1/groups/:id/gradebook` | `grades.view` | Proyección de la final; el alumno ve solo su renglón |
| POST | `/api/v1/groups/:id/close` | `assessments.manage` | Exige 100 % y todo capturado (`WEIGHTS_NOT_100`, `GRADES_INCOMPLETE`) |
| GET | `/api/v1/grades/export?groupId=` | `grades.export` | Libro del grupo en `.xlsx` (audita `GRADES_EXPORTED`) |

Decisiones tomadas (sección 12): el cierre es **manual** y definitivo en esta versión (no hay reapertura: tras cerrar, captura/instrumentos/inscripciones responden `409 GROUP_CLOSED`); la final se redondea con `ROUND_HALF_UP` a 2 decimales y se calcula en `Decimal` (nunca flotante); la ponderación se valida al crear/editar (no puede pasar de 100) y al cerrar (debe ser exactamente 100); el alumno ve sus calificaciones capturadas y la proyección antes del cierre. El umbral es `MIN_PASSING_GRADE` (M11, por defecto 70). Ver [D-029](../../../DECISIONES.md) y [D-030](../../../DECISIONES.md).

Otros detalles: la bitácora distingue `GRADE_CAPTURED`, `GRADE_UPDATED` (con valor anterior y nuevo) y `GRADE_CLEARED`; recapturar el mismo valor no genera registro. Bajar `maxScore` por debajo de una calificación ya capturada responde `409 MAX_SCORE_BELOW_CAPTURED`. El kardex (M06) lee las inscripciones por el puerto `KardexService.setSource`: calificaciones en escala 0–100 por instrumento, final solo tras el cierre y sin los renglones de cambio de grupo.

> **Cómo leer este documento:** la sección «Implementación» de arriba describe lo
> construido y **manda** sobre el diseño original de las secciones siguientes.
> Los nombres de campos, enums, rutas y códigos ya están en inglés
> ([D-046](../../../DECISIONES.md), [D-049](../../../DECISIONES.md)).

## 1. Objetivo

Permitir que el profesor registre los instrumentos de evaluación (parciales,
finales, tareas u otros) de cada grupo y capture las calificaciones de sus
alumnos de forma manual, calculando la calificación final ponderada y
actualizando el kardex y el estatus de la inscripción al cerrar el grupo.

## 2. Alcance

**Incluye**
- CRUD de instrumentos de evaluación (`assessments`) por grupo con ponderación en porcentaje.
- Captura de calificaciones (`grades`) por instrumento e inscripción, individual y en lote.
- Libro de calificaciones (`gradebook`) por grupo con proyección de calificación final.
- Cálculo de calificación final ponderada y aplicación de la regla de aprobación configurable.
- Cierre de grupo: escritura al kardex y actualización del estatus de la inscripción (`PASSED`/`FAILED`).
- Bitácora de toda alta, cambio o baja de calificación con valor anterior y nuevo.
- Alcance por docente: el profesor solo captura en sus grupos.

**No incluye (en este módulo)**
- Aplicación de exámenes en línea (M15/M16) y calificación automática (M17): aquí la captura es **manual**.
- Generación de reactivos o banco de preguntas (M14).
- Asistencia (M18) y justificantes.
- Reportes agregados por ciclo o escuela (M10).
- Cobro o consecuencias financieras de la condición de aprobación (M09).

## 3. Modelo de datos (Prisma)

Convención: `id uuid`, `createdAt`/`updatedAt`, `active` o borrado lógico por
dominio (ver [D-003](../../../DECISIONES.md) y
[`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md)).
Las ponderaciones y calificaciones usan `Decimal` (nunca punto flotante).

```prisma
enum AssessmentType {
  PARTIAL
  FINAL
  HOMEWORK
  OTHER
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

**Índices:** `assessments(group_id)`; `grades(assessment_id, enrollment_id)` único
y `grades(enrollment_id)`.
**Relaciones:** `Assessment` 1→N `Grade`; `Assessment` N→1 `Group` (M07);
`Grade` N→1 `Enrollment` (M07); `capturedBy` referencia `users.id` (M02).
**Borrado lógico:** `Assessment.active = false` para desactivar instrumentos;
las `Grade` no se borran (se recapturan y su historial queda en la bitácora).

## 4. Reglas de negocio

1. La suma de `weight` de los instrumentos **activos** de un grupo debe ser
   exactamente `100.00` para calcular la final; en otro caso, `WEIGHTS_NOT_100` (409).
2. Cada `score` debe estar en el rango `[0, maxScore]` del instrumento; en otro
   caso, `SCORE_OUT_OF_RANGE` (400).
3. La calificación final es la **suma ponderada** de `(score / maxScore) * weight`.
4. La calificación final se compara contra la **regla de aprobación configurable**
   en M11 (`settings`), por defecto `70`; `>= threshold` acredita.
5. Al **cerrar el grupo** se escriben las calificaciones finales al kardex (M06) y
   se actualiza el estatus de la inscripción a `PASSED` o `FAILED`.
6. Toda **modificación de calificación** queda en la bitácora con `previousState`
   (valor anterior) y `newState` (valor nuevo).
7. El **profesor solo captura** calificaciones en los grupos donde está asignado
   (alcance `AREA`); fuera de su ámbito → 403.
8. No puede existir más de una calificación por `(assessmentId, enrollmentId)`:
   la captura en lote hace *upsert* controlado.
9. Un instrumento con ponderación `<= 0` no es válido.
10. No se permite capturar calificaciones si el alumno no está `ENROLLED` en el grupo.

## 5. API

Módulo único `api/src/modules/grades/` (evaluaciones, calificaciones y libro)
(`routes/ · controllers/ · services/ · models/{dto,entity}/`). Listados
server-side con `POST /…/query`.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| POST | `/api/v1/assessments/query` | Listado server-side de instrumentos | `assessments.view` |
| GET | `/api/v1/assessments/:id` | Detalle del instrumento | `assessments.view` |
| POST | `/api/v1/assessments` | Crea instrumento de evaluación | `assessments.manage` |
| PATCH | `/api/v1/assessments/:id` | Actualiza instrumento (nombre, ponderación, fecha, maxScore) | `assessments.manage` |
| DELETE | `/api/v1/assessments/:id` | Baja lógica del instrumento | `assessments.manage` |
| POST | `/api/v1/assessments/:id/grades` | Captura en lote de calificaciones del instrumento | `grades.capture` |
| POST | `/api/v1/grades/query` | Listado server-side de calificaciones | `grades.view` |
| GET | `/api/v1/groups/:id/gradebook` | Libro de calificaciones del grupo (proyección de final) | `grades.view` |
| POST | `/api/v1/groups/:id/close` | Cierra el grupo: calcula final, kardex y estatus | `assessments.manage` |
| GET | `/api/v1/grades/export` | Exporta calificaciones del grupo/filtro | `grades.export` |

**Captura en lote** `POST /api/v1/assessments/:id/grades`:
```jsonc
// Request
{
  "grades": [
    { "enrollmentId": "b1e0…", "score": 85.5, "notes": "Buen desempeño" },
    { "enrollmentId": "c2f1…", "score": null }
  ]
}
// 200 → devuelve las grades persistidas (con capturedBy/capturedAt)
```
Cada elemento se valida contra el `maxScore` del instrumento y el alcance del
docente; una calificación inválida responde `SCORE_OUT_OF_RANGE` (400).

**Libro de calificaciones** `GET /api/v1/groups/:id/gradebook`:
```jsonc
// 200
{
  "group": { "id": "…", "name": "A" },
  "assessments": [ { "id": "…", "name": "Parcial 1", "weight": 30.00, "maxScore": 100.00 } ],
  "weightsTotal": 100.00,
  "approvalThreshold": 70,
  "students": [
    { "enrollmentId": "…", "student": { "studentNumber": "2026-0001", "name": "…" },
      "scores": { "assess1": 85.5 }, "final": 85.5, "status": "PASSED" }
  ]
}
```

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `assessmentApi` / `gradeApi` | `entities/assessment`, `entities/grade` | API (`tableRequest`) + tipos |
| Gestión de instrumentos | `features/assessments/manage-assessment` | Alta/edición/baja con `ITFormBuilder` |
| Captura de calificaciones | `features/grades/capture-grades` | Captura individual y en lote |
| Libro de calificaciones | `pages/groups/gradebook` | Pantalla del grupo |
| Administración de instrumentos | `pages/assessments` | Listado y CRUD |

Pantallas con `ITPage` + `ITDataTable`/`ITFormBuilder`; montos y notas con
`ITInputNumber`; fechas con `ITDatePicker`; confirmaciones con `ITDialog`.
i18n con namespaces `assessments` y `grades`
(`shared/i18n/locales/{es,en}/`). Exportación desde las acciones de `ITPage`
reutilizando los filtros vigentes.

## 7. Permisos y alcance

Permisos `recurso.accion` con alcance (`NONE/OWN/AREA/ALL`); ver
[`roles-permisos.md`](../../seguridad/roles-permisos.md).

| Permiso | Roles (alcance) |
|---|---|
| `assessments.view` | ADMIN (ALL), CONTROL_ESCOLAR (ALL lectura), PROFESOR (AREA), ALUMNO (OWN) |
| `assessments.manage` | ADMIN (ALL), PROFESOR (AREA) |
| `grades.view` | ADMIN (ALL), CONTROL_ESCOLAR (ALL), PROFESOR (AREA), ALUMNO (OWN) |
| `grades.capture` | ADMIN (ALL), PROFESOR (AREA) |
| `grades.export` | ADMIN (ALL), CONTROL_ESCOLAR (ALL), PROFESOR (AREA) |

El scoping por registro se aplica en el servicio (`scopeOf`/`withinScope`): el
profesor se limita a los grupos donde figura como `groups.teacher_id`. El alumno
solo consulta sus propias calificaciones (`OWN`).

## 8. Validaciones

- Zod en `models/dto` (whitelist estricta) y `@shared/validation` en web.
- `weight`: decimal `> 0` y `<= 100`; la suma por grupo se valida al calcular
  (`WEIGHTS_NOT_100`).
- `score`: opcional, `[0, maxScore]` (`SCORE_OUT_OF_RANGE`).
- `maxScore`: decimal `> 0`; `AssessmentType` dentro del enum.
- `enrollmentId`/`assessmentId`: UUID válidos (`VALIDATION_ERROR`).
- La captura en lote exige `grades` no vacío.
- Un filtro no admitido por la columna produce 400 `INVALID_FILTER`.

## 9. Bitácora

Escrituras vía `AuditPort` con `previousState`/`newState` (ver
[`bitacora.md`](../../seguridad/bitacora.md)):

| Acción | `entityType` | Notas |
|---|---|---|
| `ASSESSMENT_CREATED` | `Assessment` | Alta del instrumento |
| `ASSESSMENT_UPDATED` | `Assessment` | Con estado previo/nuevo |
| `ASSESSMENT_DEACTIVATED` | `Assessment` | Baja lógica |
| `GRADE_CAPTURED` | `Grade` | Captura inicial de una calificación |
| `GRADE_UPDATED` | `Grade` | **Guarda valor anterior y nuevo** |
| `GRADE_CLEARED` | `Grade` | Se vacía una calificación previamente capturada |
| `GROUP_CLOSED` | `Group` | Cierre con calificaciones finales y estatus |

Toda modificación de calificación (M08) registra `previousState` (`score` previo)
y `newState` (`score` nuevo). El log se ata a la transacción del cambio.

## 10. Pruebas (Playwright)

- Unitarias (`api/tests/unit`): `assessments.service.spec.ts` (suma de
  ponderaciones), `grades.service.spec.ts` (rango, final ponderada, umbral,
  alcance AREA), `gradebook.service.spec.ts`.
- Contrato (`api/tests/e2e`): CRUD de instrumentos, captura en lote, rechazo
  `WEIGHTS_NOT_100`/`SCORE_OUT_OF_RANGE`, cierre de grupo y efecto en el kardex,
  bitácora de `GRADE_UPDATED` con estado anterior/nuevo, 403 fuera de alcance.
- Navegador (`web/tests/e2e`): captura de calificaciones y consulta del gradebook.
- Spec(s) del módulo: `api/tests/e2e/m08-examenes-calificaciones.spec.ts`,
  `web/tests/e2e/m08-examenes-calificaciones.spec.ts`.
- Una prueba por regla de la sección 4. Solo se corre el spec del cambio.

## 11. Criterios de aceptación

- [x] Migración y modelo Prisma (`assessments`, `grades`, enum `AssessmentType`).
- [x] Módulo API (routes/controller/service/dto/entity) con permisos y bitácora.
- [x] Captura en lote y gradebook con proyección de calificación final.
- [x] Cierre de grupo escribiendo al kardex y al estatus de la inscripción.
- [x] Pantallas web con UI kit (ITPage, ITDataTable, ITFormBuilder, ITInputNumber, ITDatePicker).
- [x] Specs pasando (solo los del módulo).
- [x] Este README completo.

## 12. Decisiones abiertas

- ¿El cierre de grupo es automático al terminar el término o siempre manual?
- ¿Se permite recapturar una calificación tras cerrar el grupo (reanudación) y
  quién lo autoriza?
- Precisión de redondeo de la calificación final (¿`ROUND_HALF_UP` a 2 decimales
  o entero?).
- ¿La ponderación se valida al crear cada instrumento o solo al calcular la final?
- ¿El alumno ve sus propias calificaciones antes del cierre o solo la final?
- Ver [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Plantilla de módulo](../../plantillas/plantilla-modulo.md).
- [Convenciones generales](../../guia/convenciones.md) y
  [convenciones de API](../../api/convenciones.md).
- [Catálogo de errores](../../api/errores.md) (`WEIGHTS_NOT_100`,
  `SCORE_OUT_OF_RANGE`, `VALIDATION_ERROR`, `RECORD_NOT_FOUND`, …).
- [Roles y permisos](../../seguridad/roles-permisos.md) · [Bitácora](../../seguridad/bitacora.md).
- [Diccionario de datos — M08](../../modelo-datos/diccionario-datos.md).
- Especificación original del módulo (M08) y roadmap en
  [`../../guia/roadmap.md`](../../guia/roadmap.md).
