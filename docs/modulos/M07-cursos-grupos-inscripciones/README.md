# M07 — Cursos, grupos e inscripciones

| Campo | Valor |
|---|---|
| **Código** | M07 |
| **Versión** | 0.1 |
| **Estado** | En diseño |
| **Fase** | Académico (Expediente y academia) |
| **Depende de** | M02 (autenticación y bitácora), M03 (alumnos), M04 (profesores), M11 (catálogos base) |
| **Habilita a** | M05 (reinscripción tras reingreso), M06 (kardex), M08 (calificaciones), M09 (colegiaturas por ciclo), M15 (exámenes), M18 (asistencia) |
| **Permisos** | `courses.*`, `terms.*`, `groups.*`, `enrollments.*` |

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
  id          String        @id @default(uuid())
  nombre      String
  nivel       String?
  descripcion String?
  status      CourseStatus  @default(ACTIVO)
  active      Boolean       @default(true)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  groups Group[]

  @@index([status])
  @@index([active])
  @@map("courses")
}

model Term {
  id          String   @id @default(uuid())
  nombre      String
  fechaInicio DateTime @map("fecha_inicio") @db.Date
  fechaFin    DateTime @map("fecha_fin") @db.Date
  activo      Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  groups Group[]
  charges Charge[]

  @@index([activo])
  @@map("terms")
}

model Group {
  id        String   @id @default(uuid())
  courseId  String   @map("course_id")
  termId    String   @map("term_id")
  teacherId String?  @map("teacher_id")
  nombre    String
  cupo      Int
  horario   Json     // [{ "dia": "lunes", "horaInicio": "08:00", "horaFin": "09:00" }]
  aula      String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  course      Course       @relation(fields: [courseId], references: [id])
  term        Term         @relation(fields: [termId], references: [id])
  teacher     Teacher?     @relation(fields: [teacherId], references: [id])
  enrollments Enrollment[]

  @@index([courseId])
  @@index([termId])
  @@index([teacherId])
  @@index([active])
  @@map("groups")
}

model Enrollment {
  id        String           @id @default(uuid())
  studentId String           @map("student_id")
  groupId   String           @map("group_id")
  fecha     DateTime         @db.Date
  status    EnrollmentStatus @default(INSCRITO)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  student Student @relation(fields: [studentId], references: [id])
  group   Group   @relation(fields: [groupId], references: [id])
  grades  Grade[]

  @@index([studentId, status])
  @@index([groupId, status])
  @@map("enrollments")
}

enum CourseStatus {
  ACTIVO
  INACTIVO
}

enum EnrollmentStatus {
  INSCRITO
  BAJA
  ACREDITADO
  REPROBADO
}
```

- `active` en `Course`/`Group` para desactivación lógica; `Term.activo` (regla de
  dominio: **un solo ciclo activo**); `Enrollment.status = BAJA` es la baja lógica
  (nunca `DELETE` físico).
- `horario` es `Json`/`jsonb` con nombres en español (`dia`, `horaInicio`,
  `horaFin`) según el spec.
- `cupo` es entero; dinero/medidas decimales no aplican aquí.

**Índices / restricciones (incluyen SQL de migración):**
- Único parcial `(student_id, group_id) WHERE status <> 'BAJA'` → evita doble
  inscripción activa al mismo grupo (Prisma no lo modela; va en migración SQL).
- Único parcial `(activo) WHERE activo = true` sobre `terms` → un solo ciclo activo.

**Relaciones:** `Course 1—N Group`; `Term 1—N Group`; `Teacher 1—N Group`;
`Group 1—N Enrollment`; `Student 1—N Enrollment`; `Enrollment 1—N Grade` (M08).

## 4. Reglas de negocio

1. **Cupo**: no se inscribe si el grupo alcanzó `cupo` (conteo de inscripciones
   activas `status <> BAJA`) → `GROUP_FULL`.
2. **Doble inscripción**: el mismo alumno no puede tener dos inscripciones activas
   al mismo grupo → `ALREADY_ENROLLED` (protegido además por índice único parcial).
3. **Empalme de horarios**: un alumno no puede inscribirse a dos grupos cuyos
   horarios se solapen (mismo `dia` e intervalo `[horaInicio, horaFin)` con
   intersección) en el mismo ciclo → `SCHEDULE_CONFLICT`.
4. **Alumno en baja**: no se inscribe a un alumno con `Student.status = baja`
   → `STUDENT_INACTIVE` (regla provista por M05).
5. **Transacción serializable con reintento**: cupo, doble inscripción y empalme se
   evalúan dentro de una transacción con nivel `Serializable`; ante choque se
   reintenta un número acotado de veces y, si persiste, se responde
   `CONCURRENT_UPDATE`.
6. **Change-group** es atómico: da de baja (lógica) la inscripción origen y crea la
   destino revalidando cupo/duplicidad/empalme; si falla, no cambia nada.
7. **Solo un ciclo activo**: activar un `Term` desactiva el anterior.
8. **Baja de inscripción**: `DELETE /enrollments/:id` cambia `status` a `BAJA`
   (borrado lógico, conserva historial y calificaciones).
9. **Integridad referencial**: un grupo pertenece a un curso y a un ciclo; el
   profesor es opcional; el aula es informativa.
10. **Horario válido**: `horaInicio < horaFin` y días en el catálogo permitido.
11. **Alcance por registro**: el profesor solo ve/edita sus grupos (`AREA`); el
    alumno solo sus inscripciones (`OWN`).

## 5. API

Módulo bajo `api/src/modules/courses/`, `terms/`, `groups/` y `enrollments/`, cada
uno con `routes/ · controllers/ · services/ · models/{dto,entity}/`. Listados
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
  fecha: z.string().date().optional(),   // por defecto hoy (America/Mexico_City)
}).openapi("Enroll");

// 201 Created
{ "id": "…", "studentId": "…", "groupId": "…", "status": "INSCRITO" }

// POST /api/v1/enrollments/:id/change-group
{ "toGroupId": "a1b2c3d4-…" }  // revalida cupo/duplicidad/empalme
```

- Errores del catálogo (ver [`errores.md`](../../api/errores.md)): `GROUP_FULL`,
  `ALREADY_ENROLLED`, `SCHEDULE_CONFLICT`, `STUDENT_INACTIVE`, `CONCURRENT_UPDATE`
  (409); `VALIDATION_ERROR`/`INVALID_RANGE` (400).
- `POST /groups/:id/enroll` acepta `Idempotency-Key` para evitar inscripciones
  duplicadas por reintentos de red.

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
| Ciclos | `pages/terms/TermsPage.tsx` | Listado y activación |
| Grupos | `pages/groups/GroupsPage.tsx` | Listado y alta/edición de grupos |
| Roster del grupo | `pages/groups/GroupDetailPage.tsx` | Inscritos + acciones |

- Horario editado con `ITFormBuilder` (arreglo de renglones: `dia`,
  `horaInicio`, `horaFin`).
- `ITDataTable` con filtro y orden por columna (regla de la casa: toda columna con
  datos lleva filtro/orden; las de acciones no).
- `KpiTile` con cupo ocupado/disponible; `PanelCard` para secciones.
- i18n namespaces `courses`, `terms`, `groups`, `enrollments`; validación en web
  con `@shared/validation` y habilitación de acciones con `usePermission`.

## 7. Permisos y alcance

| Permiso | ADMIN | CONTROL_ESCOLAR | PROFESOR | ALUMNO |
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

- `Course.nombre` requerido; `status` ∈ `CourseStatus`; `nivel`/`descripcion`
  opcionales con longitud máxima.
- `Term`: `nombre` requerido; `fechaInicio < fechaFin` (si no → `INVALID_RANGE`).
- `Group`: `cupo` entero `≥ 1`; `horario` arreglo de `{ dia, horaInicio, horaFin }`
  con `horaInicio < horaFin` (formato `HH:mm`); `teacherId`/`aula` opcionales.
- `Enrollment`: `studentId`/`groupId` UUID; `fecha` `YYYY-MM-DD`.
- Códigos: `REQUIRED_FIELD`, `INVALID_FORMAT`, `INVALID_RANGE`,
  `VALIDATION_ERROR`.

## 9. Bitácora

Registrado vía `AuditPort` con `previousState`/`newState`, atado a la transacción
del cambio (ver [`bitacora.md`](../../seguridad/bitacora.md)).

| Acción | `entityType` | `previousState` → `newState` | `metadata` |
|---|---|---|---|
| `ENROLLMENT_CREATED` | `Enrollment` | `null` → `{ studentId, groupId, status: "INSCRITO" }` | `{ termId, courseId }` |
| `ENROLLMENT_DELETED` | `Enrollment` | `{ status: "INSCRITO" }` → `{ status: "BAJA" }` | `{ reason }` |
| `ENROLLMENT_GROUP_CHANGED` | `Enrollment` | `{ groupId: <origen> }` → `{ groupId: <destino> }` | `{ fromGroupId, toGroupId }` |

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

- [ ] Migración y modelo Prisma (`Course`, `Term`, `Group`, `Enrollment`, enums) con
      índices únicos parciales.
- [ ] Módulo API (routes/controller/service/dto/entity) con permisos, transacción
      serializable con reintento y bitácora.
- [ ] Pantallas web con UI kit (cursos, ciclos, grupos, roster) e i18n.
- [ ] Specs pasando (solo los del módulo).
- [ ] Este README completo.

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
