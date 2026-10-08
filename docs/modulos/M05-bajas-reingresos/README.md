# M05 — Bajas y reingresos

| Campo | Valor |
|---|---|
| **Código** | M05 |
| **Versión** | 0.1 |
| **Estado** | En diseño |
| **Fase** | Personas |
| **Depende de** | M02 (autenticación, roles y bitácora), M03 (alumnos), M07 (inscripciones que se cancelan) |
| **Habilita a** | M06 (expediente y kardex histórico), M07 (reingreso y reinscripción), M10/M21 (reportes de deserción y reactivación) |
| **Permisos** | `students.movements` (alcance `ALL`) |

## 1. Objetivo

Registrar de forma trazable las **bajas** y **reingresos** de alumnos sin perder
el historial académico ni administrativo. Resuelve el ciclo de vida del alumno
para Control Escolar: dar de baja conserva expediente, calificaciones e
inscripciones previas; el reingreso reactiva al alumno con la **misma matrícula**.

## 2. Alcance

**Incluye**
- Registro de movimientos `baja` y `reingreso` por alumno, con motivo obligatorio.
- Cambio de `Student.status` (`activo` ⇄ `baja`) y cancelación lógica de las
  inscripciones activas.
- Consulta del historial de movimientos por alumno.
- Bitácora `STUDENT_DEACTIVATED` / `STUDENT_REACTIVATED`.

**No incluye (en este módulo)**
- El alta y la edición del alumno (M03).
- La creación/edición de grupos e inscripciones (M07); la baja solo las cancela.
- Efectos financieros de la baja/reingreso (cargos, pagos, recargos) → M09.
- Reembolsos o notas de crédito.
- Baja de personal docente (M04).

## 3. Modelo de datos (Prisma)

```prisma
model StudentMovement {
  id            String        @id @default(uuid())
  studentId     String        @map("student_id")
  tipo          MovementType
  motivo        String
  fecha         DateTime      @db.Date
  observaciones String?
  createdBy     String        @map("created_by")
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  student Student @relation(fields: [studentId], references: [id])
  author  User    @relation(fields: [createdBy], references: [id])

  @@index([studentId, fecha])
  @@index([tipo])
  @@index([createdBy])
  @@map("student_movements")
}

enum MovementType {
  BAJA
  REINGRESO
}
```

Notas de convención:
- `id uuid`, `createdAt`/`updatedAt`; los movimientos **no se borran ni se
  editan** (historial inmutable), por lo que no llevan `deletedAt`.
- `tipo` es enum `UPPER_SNAKE`; en BD el diccionario lo describe como
  `varchar(20)` con valores `baja`/`reingreso` (ver
  [`diccionario-datos.md`](../../modelo-datos/diccionario-datos.md)).
- `createdBy` es FK a `users.id` (autor del movimiento), independiente de a quién
  se le da de baja.

**Índices:** `(studentId, fecha)` para el historial del alumno; `tipo` para
reportes; `createdBy` para auditoría.
**Relaciones:** `Student 1—N StudentMovement`; `User 1—N StudentMovement`.

## 4. Reglas de negocio

1. **Baja**: cambia `Student.status` de `activo` a `baja` y registra un
   `StudentMovement` de tipo `BAJA`.
2. **Cancelación de inscripciones**: al dar de baja, toda inscripción del alumno
   con `status = INSCRITO` pasa a `status = BAJA` (borrado lógico); nunca se
   elimina físicamente.
3. **Conservación del historial**: la baja conserva expediente documental,
   movimientos previos, inscripciones, calificaciones y cargos; la baja **no**
   borra información.
4. **Reingreso**: reactiva `Student.status` a `activo` y registra un
   `StudentMovement` de tipo `REINGRESO`. La **matrícula se conserva** (no se
   regenera).
5. **Motivo obligatorio** en baja y reingreso (`motivo` no vacío).
6. **No repetir estado**: no se permite dar de baja a un alumno ya en `baja`
   (`STUDENT_INACTIVE`) ni reingresar a un alumno ya `activo` (conflicto de
   estado).
7. **Atomicidad**: el cambio de estado, la cancelación de inscripciones, el
   movimiento y el registro de bitácora ocurren en **una sola transacción**; si
   algo falla, todo hace rollback (incluido el log).
8. **Autoría**: `createdBy` es el usuario autenticado que ejecuta la acción; se
   toma de `req.user`, nunca del body.
9. **Alumno en baja no se inscribe**: M07 consulta `Student.status` y rechaza la
   inscripción con `STUDENT_INACTIVE` (regla que M05 deja lista).
10. **Fecha de movimiento**: `fecha` no puede ser futura respecto a la fecha de
    calendario local (`America/Mexico_City`).
11. **Alcance**: un usuario con `students.movements` en `ALL` gestiona movimientos
    de cualquier alumno; no existe alcance `OWN` para este recurso.

## 5. API

Módulo bajo `api/src/modules/students/` (los movimientos son un subdominio de
alumnos): `routes/students.routes.ts` · `controllers/students.controller.ts` ·
`services/students.service.ts` · `models/dto/students.dto.ts` ·
`models/entity/students.entity.ts`. Ver
[`api-modular.md`](../../arquitectura/api-modular.md).

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| POST | `/api/v1/students/:id/baja` | Da de baja al alumno y cancela inscripciones activas | `students.movements` |
| POST | `/api/v1/students/:id/reingreso` | Reactiva al alumno conservando matrícula | `students.movements` |
| GET | `/api/v1/students/:id/movements` | Historial de movimientos del alumno | `students.movements` |

Request/response (Zod + resultado):

```ts
// POST /api/v1/students/:id/baja
export const StudentBajaSchema = z.object({
  motivo: z.string().min(5, "REQUIRED_FIELD").max(500),
  fecha: z.string().date(),              // YYYY-MM-DD
  observaciones: z.string().max(1000).optional(),
}).openapi("StudentBaja");

// 200 OK
{
  "studentId": "…",
  "status": "baja",
  "movement": { "id": "…", "tipo": "BAJA", "motivo": "…", "fecha": "2026-03-01" },
  "cancelledEnrollments": 3
}
```

- Escrituras no idempotentes aceptan `Idempotency-Key` (`^[A-Za-z0-9_-]{8,100}$`);
  repetir la baja devuelve el resultado previo (ver [D-013](../../../DECISIONES.md)).
- Errores con el envelope plano de [`errores.md`](../../api/errores.md):
  `STUDENT_INACTIVE` (409), `RECORD_NOT_FOUND` (404), `VALIDATION_ERROR` (400).

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `studentMovement` | `entities/student` | API (`studentApi.baja/reingreso/movements`) + tipo del movimiento |
| Baja de alumno | `features/student/baja` | `model/useBaja.ts` + `ui/BajaDialog.tsx` (motivo + fecha) |
| Reingreso de alumno | `features/student/reingreso` | `model/useReingreso.ts` + diálogo de confirmación |
| Historial de movimientos | `features/student/movements` | Tabla de movimientos por alumno |
| Detalle de alumno | `pages/students/StudentDetailPage.tsx` | Pestaña «Movimientos» dentro del expediente |

- Pantalla de detalle con `ITPage`; el historial en `ITDataTable` (columnas
  tipo/fecha/motivo/autor, con filtro y orden por columna).
- Acciones «Dar de baja» / «Reingresar» con `ITDialog` + `ITFormBuilder`
  (motivo `textarea` obligatorio, `ITDatePicker` para la fecha).
- Estado/resumen con `KpiTile` (p. ej. «Movimientos registrados»).
- i18n namespace `students` (`shared/i18n/locales/{es,en}/students.json`); la web
  valida con `@shared/validation` y usa `usePermission("students.movements")`
  para habilitar acciones.

## 7. Permisos y alcance

| Permiso | Alcance | Uso |
|---|---|---|
| `students.movements` | `ALL` | Registrar baja/reingreso y consultar historial |

- ADMIN y CONTROL_ESCOLAR: `ALL`. ALUMNO: `R (OWN)` solo su propio historial.
  PROFESOR: sin acceso. Ver matriz en
  [`roles-permisos.md`](../../seguridad/roles-permisos.md).
- El scoping se aplica en la consulta (`AND`), nunca en el cliente; `usePermission`
  solo oculta la UI.
- Rutas: `requiresPermission("students.movements")`; en la web,
  `<RequiresPermission>` gate por pantalla.

## 8. Validaciones

- Zod en `models/dto`: `motivo` (`min 5`, `max 500`, requerido), `fecha`
  (`YYYY-MM-DD`, no futura), `observaciones` (`max 1000`), `id` de alumno UUID.
- `tipo` de movimiento es inmutable y se define por endpoint (no viaja en el body).
- Códigos/mensajes: `REQUIRED_FIELD`, `INVALID_FORMAT`, `INVALID_RANGE` (fecha
  futura), `STUDENT_INACTIVE`, `VALIDATION_ERROR`.
- Web: `@shared/validation` valida antes de enviar; los códigos se traducen con el
  namespace `students`.

## 9. Bitácora

Registrado vía `AuditPort` con `previousState`/`newState`, atado a la misma
transacción del cambio. Ver [`bitacora.md`](../../seguridad/bitacora.md).

| Acción | `entityType` | `previousState` → `newState` | `metadata` |
|---|---|---|---|
| `STUDENT_DEACTIVATED` | `Student` | `{ status: "activo" }` → `{ status: "baja" }` | `{ motivo, fecha, movementId, cancelledEnrollments }` |
| `STUDENT_REACTIVATED` | `Student` | `{ status: "baja" }` → `{ status: "activo" }` | `{ motivo, fecha, movementId }` |

No se registran binarios ni datos sensibles; el movimiento en sí (`StudentMovement`)
es el historial de negocio y la bitácora es el registro de auditoría.

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): una por regla — baja cambia estado; baja
  cancela inscripciones; reingreso conserva matrícula; motivo obligatorio; no
  repetir estado; atomicidad (rollback deja estado previo); fecha no futura.
- **Contrato** (`api/tests/e2e`): `POST /students/:id/baja` → 200 y estado `baja`;
  baja de alumno ya en baja → 409 `STUDENT_INACTIVE`; reingreso → 200 y matrícula
  intacta; sin permiso → 403 `INSUFFICIENT_PERMISSIONS`; sin token → 401.
- **Navegador** (`web/tests/e2e`): registrar baja desde el detalle del alumno,
  ver el movimiento en la tabla y ejecutar reingreso.
- **Spec del módulo**: `tests/e2e/students-movements.spec.ts`.

## 11. Criterios de aceptación

- [ ] Migración y modelo Prisma (`StudentMovement` + enum, con índices).
- [ ] Módulo API (routes/controller/service/dto/entity) con `students.movements`
      y bitácora por `AuditPort`.
- [ ] Pantallas web con UI kit (detalle + diálogos + historial) e i18n `students`.
- [ ] Specs pasando (solo los del módulo).
- [ ] Este README completo.

## 12. Decisiones abiertas

- ¿La baja cancela cargos pendientes o los deja vigentes para cobranza? → coordinar
  con M09 y registrar en [`DECISIONES.md`](../../../DECISIONES.md).
- ¿El reingreso debe reactivar automáticamente las inscripciones canceladas por la
  baja, o exige reinscripción manual en el ciclo vigente (M07)?
- ¿Se permite reingresar a un alumno con adeudos? ¿Se aplica recargo?

## 13. Referencias

- Plantilla: [`plantilla-modulo.md`](../../plantillas/plantilla-modulo.md).
- Alumnos (M03): [`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md) (`students`).
- Inscripciones (M07): [`../M07-cursos-grupos-inscripciones/README.md`](../M07-cursos-grupos-inscripciones/README.md).
- Errores: [`../../api/errores.md`](../../api/errores.md) · Convenciones API: [`../../api/convenciones.md`](../../api/convenciones.md).
- Roles: [`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md) · Bitácora: [`../../seguridad/bitacora.md`](../../seguridad/bitacora.md).
- Arquitectura: [`../../arquitectura/api-modular.md`](../../arquitectura/api-modular.md), [`../../arquitectura/web-fsd.md`](../../arquitectura/web-fsd.md), [`../../arquitectura/axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).
- Decisiones: [`../../../DECISIONES.md`](../../../DECISIONES.md).
