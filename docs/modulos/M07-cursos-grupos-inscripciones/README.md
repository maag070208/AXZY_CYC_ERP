# M07 — Cursos, grupos e inscripciones

| Campo | Valor |
|---|---|
| **Código** | M07 |
| **Versión** | 0.1 |
| **Estado** | Terminado (F3) |
| **Fase** | Académico (Expediente y academia) |
| **Depende de** | M02 (autenticación y bitácora), M03 (alumnos), M04 (profesores), M11 (catálogos base) |
| **Habilita a** | M05 (reinscripción tras reingreso), M06 (kardex), M08 (calificaciones), M09 (colegiaturas por ciclo), M15 (exámenes), M18 (asistencia) |
| **Permisos** | `courses.*`, `terms.*`, `groups.*`, `enrollments.*` |

## Implementación (F3, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/courses` (cursos, grupos, inscripciones y alcance académico) y `web/src/{entities,features}/{course,group}`; páginas `/courses`, `/groups`, `/groups/:id` y la pestaña «Inscripciones» del expediente del alumno.

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST · GET | `/api/v1/courses/query` · `/courses/options` | `courses.view` | AREA = cursos de sus grupos |
| POST · GET · PATCH | `/api/v1/courses` · `/courses/:id` | `courses.manage` · `courses.view` | Clave única normalizada a mayúsculas (`409 COURSE_CODE_TAKEN`) |
| DELETE · POST | `/api/v1/courses/:id` · `/:id/reactivate` | `courses.manage` | Baja lógica: no se abren grupos de un curso inactivo |
| POST · GET | `/api/v1/groups/query` · `/groups/options` | `groups.view` | AREA = sus grupos (profesor); OWN = donde está inscrito (alumno) |
| POST · GET · PATCH | `/api/v1/groups` · `/groups/:id` | `groups.manage` · `groups.view` | Curso y ciclo inmutables; `409 CAPACITY_BELOW_ENROLLED`, `GROUP_NAME_TAKEN` |
| DELETE · POST | `/api/v1/groups/:id` · `/:id/reactivate` | `groups.manage` | Solo sin inscritos (`409 GROUP_HAS_ENROLLMENTS`) |
| POST | `/api/v1/groups/:id/enroll` | `enrollments.create` | Transacción `Serializable` con reintento acotado |
| POST | `/api/v1/enrollments/query` | `enrollments.view` | Filtros `groupId`, `studentId`, `termId`, `status`, `studentNumber`, `name` |
| DELETE | `/api/v1/enrollments/:id` | `enrollments.delete` | Baja lógica con motivo opcional |
| POST | `/api/v1/enrollments/:id/change-group` | `enrollments.edit` | Mismo curso y ciclo; origen en BAJA apuntando al destino |

Diferencias con el borrador:
- `Course` lleva `code` única y `levelId` (FK al catálogo de niveles de M11) en lugar de `nivel` texto; solo `active` (sin `status` duplicado). `Group` agrega `closedAt/closedBy` (cierre de M08) y único `(courseId, termId, name)`. `Enrollment` agrega `finalGrade`, `withdrawnAt`, `withdrawalReason`, `transferredToId` y `createdBy`.
- Días del horario en mayúsculas sin acento (`MONDAY…SUNDAY`), horas `HH:mm`, intervalos semiabiertos `[inicio, fin)`: bloques contiguos no se empalman. El empalme se revisa contra las inscripciones `ENROLLED` del alumno en el **mismo ciclo**.
- `Idempotency-Key` no se implementó: el índice único parcial y la transacción serializable ya impiden la doble inscripción (un reintento responde `409 ALREADY_ENROLLED`).
- El ámbito `AREA` del profesor (sus grupos) se registra como resolvedor `groups` y publica también el `AREA` de `students`: expediente y kardex del profesor quedan limitados a los alumnos de sus grupos. Ver [D-027](../../../DECISIONES.md) y [D-028](../../../DECISIONES.md).
- La baja del alumno (M05) cancela sus inscripciones vigentes en la misma transacción (puerto `setEnrollmentCanceller`).

> **Cómo leer este documento:** la sección «Implementación» de arriba describe lo
> construido y **manda** sobre el diseño original de las secciones siguientes.
> Los nombres de campos, enums, rutas y códigos ya están en inglés
> ([D-046](../../../DECISIONES.md), [D-049](../../../DECISIONES.md)).

## 1. Objetivo

Administrar la **oferta académica** (cursos, ciclos y grupos) y las
**inscripciones** de alumnos con reglas de cupo, duplicidad y empalme de horarios.
Es la base académica del SGE: sobre los grupos se capturan calificaciones,
exámenes y asistencia, y se generan cargos de colegiatura.

## 2. Alcance

**Incluye**
- CRUD de **cursos** y **ciclos** (`terms`) con listados server-side.
- CRUD de **grupos** (curso + ciclo + profesor + cupo + horario + aula).
- Inscripción de alumnos a grupos con validación de reglas.
- Baja (lógica) de inscripción y **cambio de grupo**.
- Bitácora de inscripciones y cambios.

**No incluye (en este módulo)**
- Calificaciones y ponderaciones (M08).
- Cargos y pagos por inscripción/colegiatura (M09).
- Asistencia (M18) y exámenes en línea (M14–M16).
- Horarios a nivel de profesor/aula global (solo el horario del grupo).
- Prerrequisitos y planes de estudio (se registran como decisión abierta).

## 3. Modelo de datos (Prisma)

```prisma
model Course {
  id          String   @id @default(uuid())
  /// Clave corta e inmutable en la práctica (p. ej. `MAT-101`).
  code        String   @unique
  name        String
  levelId     String?  @map("level_id")
  description String?
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  level           Level?           @relation(fields: [levelId], references: [id])
  groups          Group[]
  questions       Question[]
  programSubjects ProgramSubject[]

  @@index([active])
  @@index([name])
  @@map("courses")
}

/// Ciclo escolar. Solo uno `active` a la vez (índice único parcial en SQL).
/// M07 lo amplía con sus relaciones (grupos).
model Term {
  id        String   @id @default(uuid())
  name      String   @unique
  startDate DateTime @map("start_date") @db.Date
  endDate   DateTime @map("end_date") @db.Date
  active    Boolean  @default(false)
  /// Calendario/periodos configurables (M22): [{ name, startDate, endDate }].
  calendar  Json?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  groups  Group[]
  charges Charge[]
  plans   StudentPlan[]

  @@index([active])
  @@map("terms")
}

model Group {
  id        String    @id @default(uuid())
  courseId  String    @map("course_id")
  termId    String    @map("term_id")
  teacherId String?   @map("teacher_id")
  name      String
  capacity  Int
  /// `[{ dia: "LUNES", horaInicio: "08:00", horaFin: "09:00" }]`
  schedule  Json
  classroom String?
  active    Boolean   @default(true)
  /// Cierre de calificaciones (M08): finales escritas y estatus aplicados.
  closedAt  DateTime? @map("closed_at")
  closedBy  String?   @map("closed_by")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  course             Course              @relation(fields: [courseId], references: [id])
  term               Term                @relation(fields: [termId], references: [id])
  teacher            Teacher?            @relation(fields: [teacherId], references: [id])
  enrollments        Enrollment[]
  assessments        Assessment[]
  onlineExams        OnlineExam[]
  attendanceSessions AttendanceSession[]

  @@unique([courseId, termId, name])
  @@index([termId])
  @@index([teacherId])
  @@index([active])
  @@map("groups")
}

model Enrollment {
  id               String           @id @default(uuid())
  studentId        String           @map("student_id")
  groupId          String           @map("group_id")
  date             DateTime         @db.Date
  status           EnrollmentStatus @default(ENROLLED)
  /// Calificación final escrita al cerrar el grupo (M08).
  finalGrade       Decimal?         @map("final_grade") @db.Decimal(5, 2)
  withdrawnAt      DateTime?        @map("withdrawn_at")
  withdrawalReason String?          @map("withdrawal_reason")
  /// Si la baja fue por cambio de grupo, la inscripción destino.
  transferredToId  String?          @unique @map("transferred_to_id")
  createdBy        String?          @map("created_by")
  createdAt        DateTime         @default(now()) @map("created_at")
  updatedAt        DateTime         @updatedAt @map("updated_at")

  student           Student      @relation(fields: [studentId], references: [id])
  group             Group        @relation(fields: [groupId], references: [id])
  transferredTo     Enrollment?  @relation("EnrollmentTransfer", fields: [transferredToId], references: [id])
  transferredFrom   Enrollment?  @relation("EnrollmentTransfer")
  grades            Grade[]
  attendance        Attendance[]
  /// Cuándo se emitió la alerta de inasistencia vigente (M18); se limpia al recuperar el umbral.
  attendanceAlertAt DateTime?    @map("attendance_alert_at")

  @@index([studentId, status])
  @@index([groupId, status])
  @@map("enrollments")
}

enum EnrollmentStatus {
  ENROLLED
  WITHDRAWN
  PASSED
  FAILED
}
```

- `active` en `Course`/`Group` para desactivación lógica; `Term.ACTIVE` (regla de
  dominio: **un solo ciclo activo**); `Enrollment.status = WITHDRAWN` es la baja lógica
  (nunca `DELETE` físico).
- `schedule` es `Json`/`jsonb` con nombres en español (`day`, `startTime`,
  `endTime`) según el spec.
- `capacity` es entero; dinero/medidas decimales no aplican aquí.

**Índices / restricciones (incluyen SQL de migración):**
- Único parcial `(student_id, group_id) WHERE status <> 'WITHDRAWN'` → evita doble
  inscripción activa al mismo grupo (Prisma no lo modela; va en migración SQL).
- Único parcial `(ACTIVE) WHERE ACTIVE = true` sobre `terms` → un solo ciclo activo.

**Relaciones:** `Course 1—N Group`; `Term 1—N Group`; `Teacher 1—N Group`;
`Group 1—N Enrollment`; `Student 1—N Enrollment`; `Enrollment 1—N Grade` (M08).

## 4. Reglas de negocio

1. **Cupo**: no se inscribe si el grupo alcanzó `capacity` (conteo de inscripciones
   activas `status <> WITHDRAWN`) → `GROUP_FULL`.
2. **Doble inscripción**: el mismo alumno no puede tener dos inscripciones activas
   al mismo grupo → `ALREADY_ENROLLED` (protegido además por índice único parcial).
3. **Empalme de horarios**: un alumno no puede inscribirse a dos grupos cuyos
   horarios se solapen (mismo `day` e intervalo `[startTime, endTime)` con
   intersección) en el mismo ciclo → `SCHEDULE_CONFLICT`.
4. **Alumno en baja**: no se inscribe a un alumno con `Student.status = WITHDRAWN`
   → `STUDENT_INACTIVE` (regla provista por M05).
5. **Transacción serializable con reintento**: cupo, doble inscripción y empalme se
   evalúan dentro de una transacción con nivel `Serializable`; ante choque se
   reintenta un número acotado de veces y, si persiste, se responde
   `CONCURRENT_UPDATE`.
6. **Change-group** es atómico: da de baja (lógica) la inscripción origen y crea la
   destino revalidando cupo/duplicidad/empalme; si falla, no cambia nada.
7. **Solo un ciclo activo**: activar un `Term` desactiva el anterior.
8. **Baja de inscripción**: `DELETE /enrollments/:id` cambia `status` a `WITHDRAWN`
   (borrado lógico, conserva historial y calificaciones).
9. **Integridad referencial**: un grupo pertenece a un curso y a un ciclo; el
   profesor es opcional; el aula es informativa.
10. **Horario válido**: `startTime < endTime` y días en el catálogo permitido.
11. **Alcance por registro**: el profesor solo ve/edita sus grupos (`AREA`); el
    alumno solo sus inscripciones (`OWN`).

## 5. API

Módulo único `api/src/modules/courses/` (cursos, grupos, inscripciones y alcance
académico) con `routes/ · controllers/ · services/ · models/{dto,entity}/`; los
ciclos (`terms`) se sirven desde `modules/config` (M11). Listados
mediante **`POST /…/query`** (contrato ITDataTable). Ver
[`api-modular.md`](../../arquitectura/api-modular.md) y
[`convenciones.md`](../../api/convenciones.md).

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/courses` | Lista de cursos | `courses.view` |
| POST | `/api/v1/courses/query` | Listado server-side | `courses.view` |
| POST | `/api/v1/courses` | Crea curso | `courses.manage` |
| PATCH | `/api/v1/courses/:id` | Edita curso | `courses.manage` |
| DELETE | `/api/v1/courses/:id` | Desactiva curso | `courses.manage` |
| GET/POST | `/api/v1/terms` · `/terms/query` | Ciclos y listado | `terms.view` |
| POST/PATCH/DELETE | `/api/v1/terms/:id?` | Gestiona ciclos (activar/desactivar) | `terms.manage` |
| GET | `/api/v1/groups` | Lista de grupos | `groups.view` |
| POST | `/api/v1/groups/query` | Listado server-side | `groups.view` |
| POST | `/api/v1/groups` | Crea grupo | `groups.manage` |
| PATCH | `/api/v1/groups/:id` | Edita grupo | `groups.manage` |
| DELETE | `/api/v1/groups/:id` | Desactiva grupo | `groups.manage` |
| POST | `/api/v1/groups/:id/enroll` | Inscribe alumno al grupo | `enrollments.create` |
| POST | `/api/v1/enrollments/query` | Listado server-side de inscripciones | `enrollments.view` |
| DELETE | `/api/v1/enrollments/:id` | Baja lógica de inscripción | `enrollments.delete` |
| POST | `/api/v1/enrollments/:id/change-group` | Cambia de grupo al alumno | `enrollments.edit` |

Request/response (Zod + resultado):

```ts
// POST /api/v1/groups/:id/enroll
export const EnrollSchema = z.object({
  studentId: z.string().uuid(),
  date: z.string().date().optional(),   // por defecto hoy (America/Mexico_City)
}).openapi("Enroll");

// 201 Created
{ "id": "…", "studentId": "…", "groupId": "…", "status": "ENROLLED" }

// POST /api/v1/enrollments/:id/change-group
{ "toGroupId": "a1b2c3d4-…" }  // revalida capacity/duplicidad/empalme
```

- Errores del catálogo (ver [`errores.md`](../../api/errores.md)): `GROUP_FULL`,
  `ALREADY_ENROLLED`, `SCHEDULE_CONFLICT`, `STUDENT_INACTIVE`, `CONCURRENT_UPDATE`
  (409); `VALIDATION_ERROR`/`INVALID_RANGE` (400).
- `POST /groups/:id/enroll` **no** usa `Idempotency-Key`: el índice único parcial
  ya la hace idempotente ([D-027](../../../DECISIONES.md)).

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `course` | `entities/course` | API + modelo |
| `term` | `entities/term` | API + modelo de ciclo |
| `group` | `entities/group` | API + modelo + roster |
| `enrollment` | `entities/enrollment` | API + modelo |
| Inscribir alumno | `features/group/enroll` | `model/useEnroll.ts` + `ui/EnrollDialog.tsx` (`ITSearchSelect` de alumno) |
| Cambiar de grupo | `features/enrollment/changeGroup` | Selección de grupo destino + revalidación |
| Baja de inscripción | `features/enrollment/delete` | `ITConfirmDialog` |
| Cursos | `pages/courses/CoursesPage.tsx` | `ITPage` + `ITDataTable` + `ITFormBuilder` |
| Ciclos | `pages/catalogs` (pestaña de M11) | Listado y activación |
| Grupos | `pages/groups/GroupsPage.tsx` | Listado y alta/edición de grupos |
| Roster del grupo | `pages/groups/GroupDetailPage.tsx` | Inscritos + acciones |

- Horario editado con `ITFormBuilder` (arreglo de renglones: `day`,
  `startTime`, `endTime`).
- `ITDataTable` con filtro y orden por columna (regla de la casa: toda columna con
  datos lleva filtro/orden; las de acciones no).
- `KpiTile` con cupo ocupado/disponible; `PanelCard` para secciones.
- i18n namespaces `courses`, `terms`, `groups`, `enrollments`; validación en web
  con `@shared/validation` y habilitación de acciones con `usePermission`.

## 7. Permisos y alcance

| Permiso | ADMIN | SCHOOL_CONTROL | TEACHER | STUDENT |
|---|---|---|---|---|
| `courses.view` / `courses.manage` | ALL | view / NONE | view (AREA) | NONE |
| `terms.view` / `terms.manage` | ALL | view / NONE | view | NONE |
| `groups.view` / `groups.manage` | ALL | ALL | view (AREA) | view (OWN) |
| `enrollments.view` | ALL | ALL | AREA | OWN |
| `enrollments.create` | ALL | ALL | NONE | NONE |
| `enrollments.edit` | ALL | ALL | NONE | NONE |
| `enrollments.delete` | ALL | ALL | NONE | NONE |

- Alcances `NONE < OWN < AREA < ALL`; la unión de roles toma el alcance mayor
  (ver [`roles-permisos.md`](../../seguridad/roles-permisos.md)).
- El scoping por registro va en la consulta (`AND`) y en la validación del
  `service` (p. ej. el profesor solo inscribe/edita en sus grupos si se habilita).
- Permisos granulares: `enrollments.create/edit/delete` separados para permitir
  delegar sin dar de baja.

## 8. Validaciones

- `Course.name` requerido; `status` ∈ `CourseStatus`; `nivel`/`description`
  opcionales con longitud máxima.
- `Term`: `name` requerido; `startDate < endDate` (si no → `INVALID_RANGE`).
- `Group`: `capacity` entero `≥ 1`; `schedule` arreglo de `{ day, startTime, endTime }`
  con `startTime < endTime` (formato `HH:mm`); `teacherId`/`classroom` opcionales.
- `Enrollment`: `studentId`/`groupId` UUID; `date` `YYYY-MM-DD`.
- Códigos: `REQUIRED_FIELD`, `INVALID_FORMAT`, `INVALID_RANGE`,
  `VALIDATION_ERROR`.

## 9. Bitácora

Registrado vía `AuditPort` con `previousState`/`newState`, atado a la transacción
del cambio (ver [`bitacora.md`](../../seguridad/bitacora.md)).

| Acción | `entityType` | `previousState` → `newState` | `metadata` |
|---|---|---|---|
| `ENROLLMENT_CREATED` | `Enrollment` | `null` → `{ studentId, groupId, status: "ENROLLED" }` | `{ termId, courseId }` |
| `ENROLLMENT_DELETED` | `Enrollment` | `{ status: "ENROLLED" }` → `{ status: "WITHDRAWN" }` | `{ reason }` |
| `ENROLLMENT_GROUP_CHANGED` | `Enrollment` | `{ groupId: <origin> }` → `{ groupId: <destino> }` | `{ fromGroupId, toGroupId }` |

Las acciones de catálogo (`courses`, `terms`, `groups`) registran sus altas y
ediciones bajo sus propios `entityType` con el mismo patrón.

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): una por regla — cupo lleno; doble inscripción;
  empalme de horarios (con casos borde de intervalo); alumno en baja; cambio de
  grupo atómico; reintento serializable; único ciclo activo.
- **Contrato** (`api/tests/e2e`): enrolar → 201; grupo lleno → 409 `GROUP_FULL`;
  repetir → 409 `ALREADY_ENROLLED`; empalme → 409 `SCHEDULE_CONFLICT`; alumno en
  baja → 409 `STUDENT_INACTIVE`; `change-group` → 200; listado `/query` paginado;
  sin permiso → 403; sin token → 401.
- **Navegador** (`web/tests/e2e`): alta de curso/ciclo/grupo, inscripción desde el
  roster y cambio de grupo.
- **Spec del módulo**: `tests/e2e/enrollments.spec.ts` (y `groups.spec.ts`).

## 11. Criterios de aceptación

- [x] Migración y modelo Prisma (`Course`, `Term`, `Group`, `Enrollment`, enums) con
      índices únicos parciales.
- [x] Módulo API (routes/controller/service/dto/entity) con permisos, transacción
      serializable con reintento y bitácora.
- [x] Pantallas web con UI kit (cursos, ciclos, grupos, roster) e i18n.
- [x] Specs pasando (solo los del módulo).
- [x] Este README completo.

## 12. Decisiones abiertas

- ¿Existe sobrecupo/lista de espera cuando el grupo está lleno?
- ¿Se permite inscripción intersemestral o a más de un ciclo a la vez?
- ¿Horarios a nivel de profesor y aula (choque de docente/aula, no solo del alumno)?
- ¿Reglas de prerrequisitos/serias y `nivel` como catálogo formal (M11)?
- ¿El cambio de grupo conserva la misma inscripción (y sus calificaciones) o crea
  una nueva?

## 13. Referencias

- Plantilla: [`plantilla-modulo.md`](../../plantillas/plantilla-modulo.md).
- Datos: [`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md) (`courses`, `terms`, `groups`, `enrollments`).
- ERD: [`../../modelo-datos/entidad-relacion.md`](../../modelo-datos/entidad-relacion.md).
- API: [`../../api/convenciones.md`](../../api/convenciones.md) · Errores: [`../../api/errores.md`](../../api/errores.md).
- Seguridad: [`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md) · [`../../seguridad/bitacora.md`](../../seguridad/bitacora.md).
- Arquitectura: [`../../arquitectura/api-modular.md`](../../arquitectura/api-modular.md), [`../../arquitectura/web-fsd.md`](../../arquitectura/web-fsd.md), [`../../arquitectura/axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).
- Módulos relacionados: [`../M05-bajas-reingresos/README.md`](../M05-bajas-reingresos/README.md), [`../M06-kardex-expediente/README.md`](../M06-kardex-expediente/README.md).
- Decisiones: [`../../../DECISIONES.md`](../../../DECISIONES.md).
