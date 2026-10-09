# M22 — Programas (carreras), plan de estudios y plan de pagos

| Campo | Valor |
|---|---|
| **Código** | M22 |
| **Versión** | 0.2 |
| **Estado** | Propuesto (especificado, sin código) |
| **Fase** | Extras |
| **Depende de** | M03 (alumnos), M07 (cursos/grupos/inscripciones, `Term`), M09 (cargos/pagos), M11 (`settings`) |
| **Habilita a** | Onboarding de alumnos por carrera, estado de cuenta con plan de pagos, M10/M21 (ingresos y becas) |
| **Permisos** | `programs.view`, `programs.manage`, `plans.view`, `plans.manage` |

> **Idioma (D-046):** modelos, columnas, enums y claves en **inglés**; comentarios
> y documentación en español; todo lo visible por **i18n** (API + web).

## 1. Objetivo

Configurar **carreras** con su costo mensual y de **reinscripción** y su
**esquema de periodos**, dar de alta su **plan de estudios** (materias por
periodo) y **generar el plan de pagos** de un alumno de forma **sencilla y sin
cálculos manuales**.

## 2. Alcance

**Incluye**
- Carreras (`Program`) con `monthlyFee`, `enrollmentFee` (reinscripción),
  `periodType` (`BIMONTHLY|TRIMESTER|QUADRIMESTER|SEMESTER`) y `periodCount`.
- Plan de estudios: materias (`Course` de M07) por `periodIndex`.
- Asignación de un alumno a una carrera y generación **idempotente** de su plan
  de pagos (una **reinscripción por periodo** + las mensualidades del periodo)
  con **snapshot** de montos y **descuentos**.
- Vista del plan del alumno y su avance (reusa el estado de cuenta de M09).

**No incluye**
- Inscripción a grupos/cupo/horario (M07): **paso separado** (ver §4.9).
- Recargos por mora (M09, D-033) y cancelación de pagos (M09).
- **Prorrateo** automático a mitad de periodo en la v1 (ver §4.11).

## 3. Modelo de datos (Prisma)

```prisma
enum PeriodType {
  BIMONTHLY    // 2 meses
  TRIMESTER    // 3 meses
  QUADRIMESTER // 4 meses
  SEMESTER     // 6 meses
}

enum PlanStatus {
  ACTIVE
  COMPLETED
  CANCELLED
}

/// Carrera/programa: costos y esquema de periodos.
model Program {
  id              String     @id @default(uuid())
  code            String     @unique            // MEC-DIESEL
  name            String
  description     String?
  periodType      PeriodType @map("period_type")
  periodCount     Int        @map("period_count")
  /// Meses por periodo (2/3/4/6). Null = derivado de `periodType`.
  monthsPerPeriod Int?       @map("months_per_period")
  monthlyFee      Decimal    @map("monthly_fee") @db.Decimal(12, 2)
  enrollmentFee   Decimal    @map("enrollment_fee") @db.Decimal(12, 2) // reinscripción (por periodo)
  active          Boolean    @default(true)
  createdAt       DateTime   @default(now()) @map("created_at")
  updatedAt       DateTime   @updatedAt @map("updated_at")

  subjects ProgramSubject[]
  plans    StudentPlan[]

  @@index([active])
  @@map("programs")
}

/// Plan de estudios: materia (curso de M07) en un periodo.
model ProgramSubject {
  id          String   @id @default(uuid())
  programId   String   @map("program_id")
  courseId    String   @map("course_id")
  periodIndex Int      @map("period_index")   // 1..periodCount
  sortOrder   Int      @default(0) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at")

  program Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  course  Course  @relation(fields: [courseId], references: [id])

  @@unique([programId, courseId])
  @@index([programId, periodIndex])
  @@map("program_subjects")
}

/// Plan de pagos de un alumno (snapshot de montos y descuento al generarlo).
model StudentPlan {
  id              String     @id @default(uuid())
  studentId       String     @map("student_id")
  programId       String     @map("program_id")
  termId          String?    @map("term_id")
  startDate       DateTime   @map("start_date") @db.Date
  periodType      PeriodType @map("period_type")
  periodCount     Int        @map("period_count")
  monthlyFee      Decimal    @map("monthly_fee") @db.Decimal(12, 2)
  enrollmentFee   Decimal    @map("enrollment_fee") @db.Decimal(12, 2)
  /// Descuento: porcentaje o monto (uno de los dos) + motivo (becas).
  discountPercent Decimal?   @map("discount_percent") @db.Decimal(5, 2)
  discountAmount  Decimal?   @map("discount_amount") @db.Decimal(12, 2)
  discountReason  String?    @map("discount_reason")
  status          PlanStatus @default(ACTIVE)
  createdBy       String?    @map("created_by")
  createdAt       DateTime   @default(now()) @map("created_at")
  updatedAt       DateTime   @updatedAt @map("updated_at")

  student Student @relation(fields: [studentId], references: [id])
  program Program @relation(fields: [programId], references: [id])
  term    Term?   @relation(fields: [termId], references: [id])
  charges Charge[]

  @@index([studentId, status])
  @@index([programId])
  @@map("student_plans")
}
```

**Cambios en M07 (`Term`):** `calendar Json?` — datos configurables de los
periodos (`[{ name, startDate, endDate }]`), para nombrar/fechar los periodos sin
hardcodear. Por defecto, calendario natural (enero…diciembre) en español.

**Cambios en M09 (`Charge`):** `planId String? @map("plan_id")` +
`planChargeIndex Int? @map("plan_charge_index")` con `@@unique([planId, planChargeIndex])`.

**Nuevo parámetro (`settings`, M11):** `PAYMENT_DUE_DAY` (entero 1..28; default **5**).

## 4. Reglas de negocio

1. **Meses por periodo:** `BIMONTHLY=2`, `TRIMESTER=3`, `QUADRIMESTER=4`,
   `SEMESTER=6`; `monthsPerPeriod` permite sobreescribirlo.
2. **Cargos por periodo:** por **cada** periodo `p` se generan **1 reinscripción**
   (`enrollmentFee`) + `monthsPerPeriod` **mensualidades** (`monthlyFee`).
   Total de cargos = `periodCount × (1 + monthsPerPeriod)`. *(Una reinscripción por
   periodo; si el cliente no la cobra, basta con `enrollmentFee = 0`.)*
3. **Vencimientos:** el **día** es `settings.PAYMENT_DUE_DAY` (default 5). La
   reinscripción del periodo `p` vence en el **primer mes del periodo**; las
   mensualidades vencen en los meses siguientes del periodo. Los meses/periodos
   salen del **calendario del `Term`** (`calendar`); si no está definido, se
   derivan de `startDate` (mes 0 = `startDate`).
4. **Snapshot:** los montos (y el descuento) quedan fijos al generar; cambiar el
   precio de la carrera **no** recalcula planes existentes.
5. **Descuentos (becas):** `discountPercent` **o** `discountAmount` + `discountReason`
   en la asignación. El monto de cada cargo se genera **ya con el descuento**
   (`fee × (1 − percent/100) − amount`, mínimo 0). Los reportes de becas salen directo.
6. **Idempotencia:** `POST /plans` con `Idempotency-Key`; repetir no duplica. El
   índice único `(planId, planChargeIndex)` impide cargos duplicados.
7. **Plan de estudios:** una materia una sola vez por carrera
   (`@@unique(programId, courseId)`); `periodIndex` en `1..periodCount`.
8. **Baja de carrera:** lógica (`active=false`); con planes existentes solo se
   desactiva.
9. **Inscripción separada:** asignar el plan **solo genera cargos**. La
   inscripción a grupos (cupo/horario/estatus) se hace en **M07**. Existe una
   acción **opcional** «Asignar plan e inscribir» que llama a **ambos servicios**
   (no los acopla).
10. **Cancelación del plan:** marca `CANCELLED` y cancela con motivo (M09) los
    cargos pendientes sin pagos; los pagados se conservan.
11. **Prorrateo:** **no automático** en la v1. El administrador puede **ajustar el
    monto del primer cargo** manualmente, con motivo (queda en bitácora). Si el
    cliente lo pide, se agrega después una regla simple (cobrar solo las
    mensualidades restantes).
12. **Auditoría** de todo (carrera, plan de estudios, plan de pagos, ajustes).

## 5. API

Módulo bajo `api/src/modules/programs/`.

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST | `/api/v1/programs/query` | `programs.view` | Tabla server-side de carreras |
| GET | `/api/v1/programs/:id` | `programs.view` | Detalle con plan de estudios por periodo |
| POST | `/api/v1/programs` | `programs.manage` | Alta (`code` único) |
| PATCH | `/api/v1/programs/:id` | `programs.manage` | Edición (fees, periodType, periodCount) |
| PUT | `/api/v1/programs/:id/subjects` | `programs.manage` | Reemplaza el plan de estudios |
| DELETE | `/api/v1/programs/:id` | `programs.manage` | Baja lógica |
| POST | `/api/v1/programs/:id/reactivate` | `programs.manage` | Reactiva |
| POST | `/api/v1/plans` | `plans.manage` | Asigna alumno y **genera el plan** (`Idempotency-Key`) |
| POST | `/api/v1/plans/query` | `plans.view` | Tabla de planes |
| GET | `/api/v1/plans/:id` | `plans.view` | Detalle con cargos y avance |
| POST | `/api/v1/plans/:id/cancel` | `plans.manage` | Cancela el plan y sus cargos pendientes |

**`POST /programs` / `PATCH`:**
```jsonc
{ "code": "MEC-DIESEL", "name": "Mecánico Diésel",
  "periodType": "QUADRIMESTER", "periodCount": 3,
  "monthlyFee": 1500, "enrollmentFee": 1000 }
```

**`PUT /programs/:id/subjects`:**
```jsonc
{ "subjects": [
  { "courseId": "uuid", "periodIndex": 1, "sortOrder": 0 },
  { "courseId": "uuid", "periodIndex": 1, "sortOrder": 1 } ] }
```

**`POST /plans`:**
```jsonc
// Request
{ "studentId": "uuid", "programId": "uuid", "termId": "uuid", "startDate": "2026-09-01",
  "discountPercent": 20, "discountReason": "Beca deportiva" }
// Response 201
{ "planId": "uuid", "periods": 3, "monthsPerPeriod": 4,
  "totals": { "enrollmentCharges": 3, "monthlyCharges": 12, "charges": 15 },
  "firstDueDate": "2026-09-05", "lastDueDate": "2027-08-05" }
```

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `program` | `entities/program` | API + tipos de carrera y plan de estudios |
| `plan` | `entities/plan` | API + tipos de plan de pagos |
| `programs/programs-list` + `program-form` | `features/programs` | Catálogo de carreras (CRUD + fees) |
| `programs/study-plan-editor` | `features/programs` | Materias por periodo (ordenar) |
| `plans/assign-plan` | `features/plans` | Asignar alumno (descuento/motivo) → **previsualiza** y genera |
| `plans/plan-panel` | `widgets/plan-panel` | Plan del alumno con avance (reusa estado de cuenta) |
| `/programs`, `/programs/:id` | `pages/programs` | Catálogo y detalle/plan de estudios |
| `/students/:id` (pestaña) | `pages/students` | «Plan de pagos» del alumno |

Namespace i18n **`programs`**. `ITStepper` (asistente de asignación), `KpiTile`
para totales. Botón opcional **«Asignar plan e inscribir»** (llama a M22 + M07).

## 7. Permisos y alcance

- `programs.view` / `programs.manage` y `plans.view` / `plans.manage` (`ALL`
  para ADMIN/`SCHOOL_CONTROL`).
- El alumno (`STUDENT`) ve su plan en su expediente (OWN, vía M09/estado de cuenta).

## 8. Validaciones

- `code` `^[A-Z0-9-]{2,30}$` y único; `name` 1–150.
- `periodType` ∈ enum; `periodCount` entero `1..20`.
- `monthlyFee`/`enrollmentFee` `Decimal ≥ 0`.
- `subjects`: `courseId` activo; `periodIndex` en `1..periodCount`; sin duplicar.
- `POST /plans`: alumno y programa activos, `startDate` válida; `discountPercent`
  `0..100` **o** `discountAmount ≥ 0`; `Idempotency-Key` con formato válido.

## 9. Bitácora

`PROGRAM_CREATED`, `PROGRAM_UPDATED`, `PROGRAM_DEACTIVATED`, `PROGRAM_SUBJECTS_UPDATED`,
`STUDENT_PLAN_CREATED`, `STUDENT_PLAN_CANCELLED`, `CHARGE_ADJUSTED` (ajuste manual
del primer cargo, con motivo).

## 10. Pruebas (Playwright)

- **Unitarias:** mapeo `periodType → meses`; número y calendario de cargos
  (reinscripción por periodo + mensualidades); aplicación de descuentos.
- **Contrato:** alta de carrera; `PUT /subjects`; `POST /plans` genera
  `periodCount × (1 + meses)` cargos con vencimientos al día configurado;
  repetir con la misma `Idempotency-Key` no duplica; snapshot; cancelación;
  permisos 401/403; bitácora.
- **Navegador:** configurar carrera + plan de estudios; asignar alumno (con
  descuento) y ver el plan en su expediente.

## 11. Criterios de aceptación

- [ ] Migración `m22_programs_student_plans`.
- [ ] Módulo API con generación idempotente y descuentos.
- [ ] Plan de estudios reutilizando `Course` de M07.
- [ ] Plan de pagos con snapshot y cargos ligados (`Charge.planId`).
- [ ] Settings `PAYMENT_DUE_DAY` y `Term.calendar`.
- [ ] Pantallas web (carreras, plan de estudios, asignar plan, plan del alumno).
- [ ] Specs en verde y este README como fuente de verdad.

## 12. Ejemplos de las carreras del cliente

Con `QUADRIMESTER` y 3 periodos (`monthsPerPeriod = 4`), el plan genera
**3 reinscripciones + 12 mensualidades = 15 cargos**:

| Carrera | Mensualidad | Reinscripción (por periodo) | Reinscripciones | Mensualidades |
|---|---|---|---|---|
| Mecánico Diésel | 1500 | 1000 | 3 | 12 |
| Mecánico Gasolina | 1000 | 500 | 3 | 12 |
| Mecánico Eléctrico | 2500 | 2000 | 3 | 12 |

*(`periodType`/`periodCount` son configurables; el cliente que no cobra
reinscripción pone `enrollmentFee = 0`.)*

## 13. Decisiones (cerradas) y abiertas

**Cerradas ([D-048](../../../DECISIONES.md)):**
- Reinscripción **una vez por periodo** (`$0` la desactiva).
- Día de vencimiento fijo **`settings.PAYMENT_DUE_DAY`** (default 5).
- Asignar plan e **inscribir son pasos separados** (acción opcional que llama a ambos).
- **Dos conceptos genéricos** `INSCRIPCION`/`COLEGIATURA`; monto del plan.
- **Sin prorrateo** automático (ajuste manual con motivo; regla futura).
- **Descuentos por plan** (`discountPercent`/`discountAmount` + motivo).
- **Calendario/periodos configurables** en `Term` (natural en español por defecto).

**Abiertas:**
- Regla de prorrateo (si el cliente la define).
- Nombre por defecto de los periodos del `Term` para la escuela.
- ¿Descuento por porcentaje+monto simultáneos o exclusivos? (hoy: exclusivos).

## 14. Referencias

- Plantilla: [`plantilla-modulo.md`](../../plantillas/plantilla-modulo.md).
- M07: [`../M07-cursos-grupos-inscripciones/README.md`](../M07-cursos-grupos-inscripciones/README.md).
- M09: [`../M09-colegiaturas-pagos/README.md`](../M09-colegiaturas-pagos/README.md).
- Decisiones: [D-046, D-047, D-048](../../../DECISIONES.md).
- Convenciones: [`../../guia/convenciones.md`](../../guia/convenciones.md) §11.
