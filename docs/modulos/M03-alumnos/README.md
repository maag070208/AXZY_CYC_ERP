# M03 — Alumnos (altas)

| Campo | Valor |
|---|---|
| **Código** | M03 |
| **Versión** | 1.0 |
| **Estado** | Terminado (F2, 2026-10-09) |
| **Fase** | Personas |
| **Depende de** | M02 (usuarios, roles y bitácora) |
| **Habilita a** | M05 (bajas/reingresos), M06 (kardex/expediente), M07 (inscripciones), M09 (cargos) |
| **Permisos** | `students.view`, `students.create`, `students.edit`, `students.delete`, `students.export` |

## Implementación (F2, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/students` y `web/src/{entities,features}/student`, páginas `/students`, `/students/new`, `/students/:id`, `/students/:id/edit`.

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST | `/api/v1/students/query` | `students.view` | Filtros `name` (por palabras), `studentNumber`, `curp`, `status`, `enrollmentDate` (rango); alcance por registro |
| GET | `/api/v1/students/summary` | `students.view` | Totales activos/baja dentro del alcance |
| POST | `/api/v1/students` | `students.create` | Genera la matrícula; `confirmDuplicate` para homónimos |
| GET · PATCH | `/api/v1/students/:id` | `students.view` · `students.edit` | Tutores se reemplazan completos; la matrícula no es editable |
| DELETE | `/api/v1/students/:id` | `students.delete` | Baja lógica = movimiento de baja con motivo (M05) |
| POST | `/api/v1/students/export` | `students.export` | Excel con los filtros vigentes; audita `STUDENTS_EXPORTED` |

Diferencias con el borrador: el homónimo responde `409 DUPLICATE_STUDENT` (con `details.matches`) en lugar de `DUPLICATE_RECORD`; la matrícula usa un consecutivo atómico por año (`student_number_sequences`); el alcance `AREA` del profesor queda listo para M07 (sin grupos no ve alumnos). Decisiones: [D-023](../../../DECISIONES.md), [D-026](../../../DECISIONES.md).

> **Cómo leer este documento:** la sección «Implementación» de arriba describe lo
> construido y **manda** sobre el diseño original de las secciones siguientes.
> Los nombres de campos, enums, rutas y códigos ya están en inglés
> ([D-046](../../../DECISIONES.md), [D-049](../../../DECISIONES.md)).

## 1. Objetivo

Registrar y consultar el **expediente base del alumno** —identificado por matrícula
y CURP— con sus tutores, de forma validada y auditable, para que el resto del
sistema (inscripciones, kardex, cobranza) parta de datos confiables.

## 2. Alcance

**Incluye**
- Alta de alumno con matrícula autogenerada y validación de CURP.
- Detección de duplicados por CURP y por nombre + fecha de nacimiento.
- Captura de tutores (uno o más, con marca de responsable de pago).
- Búsqueda server-side por nombre, matrícula, CURP y estatus.
- Edición y baja lógica (`status = WITHDRAWN`), exportación del listado.
- Vínculo opcional a una cuenta de usuario (`User`) para el portal.

**No incluye (en este módulo)**
- Movimientos de baja/reingreso con motivo e historial (M05).
- Expediente documental y kardex (M06).
- Inscripción a grupos y cobranza (M07/M09).

## 3. Modelo de datos (Prisma)

Convenciones del estándar (UUID, `createdAt`/`updatedAt`, `active`/borrado por
dominio, `@@map`, enums `UPPER_SNAKE`); ver [D-003](../../../DECISIONES.md) y el
[diccionario de datos](../../modelo-datos/diccionario-datos.md).

```prisma
enum StudentStatus {
  ACTIVE
  WITHDRAWN
}

model Student {
  id              String        @id @default(uuid())
  /// `AAAA-NNNN`: año de ingreso + consecutivo. Inmutable.
  studentNumber   String        @unique @map("student_number")
  firstNames      String        @map("first_names")
  paternalSurname String        @map("paternal_surname")
  maternalSurname String?       @map("maternal_surname")
  curp            String        @unique
  birthDate       DateTime      @map("birth_date") @db.Date
  gender          String?
  email           String?
  phone           String?
  address         String?
  status          StudentStatus @default(ACTIVE)
  enrollmentDate  DateTime      @map("enrollment_date") @db.Date
  userId          String?       @unique @map("user_id")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  user        User?             @relation(fields: [userId], references: [id], onDelete: SetNull)
  guardians   Guardian[]
  movements   StudentMovement[]
  documents   Document[]
  enrollments Enrollment[]
  charges     Charge[]
  attempts    ExamAttempt[]
  plans       StudentPlan[]

  @@index([status])
  @@index([paternalSurname, maternalSurname, firstNames])
  @@map("students")
}

model Guardian {
  id                   String   @id @default(uuid())
  studentId            String   @map("student_id")
  name                 String
  relationship         String
  phone                String
  email                String?
  isPaymentResponsible Boolean  @default(false) @map("is_payment_responsible")
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@index([studentId])
  @@map("guardians")
}
```

**Índices:** `students.studentNumber`, `students.curp` y `students.userId` únicos;
`students.status`; `students(paternalSurname, maternalSurname, firstNames)`;
`guardians.studentId`.
**Relaciones:** `Student 1—N Guardian`; `Student N—1 User` (opcional, único).
La **matrícula** es inmutable tras el alta; la **baja** es lógica (`status`), nunca
`DELETE` físico.

## 4. Reglas de negocio

1. La **matrícula** es autogenerada con formato `AAAA-NNNN` (año de ingreso +
   consecutivo); es única → `409 DUPLICATE_STUDENT_NUMBER`.
2. La **CURP** debe tener formato válido (18 caracteres y patrón oficial) →
   `400 INVALID_CURP`.
3. No se permite CURP repetida → `409 DUPLICATE_CURP`.
4. Se advierte el duplicado por **nombre(s) + apellidos + fecha de nacimiento** →
   `409 DUPLICATE_STUDENT` con `details.matches` (se continúa enviando `confirmDuplicate`).
5. Si el alumno es **menor de edad** (< 18 años) se exige **al menos un tutor**.
6. A lo sumo **un tutor** por alumno con `isPaymentResponsible = true`.
7. La matrícula **no se puede modificar** en edición; la CURP solo se corrige con
   auditoría (`previousState`/`newState`).
8. La **baja** es lógica: `status = WITHDRAWN`; el registro y sus tutores se conservan.
9. `enrollmentDate` por defecto es la fecha del alta (si no se envía).
10. `userId` es **opcional y único**: un alumno puede tener cuenta de portal (A-007).
11. El alumno en `WITHDRAWN` no puede inscribirse (lo valida M07 con `STUDENT_INACTIVE`).

## 5. API

Módulo bajo `api/src/modules/students/` (`routes/ · controllers/ · services/ ·
models/{dto,entity}/`), con `requiresPermission` y alcance por registro.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| POST | `/api/v1/students/query` | Listado server-side (nombre, matrícula, CURP, estatus) | `students.view` |
| POST | `/api/v1/students` | Alta de alumno (tutores anidados) | `students.create` |
| GET | `/api/v1/students/:id` | Detalle con tutores | `students.view` |
| PATCH | `/api/v1/students/:id` | Edición (tutores anidados) | `students.edit` |
| DELETE | `/api/v1/students/:id` | Baja lógica (`status = WITHDRAWN`) | `students.delete` |
| POST | `/api/v1/students/export` | Exportación con filtros vigentes | `students.export` |

**Alta** (`POST /students`)
```json
{
  "firstNames": "Juan",
  "paternalSurname": "Pérez",
  "maternalSurname": "López",
  "curp": "PELJ100101HDFRXN01",
  "birthDate": "2010-01-01",
  "gender": "M",
  "email": "juan@example.com",
  "phone": "5512345678",
  "address": "…",
  "enrollmentDate": "2026-08-01",
  "guardians": [
    { "name": "María López", "relationship": "Madre",
      "phone": "5598765432", "email": "maria@example.com",
      "isPaymentResponsible": true }
  ]
}
```
La respuesta incluye el `id` y la **matrícula generada**. Errores:
`DUPLICATE_CURP`, `DUPLICATE_STUDENT_NUMBER`, `DUPLICATE_STUDENT`, `INVALID_CURP`,
`REQUIRED_FIELD`, `VALIDATION_ERROR`.

**Listado** (`POST /students/query`): contrato de tabla
`{ page, limit, filters, sort }` → `{ data, total, … }` con filtros por `firstNames`,
`studentNumber`, `curp`, `status` y fechas como rango ISO con zona local
(ver [`../../api/convenciones.md`](../../api/convenciones.md)).

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `student` | `entities/student` | API (`tableRequest`, `create`, `update`) + tipos |
| `student-create` | `features/student/create` | Alta con validación de CURP y tutores |
| `student-edit` | `features/student/edit` | Edición del expediente y tutores |
| `student-search` | `features/student/search` | Filtros (nombre, matrícula, CURP, estatus) |
| `student-list` | `features/student/list` | Listado server-side + exportación |
| `/students` | `pages/students` | `ITPage` + `ITDataTable` |
| `/students/new`, `/students/:id/edit` | `pages/students` | `ITFormBuilder` con secciones y tutores |

Pantallas con `ITPage`, `ITDataTable`, `ITFormBuilder`, `ITDialog`,
`ITDatePicker` (nacimiento/ingreso), `PanelCard` (datos del alumno / tutores) y
`KpiTile` (totales activos/baja). Toda columna con datos lleva filtro y orden;
«Exportar» en las acciones de `ITPage` reutiliza los filtros vigentes. i18n con
namespace **`students`**.

## 7. Permisos y alcance

| Permiso | ADMIN | SCHOOL_CONTROL | TEACHER | STUDENT |
|---|---|---|---|---|
| `students.view` | ALL | ALL | AREA | OWN |
| `students.create` | ALL | ALL | · | · |
| `students.edit` | ALL | ALL | · | · |
| `students.delete` | ALL | ALL | · | · |
| `students.export` | ALL | ALL | · | · |

`AREA` (profesor) limita a los alumnos de sus grupos; `OWN` (alumno) al propio
registro. El scoping se aplica en el `WHERE` (`AND`), nunca en el cliente.
Ver [`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

- **Zod** en `models/dto`: `firstNames`/`paternalSurname` requeridos
  (`REQUIRED_FIELD`); `curp` de 18 con patrón y dígito verificador (`INVALID_CURP`);
  `email` (`INVALID_EMAIL`); `phone` (`INVALID_FORMAT`); `birthDate` no
  futura; `gender` en `{M, F, otro}`.
- Tutores: si el alumno es menor, arreglo no vacío; un solo `isPaymentResponsible`.
- Web con `@shared/validation` (`validateCurp`, `validateEmail`, `validatePhone`)
  que devuelve `string | null`; validación en el hook del formulario.
- Mensajes como códigos traducibles; `ZodError` → `400 VALIDATION_ERROR`.

## 9. Bitácora

Acciones vía `AuditPort` con `previousState`/`newState`:

- `STUDENT_CREATED` (incluye matrícula asignada y tutores),
- `STUDENT_UPDATED`,
- `STUDENT_DEACTIVATED` (baja lógica).

Los cambios de tutores se registran dentro de `newState` del alumno. La baja y
reingreso con motivo/historial pertenecen a M05. Ver
[`../../seguridad/bitacora.md`](../../seguridad/bitacora.md).

## 10. Pruebas (Playwright)

- Unitarias (`api/tests/unit`): formato `AAAA-NNNN` de matrícula, validación de
  CURP, detección de duplicado por nombre + fecha, regla «menor exige tutor»,
  responsable de pago único.
- Contrato (`api/tests/e2e`): alta, detalle, edición, baja, contrato de
  `/students/query`, `DUPLICATE_CURP`/`DUPLICATE_STUDENT_NUMBER`/`DUPLICATE_STUDENT`,
  permisos (401/403) y bitácora verificada.
- Navegador (`web/tests/e2e`): alta de alumno con tutor, búsqueda y edición;
  gate por permiso; `insecure-context` sin truenos.
- Spec(s) del módulo: `api/tests/e2e/students.spec.ts`,
  `web/tests/e2e/students.spec.ts`.

## 11. Criterios de aceptación

- [x] Migración y modelos Prisma (`students`, `guardians`) con índices y únicos.
- [x] Módulo API `students` (routes/controller/service/dto/entity) con permisos,
      alcance y bitácora.
- [x] Pantallas web (listado, alta, edición) con UI kit e i18n `students`.
- [x] Specs del módulo pasando.
- [x] Este README completo.

## 12. Decisiones abiertas

- Acceso de alumnos al portal y uso de `userId` (A-007).
- **Resuelto:** el consecutivo de matrícula es global por año (`student_number_sequences`).
- **Resuelto:** el duplicado por nombre + fecha pide confirmación explícita (`confirmDuplicate`).

Ver [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Diccionario de datos — M03](../../modelo-datos/diccionario-datos.md)
- [Entidad-relación](../../modelo-datos/entidad-relacion.md)
- [Convenciones de API](../../api/convenciones.md)
- [Catálogo de errores](../../api/errores.md)
- [Roles y permisos](../../seguridad/roles-permisos.md)
- [Bitácora](../../seguridad/bitacora.md)
- [Web FSD](../../arquitectura/web-fsd.md)
- [Axzy UI System](../../arquitectura/axzy-ui-system.md)
- [Registro de decisiones](../../../DECISIONES.md)
