# M03 — Alumnos (altas)

| Campo | Valor |
|---|---|
| **Código** | M03 |
| **Versión** | 0.1 |
| **Estado** | Planeado |
| **Fase** | Personas |
| **Depende de** | M02 (usuarios, roles y bitácora) |
| **Habilita a** | M05 (bajas/reingresos), M06 (kardex/expediente), M07 (inscripciones), M09 (cargos) |
| **Permisos** | `students.view`, `students.create`, `students.edit`, `students.delete`, `students.export` |

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
- Edición y baja lógica (`status = baja`), exportación del listado.
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
  ACTIVO
  BAJA
}

model Student {
  id              String        @id @default(uuid())
  matricula       String        @unique              // formato AAAA-NNNN
  nombres         String
  apellidoPaterno String        @map("apellido_paterno")
  apellidoMaterno String?       @map("apellido_materno")
  curp            String        @unique
  fechaNacimiento DateTime      @db.Date @map("fecha_nacimiento")
  genero          String?                            // M / F / otro
  email           String?
  telefono        String?
  direccion       String?
  status          StudentStatus @default(ACTIVO)
  fechaIngreso    DateTime      @db.Date @map("fecha_ingreso")
  userId          String?       @unique @map("user_id")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  guardians Guardian[]
  user      User?      @relation(fields: [userId], references: [id])

  @@index([status])
  @@index([apellidoPaterno, apellidoMaterno, nombres])
  @@map("students")
}

model Guardian {
  id                  String   @id @default(uuid())
  studentId           String   @map("student_id")
  nombre              String
  parentesco          String
  telefono            String
  email               String?
  esResponsablePago   Boolean  @default(false) @map("es_responsable_pago")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  student Student @relation(fields: [studentId], references: [id])

  @@index([studentId])
  @@map("guardians")
}
```

**Índices:** `students.matricula`, `students.curp` y `students.userId` únicos;
`students.status`; `students(apellidoPaterno, apellidoMaterno, nombres)`;
`guardians.studentId`.
**Relaciones:** `Student 1—N Guardian`; `Student N—1 User` (opcional, único).
La **matrícula** es inmutable tras el alta; la **baja** es lógica (`status`), nunca
`DELETE` físico.

## 4. Reglas de negocio

1. La **matrícula** es autogenerada con formato `AAAA-NNNN` (año de ingreso +
   consecutivo); es única → `409 DUPLICATE_MATRICULA`.
2. La **CURP** debe tener formato válido (18 caracteres y patrón oficial) →
   `400 INVALID_CURP`.
3. No se permite CURP repetida → `409 DUPLICATE_CURP`.
4. Se advierte el duplicado por **nombre(s) + apellidos + fecha de nacimiento** →
   `409 DUPLICATE_RECORD` (requiere confirmación explícita para continuar).
5. Si el alumno es **menor de edad** (< 18 años) se exige **al menos un tutor**.
6. A lo sumo **un tutor** por alumno con `esResponsablePago = true`.
7. La matrícula **no se puede modificar** en edición; la CURP solo se corrige con
   auditoría (`previousState`/`newState`).
8. La **baja** es lógica: `status = BAJA`; el registro y sus tutores se conservan.
9. `fechaIngreso` por defecto es la fecha del alta (si no se envía).
10. `userId` es **opcional y único**: un alumno puede tener cuenta de portal (A-007).
11. El alumno en `BAJA` no puede inscribirse (lo valida M07 con `STUDENT_INACTIVE`).

## 5. API

Módulo bajo `api/src/modules/students/` (`routes/ · controllers/ · services/ ·
models/{dto,entity}/`), con `requiresPermission` y alcance por registro.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| POST | `/api/v1/students/query` | Listado server-side (nombre, matrícula, CURP, estatus) | `students.view` |
| POST | `/api/v1/students` | Alta de alumno (tutores anidados) | `students.create` |
| GET | `/api/v1/students/:id` | Detalle con tutores | `students.view` |
| PATCH | `/api/v1/students/:id` | Edición (tutores anidados) | `students.edit` |
| DELETE | `/api/v1/students/:id` | Baja lógica (`status = BAJA`) | `students.delete` |
| POST | `/api/v1/students/export` | Exportación con filtros vigentes | `students.export` |

**Alta** (`POST /students`)
```json
{
  "nombres": "Juan",
  "apellidoPaterno": "Pérez",
  "apellidoMaterno": "López",
  "curp": "PELJ100101HDFRXN01",
  "fechaNacimiento": "2010-01-01",
  "genero": "M",
  "email": "juan@example.com",
  "telefono": "5512345678",
  "direccion": "…",
  "fechaIngreso": "2026-08-01",
  "guardians": [
    { "nombre": "María López", "parentesco": "Madre",
      "telefono": "5598765432", "email": "maria@example.com",
      "esResponsablePago": true }
  ]
}
```
La respuesta incluye el `id` y la **matrícula generada**. Errores:
`DUPLICATE_CURP`, `DUPLICATE_MATRICULA`, `DUPLICATE_RECORD`, `INVALID_CURP`,
`REQUIRED_FIELD`, `VALIDATION_ERROR`.

**Listado** (`POST /students/query`): contrato de tabla
`{ page, limit, filters, sort }` → `{ data, total, … }` con filtros por `nombres`,
`matricula`, `curp`, `status` y fechas como rango ISO con zona local
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

| Permiso | ADMIN | CONTROL_ESCOLAR | PROFESOR | ALUMNO |
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

- **Zod** en `models/dto`: `nombres`/`apellidoPaterno` requeridos
  (`REQUIRED_FIELD`); `curp` de 18 con patrón y dígito verificador (`INVALID_CURP`);
  `email` (`INVALID_EMAIL`); `telefono` (`INVALID_FORMAT`); `fechaNacimiento` no
  futura; `genero` en `{M, F, otro}`.
- Tutores: si el alumno es menor, arreglo no vacío; un solo `esResponsablePago`.
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
  `/students/query`, `DUPLICATE_CURP`/`DUPLICATE_MATRICULA`/`DUPLICATE_RECORD`,
  permisos (401/403) y bitácora verificada.
- Navegador (`web/tests/e2e`): alta de alumno con tutor, búsqueda y edición;
  gate por permiso; `insecure-context` sin truenos.
- Spec(s) del módulo: `api/tests/e2e/students.spec.ts`,
  `web/tests/e2e/students.spec.ts`.

## 11. Criterios de aceptación

- [ ] Migración y modelos Prisma (`students`, `guardians`) con índices y únicos.
- [ ] Módulo API `students` (routes/controller/service/dto/entity) con permisos,
      alcance y bitácora.
- [ ] Pantallas web (listado, alta, edición) con UI kit e i18n `students`.
- [ ] Specs del módulo pasando.
- [ ] Este README completo.

## 12. Decisiones abiertas

- Acceso de alumnos al portal y uso de `userId` (A-007).
- Origen del **consecutivo** de matrícula: ¿por año global o por nivel? (registrar).
- Tratamiento de duplicado por nombre + fecha: ¿bloqueo o confirmación explícita?
  (propuesto: confirmación).

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
