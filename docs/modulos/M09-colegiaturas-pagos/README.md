# M09 — Colegiaturas y pagos manuales

| Campo | Valor |
|---|---|
| **Código** | M09 |
| **Versión** | 0.1 |
| **Estado** | Terminado (F4) |
| **Fase** | Finanzas |
| **Depende de** | M03 (alumnos), M07 (cursos, grupos e inscripciones), M11 (parámetros: recargos, datos de la escuela), M02 (roles y bitácora) |
| **Habilita a** | M10 (reportes de pagos y adeudos), M19 (notificaciones de cobranza) |
| **Permisos** | `fee_concepts.manage`, `charges.view`, `charges.create`, `charges.generate`, `charges.cancel`, `payments.register`, `payments.cancel` (con alcance) |

## Implementación (F4, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/finance` y `web/src/{entities/finance,features/finance,widgets/account-statement}`; página `/finance` (Cargos · Pagos · Conceptos) y pestaña «Estado de cuenta» del expediente del alumno.

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST · GET | `/api/v1/fee-concepts/query` · `/fee-concepts/options` | `charges.view` | Opciones sin el concepto RECARGO |
| POST · PATCH · DELETE | `/api/v1/fee-concepts` · `/:id` (+ `/:id/reactivate`) | `fee_concepts.manage` | El concepto «Recargo por mora» es del sistema (`409 FEE_CONCEPT_RESERVED`) |
| POST · GET | `/api/v1/charges/query` · `/charges/:id` | `charges.view` | OWN = cargos del alumno vinculado |
| POST | `/api/v1/charges` | `charges.create` | Monto por defecto del concepto; política ABAC `charges.create` (tope de descuento) |
| POST | `/api/v1/charges/generate` | `charges.generate` | Grupo o ciclo; `Idempotency-Key` (repite la respuesta, 200) y sin duplicar vigentes |
| POST | `/api/v1/charges/late-fees` | `charges.generate` | Recargos según `LATE_FEE` (M11) |
| DELETE | `/api/v1/charges/:id` | `charges.cancel` | Motivo obligatorio; con pagos vigentes → `409 CHARGE_HAS_PAYMENTS` |
| GET | `/api/v1/students/:id/account-statement` | `charges.view` | JSON; el PDF se arma en la web |
| POST · GET | `/api/v1/payments/query` · `/payments/:id` | `charges.view` | |
| POST | `/api/v1/payments` | `payments.register` | Serializable; folio `REC-AAAA-NNNNNN`; `Idempotency-Key` |
| DELETE | `/api/v1/payments/:id` | `payments.cancel` | Motivo obligatorio; política ABAC `payments.cancel` |

Decisiones (sección 12) y diferencias con el borrador:
- **Folio** consecutivo por año (`receipt_sequences`, fila bloqueada en la transacción): `REC-2026-000123`, reinicia cada año y nunca se reutiliza (un pago cancelado conserva su folio).
- **Pago mayor al saldo** responde `400 PAYMENT_EXCEEDS_BALANCE` (con el saldo) en lugar de `VALIDATION_ERROR`; un cargo cancelado no se reactiva con pagos: se emite uno nuevo.
- **Recargo por mora** = `saldo × dailyRate × (días vencidos − graceDays)`, redondeado a centavos; un cargo RECARGO por cargo vencido (`parentChargeId` único), recalculado mientras no tenga pagos. Se aplica a demanda (botón «Aplicar recargos»), no con un job.
- **Descuento**: sin autorización fija; se puede topar con una política ABAC sobre `porcentajeDescuento` (acción `charges.create`).
- La generación masiva solo carga a alumnos **ACTIVOS** con inscripción vigente; el método de pago agrega `TARJETA`. Ver [D-031](../../../DECISIONES.md) … [D-033](../../../DECISIONES.md).
- Notas de crédito / saldo a favor: fuera de alcance de esta versión.

## 1. Objetivo

Administrar los conceptos de cobro y los cargos de cada alumno, y registrar los
pagos (parciales o totales) que se reciben de forma manual en ventanilla,
manteniendo el estado de cuenta del alumno y emitiendo recibos con folio
consecutivo.

## 2. Alcance

**Incluye**
- CRUD de conceptos de pago (`fee_concepts`) con monto base y tipo.
- Alta de cargos individuales (`charges`) y generación masiva por grupo o ciclo.
- Registro de pagos manuales (`payments`) con método, referencia y folio de recibo.
- Cálculo del estado del cargo (`pendiente` → `parcial` → `pagado`) y del saldo.
- Cancelación de pagos con motivo (sin borrado físico).
- Recargos por mora configurables (opcionales) y descuentos por cargo.
- Estado de cuenta del alumno, exportable a PDF.

**No incluye (en este módulo)**
- Pasarela de pago en línea o cobro automático (los pagos son manuales).
- Cobranza por notificación (correo/SMS/WhatsApp): M19.
- Reportes agregados de ingresos y adeudos: M10.
- Definición de la estructura de ciclo escolar: M07/M11.

## 3. Modelo de datos (Prisma)

Convención: `id uuid`, `createdAt`/`updatedAt`, borrado lógico por dominio
(`cancelledAt`) y dinero con `Decimal @db.Decimal(12,2)`
(ver [D-003](../../../DECISIONES.md) y
[`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md)).

```prisma
enum FeeConceptType {
  INSCRIPCION
  COLEGIATURA
  MATERIAL
  OTRO
}

enum ChargeStatus {
  PENDIENTE
  PARCIAL
  PAGADO
  CANCELADO
}

enum PaymentMethod {
  EFECTIVO
  TRANSFERENCIA
  DEPOSITO
  OTRO
}

model FeeConcept {
  id        String         @id @default(uuid())
  nombre    String
  monto     Decimal        @db.Decimal(12, 2)
  tipo      FeeConceptType
  active    Boolean        @default(true)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  charges Charge[]

  @@map("fee_concepts")
}

model Charge {
  id                String       @id @default(uuid())
  studentId         String       @map("student_id")
  conceptId         String       @map("concept_id")
  termId            String?      @map("term_id")
  monto             Decimal      @db.Decimal(12, 2)
  descuento         Decimal      @default(0) @db.Decimal(12, 2)
  fechaVencimiento  DateTime     @map("fecha_vencimiento") @db.Date
  status            ChargeStatus @default(PENDIENTE)
  cancelledAt       DateTime?    @map("cancelled_at")
  cancelReason      String?      @map("cancel_reason")
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  student  Student    @relation(fields: [studentId], references: [id])
  concept  FeeConcept @relation(fields: [conceptId], references: [id])
  term     Term?      @relation(fields: [termId], references: [id])
  payments Payment[]

  @@index([studentId])
  @@index([status])
  @@index([termId])
  @@map("charges")
}

model Payment {
  id             String        @id @default(uuid())
  chargeId       String        @map("charge_id")
  monto          Decimal       @db.Decimal(12, 2)
  fecha          DateTime      @db.Date
  metodo         PaymentMethod
  referencia     String?
  reciboFolio    String        @unique @map("recibo_folio")
  registeredBy   String        @map("registered_by")
  cancelledAt    DateTime?     @map("cancelled_at")
  cancelReason   String?       @map("cancel_reason")
  idempotencyKey String?       @unique @map("idempotency_key")
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  charge Charge @relation(fields: [chargeId], references: [id])

  @@index([chargeId])
  @@map("payments")
}
```

**Índices:** `charges(student_id)`, `charges(status)`, `charges(term_id)`,
`payments(charge_id)`; `payments.recibo_folio` y `payments.idempotency_key`
únicos. Índice único parcial y progresión del folio se agregan en migración SQL.
**Relaciones:** `Charge` N→1 `Student`, `FeeConcept`, `Term`; `Payment` N→1
`Charge`.
**Borrado lógico:** cargos y pagos **no se borran** físicamente: se cancelan con
`cancelledAt`/`cancelReason` y quedan en bitácora.

## 4. Reglas de negocio

1. Se permiten **pagos parciales**; el cargo pasa a `pagado` solo cuando la suma
   de pagos vigentes cubre el total (`monto - descuento`).
2. El cargo se recalcula a `parcial` o `pendiente` según los pagos vigentes.
3. Un pago **no se borra**: se cancela con motivo, se conserva el folio y queda
   en bitácora (`PAYMENT_CANCELLED`) con `previousState`/`newState`.
4. Un cargo `pagado` o `cancelado` no admite nuevos pagos: `CHARGE_ALREADY_PAID` (409).
5. El `reciboFolio` es **consecutivo e irrepetible** (`@unique`); se asigna en
   transacción al registrar el pago.
6. Los **recargos por mora** son configurables en M11 (`settings`) y opcionales;
   si están desactivados, no se generan.
7. El `descuento` no puede exceder el `monto` del cargo.
8. El monto de un pago debe ser `> 0` y no exceder el saldo pendiente del cargo.
9. La generación masiva (`charges/generate`) es **idempotente** con
   `Idempotency-Key`: repetir la petición no duplica cargos.
10. El estado de cuenta del alumno suma todos los cargos vigentes y sus pagos.
11. Un cargo cancelado no cuenta para adeudos ni para ingresos.

## 5. API

Módulos bajo `api/src/modules/fees/` (conceptos), `charges/` y `payments/`
(`routes/ · controllers/ · services/ · models/{dto,entity}/`). Listados
server-side con `POST /…/query`.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| POST | `/api/v1/fee-concepts/query` | Listado server-side de conceptos | `charges.view` |
| POST | `/api/v1/fee-concepts` | Crea concepto de pago | `fee_concepts.manage` |
| PATCH | `/api/v1/fee-concepts/:id` | Actualiza concepto | `fee_concepts.manage` |
| DELETE | `/api/v1/fee-concepts/:id` | Baja lógica del concepto | `fee_concepts.manage` |
| POST | `/api/v1/charges/query` | Listado server-side de cargos | `charges.view` |
| POST | `/api/v1/charges` | Crea cargo individual | `charges.create` |
| POST | `/api/v1/charges/generate` | Generación masiva (grupo o ciclo) — `Idempotency-Key` | `charges.generate` |
| DELETE | `/api/v1/charges/:id` | Cancela cargo con motivo | `charges.cancel` |
| GET | `/api/v1/students/:id/account-statement` | Estado de cuenta (`?format=json\|pdf`) | `charges.view` |
| POST | `/api/v1/payments/query` | Listado server-side de pagos | `charges.view` |
| POST | `/api/v1/payments` | Registra pago manual (+`Idempotency-Key`) | `payments.register` |
| DELETE | `/api/v1/payments/:id` | Cancela pago con motivo | `payments.cancel` |

**Generación masiva** `POST /api/v1/charges/generate`:
```jsonc
// Request  (Idempotency-Key: charge-gen-2026-01-0001)
{ "conceptId": "…", "termId": "…", "scope": "group", "groupId": "…",
  "fechaVencimiento": "2026-02-10", "descuento": 0 }
// 201 → { "created": 42, "skipped": 0, "charges": [ { "id": "…" } ] }
```
Reusar la clave con otro usuario → 409 `IDEMPOTENCY_KEY_REUSED`.

**Registro de pago** `POST /api/v1/payments`:
```jsonc
// Request
{ "chargeId": "…", "monto": 1500.00, "fecha": "2026-01-15",
  "metodo": "EFECTIVO", "referencia": null }
// 201 → { "id": "…", "reciboFolio": "REC-2026-000123", "chargeStatus": "PARCIAL" }
```

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `feeConceptApi` / `chargeApi` / `paymentApi` | `entities/fee-concept`, `entities/charge`, `entities/payment` | API + tipos |
| Gestión de conceptos | `features/fees/manage-fee-concept` | CRUD con `ITFormBuilder` |
| Generación de cargos | `features/charges/generate-charges` | Masiva por grupo/ciclo |
| Registro de pago | `features/payments/register-payment` | `ITDialog` + `ITInputNumber` |
| Estado de cuenta | `widgets/account-statement` / `widgets/account-statement-pdf` | Vista y PDF |
| Pantallas | `pages/fee-concepts`, `pages/charges`, `pages/payments` | Listados con `ITDataTable` |

Montos con `ITInputNumber`; fechas con `ITDatePicker`; selección de alumno/cargo
con `ITSearchSelect`; exportación PDF vía `@react-pdf/renderer` y `file-saver`.
i18n con namespaces `fees`, `charges` y `payments`.

## 7. Permisos y alcance

| Permiso | Roles (alcance) |
|---|---|
| `fee_concepts.manage` | ADMIN (ALL), CONTROL_ESCOLAR (ALL) |
| `charges.view` | ADMIN (ALL), CONTROL_ESCOLAR (ALL), ALUMNO (OWN) |
| `charges.create` | ADMIN (ALL), CONTROL_ESCOLAR (ALL) |
| `charges.generate` | ADMIN (ALL), CONTROL_ESCOLAR (ALL) |
| `charges.cancel` | ADMIN (ALL), CONTROL_ESCOLAR (ALL) |
| `payments.register` | ADMIN (ALL), CONTROL_ESCOLAR (ALL) |
| `payments.cancel` | ADMIN (ALL), CONTROL_ESCOLAR (ALL) |

El alumno y su tutor consultan únicamente su estado de cuenta (`OWN`). El
CONTROL_ESCOLAR opera sobre todos los alumnos (`ALL`). El scoping por registro se
aplica en el servicio (`scopeOf`/`withinScope`), nunca en el cliente.

## 8. Validaciones

- `monto`: decimal `> 0` con 2 decimales; `descuento >= 0` y `<= monto`.
- `fechaVencimiento` y `fecha`: fechas válidas (`@db.Date`).
- `metodo` y `tipo`: dentro del enum; `status` no se acepta del cliente.
- `referencia`: texto opcional (máx. 120).
- Pago mayor al saldo → `VALIDATION_ERROR`; cargo no pagable → `CHARGE_ALREADY_PAID`.
- `Idempotency-Key` con formato `^[A-Za-z0-9_-]{8,100}$` (`INVALID_IDEMPOTENCY_KEY`).
- `feeConceptId`/`groupId`/`termId` inexistentes → `INVALID_REFERENCE`.
- Filtro no admitido → 400 `INVALID_FILTER`.

## 9. Bitácora

Escrituras vía `AuditPort` con `previousState`/`newState` (ver
[`bitacora.md`](../../seguridad/bitacora.md)):

| Acción | `entityType` | Notas |
|---|---|---|
| `FEE_CONCEPT_CREATED` / `FEE_CONCEPT_UPDATED` / `FEE_CONCEPT_DEACTIVATED` | `FeeConcept` | Catálogo de conceptos |
| `CHARGE_CREATED` | `Charge` | Alta individual |
| `CHARGE_GENERATED` | `Charge` | Lote: `metadata` con grupo/ciclo y totales |
| `CHARGE_CANCELLED` | `Charge` | Incluye motivo |
| `PAYMENT_REGISTERED` | `Payment` | Folio y método (nunca se borra) |
| `PAYMENT_CANCELLED` | `Payment` | Conserva el pago y registra motivo |

Los pagos **nunca se eliminan**: la cancelación es lógica y queda en bitácora con
estado anterior y nuevo.

## 10. Pruebas (Playwright)

- Unitarias (`api/tests/unit`): `charges.service.spec.ts` (pago parcial → parcial
  → pagado, descuento, cancelación), `payments.service.spec.ts` (folio
  consecutivo, idempotencia, saldo), `fee-concepts.service.spec.ts`.
- Contrato (`api/tests/e2e`): generación masiva idempotente, `CHARGE_ALREADY_PAID`,
  cancelación con motivo y bitácora, estado de cuenta, 403 por alcance.
- Navegador (`web/tests/e2e`): registro de pago y consulta de estado de cuenta.
- Spec(s) del módulo: `api/tests/e2e/m09-colegiaturas-pagos.spec.ts`,
  `web/tests/e2e/m09-colegiaturas-pagos.spec.ts`.
- Una prueba por regla de la sección 4. Solo se corre el spec del cambio.

## 11. Criterios de aceptación

- [x] Migración y modelo Prisma (`fee_concepts`, `charges`, `payments` + enums).
- [x] Módulo API (routes/controller/service/dto/entity) con permisos y bitácora.
- [x] Generación masiva idempotente y folio consecutivo de recibo.
- [x] Pagos parciales, cancelación con motivo y estado de cuenta (JSON/PDF).
- [x] Pantallas web con UI kit (ITPage, ITDataTable, ITFormBuilder, ITDialog, ITInputNumber, ITSearchSelect).
- [x] Specs pasando (solo los del módulo).
- [x] Este README completo.

## 12. Decisiones abiertas

- Estrategia de generación del folio (secuencia de BD por término vs. por día) y
  su reinicio anual.
- ¿Se permite un pago a un cargo cancelado para reactivarlo? ¿O se genera un cargo nuevo?
- Definición exacta del recargo por mora (porcentaje, días de gracia, redondeo).
- ¿El descuento requiere autorización de ADMIN (política ABAC de monto)?
- ¿Se pueden aplicar pagos a nota de crédito a favor del alumno?
- Ver [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Plantilla de módulo](../../plantillas/plantilla-modulo.md).
- [Convenciones generales](../../guia/convenciones.md) y
  [convenciones de API](../../api/convenciones.md) (§4 Idempotencia).
- [Catálogo de errores](../../api/errores.md) (`CHARGE_ALREADY_PAID`,
  `IDEMPOTENCY_KEY_REUSED`, `INVALID_IDEMPOTENCY_KEY`, `VALIDATION_ERROR`, …).
- [Roles y permisos](../../seguridad/roles-permisos.md) · [Bitácora](../../seguridad/bitacora.md).
- [Diccionario de datos — M09](../../modelo-datos/diccionario-datos.md).
- Especificación original del módulo (M09) y roadmap en
  [`../../guia/roadmap.md`](../../guia/roadmap.md).
