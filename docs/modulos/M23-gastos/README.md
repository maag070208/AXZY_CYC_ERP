# M23 — Gastos institucionales

**Objetivo.** Registrar los **egresos** de la institución para poder comparar
ingresos contra gastos en el tablero de Inicio, sin inventar cifras.

**Estado: terminado (2026-10-09).** Código en
`api/src/modules/expenses` (`services/ · controllers/ · routes/ · models/dto/`),
modelo `Expense` en `api/prisma/schema.prisma` (migración
`20261009110000_m23_expenses`) y web en
`web/src/{entities/expenses,features/expenses,pages/expenses}`; pantalla
`/expenses` (menú «Gastos», `expenses.view`). Ver
[D-054](../../../DECISIONES.md).

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST | `/api/v1/expenses/query` | `expenses.view` | Tabla server-side (fecha, concepto, proveedor, tipo, monto, vencimiento, estatus); filtra también por `termId` |
| GET | `/api/v1/expenses/summary?termId` | `expenses.view` | Totales del ciclo (o de todos) por tipo y por mes |
| GET | `/api/v1/expenses/{id}` | `expenses.view` | Detalle |
| POST | `/api/v1/expenses` | `expenses.manage` | Alta. `dueDate` no puede ser anterior a `date` (`DUE_DATE_BEFORE_DATE`) |
| PATCH | `/api/v1/expenses/{id}` | `expenses.manage` | Edición parcial; un gasto cancelado no admite cambios (`EXPENSE_CANCELLED`) |
| DELETE | `/api/v1/expenses/{id}` | `expenses.manage` | **Cancelación lógica** con motivo (≥ 3 caracteres); la fila nunca se borra |

## Reglas

- **Catálogo de tipos** (`ExpenseType`): `SERVICES`, `SUPPLIES`, `PAYROLL`,
  `MAINTENANCE`, `TAXES`, `EQUIPMENT`, `OTHER`. Estatus: `PENDING`, `PAID`,
  `CANCELLED`.
- **Los cancelados no cuentan** en totales, series ni tablero.
- **`termId` es opcional.** Los totales del tablero suman los gastos del ciclo
  **y los que no tienen ciclo**, para que un gasto sin asignar no desaparezca.
- **Mora del gasto** (`overdue`): compromiso `PENDING` con `dueDate` anterior a
  hoy (día de la institución, `America/Mexico_City`).
- **Alcance:** `expenses.view` solo admite `NONE`/`ALL`. Hoy únicamente `ADMIN`
  lo tiene (igual que el resto de montos, D-034); el profesor nunca ve dinero.
- **Reglas puras reutilizables:** `models/entity/expense-rules.ts` concentra la
  mora (`isExpenseOverdue`), el vencimiento válido (`isDueDateValid`) y los
  agrupados por tipo y por mes; el servicio solo orquesta y etiqueta.
- **El vencimiento contra la fecha se valida en el servicio**, no en el DTO: el
  alta y la edición responden el mismo `DUE_DATE_BEFORE_DATE` (un `ZodError`
  siempre sale como `VALIDATION_ERROR`).
- **Bitácora:** `EXPENSE_CREATED`, `EXPENSE_UPDATED` y `EXPENSE_CANCELLED`
  (con el motivo en `metadata`), dentro de la misma transacción.
- **Sin borrado físico y sin abonos parciales:** un gasto es pagado o no lo es;
  si se requiere el detalle de pagos parciales, es un cambio de alcance.

## Dónde se usa

`GET /dashboard/executive` (tablero de Inicio) arma con estos datos
`incomeVsExpenses`, `expenses` (total, pagado, pendiente y desglose por tipo) y
el indicador `expenses` comparado con el ciclo anterior.

Pruebas: `api/tests/unit/expenses.spec.ts` (reglas puras de
`models/entity/expense-rules.ts` + DTOs), `api/tests/e2e/m23-gastos.spec.ts`
(contrato: alta, mora, edición, filtros, resumen, cancelación, permisos y su
aporte al tablero) y `web/tests/e2e/m23-gastos.spec.ts` (pantalla `/expenses`:
totales, tabla, alta desde el diálogo, cancelación con motivo y alcance del
profesor).
