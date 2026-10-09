# M10 — Reportes y tablero básico

| Campo | Valor |
|---|---|
| **Código** | M10 |
| **Versión** | 0.1 |
| **Estado** | Terminado (F4) |
| **Fase** | Finanzas y administración |
| **Depende de** | M03 (alumnos), M05 (bajas), M07 (grupos e inscripciones), M08 (calificaciones), M09 (cargos y pagos), M11 (parámetros y datos de la escuela) |
| **Habilita a** | M13 (capacitación), M21 (reportes ejecutivos) |
| **Permisos** | `reports.view`, `reports.export` (con alcance) |

## Implementación (F4, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/reports` y `web/src/{entities/report,widgets/dashboard}`; página `/reports` y tablero en Inicio para quien tiene `reports.view`.

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| GET | `/api/v1/reports` | `reports.view` | Catálogo según el alcance (sin reportes de montos para AREA) |
| GET | `/api/v1/reports/:type?format=json\|xlsx\|pdf&termId&groupId&from&to&status` | `reports.view` (+ `reports.export` para archivos) | Exportación auditada `REPORT_EXPORTED` |
| GET | `/api/v1/dashboard` | `reports.view` | KPIs en vivo; montos solo con alcance ALL |

Tipos: `students-active`, `students-inactive`, `enrollments-by-group`, `grades-by-group`, `payments-period`, `debts`. **`attendance-list` no está disponible** hasta M18 (responde `404 REPORT_NOT_FOUND`).

Decisiones (sección 12):
- Los reportes por ciclo usan el **ciclo activo** por defecto; `payments-period` usa el **mes en curso** si no hay rango y `debts` todos los ciclos salvo filtro.
- **XLSX y PDF se generan en la API** (xlsx + pdfkit) con exactamente los mismos datos del JSON, para que la exportación quede auditada y no dependa del navegador.
- Los reportes con **montos** (`payments-period`, `debts`) exigen alcance `ALL` (`403 REPORT_REQUIRES_FULL_SCOPE`): el profesor no ve dinero; su tablero muestra alumnos y ocupación de sus grupos.
- KPIs **en vivo** (sin caché); `REPORT_VIEWED` no se registra (solo exportaciones). Ver [D-034](../../../DECISIONES.md) y [D-035](../../../DECISIONES.md).
- Gráficas sin librería (`shared/ui/charts`: barras y avance en HTML/CSS).

## 1. Objetivo

Ofrecer a control escolar y dirección un conjunto de reportes operativos y un
tablero resumido del ciclo, con cifras de alumnos, ocupación, calificaciones,
ingresos y adeudos, respetando siempre el alcance del rol que consulta.

## 2. Alcance

**Incluye**
- Reportes operativos: alumnos activos/baja, inscripciones por grupo, lista de
  asistencia, calificaciones por grupo, pagos del periodo y adeudos.
- Tablero con indicadores: total de alumnos activos, ocupación de grupos, ingresos
  del mes y adeudos totales.
- Exportación de cada reporte a `json`, `xlsx` y `pdf`.
- Filtros por ciclo (`term`), grupo, rango de fechas y estatus, aplicados server-side.

**No incluye (en este módulo)**
- Reportes analíticos/ejecutivos avanzados y comparativos multi-ciclo: M21.
- Generación de documentos oficiales (boletas, certificados): M06/M21.
- Edición de datos: M10 es de **solo lectura** sobre otros módulos.
- Envío de reportes por correo/notificación: M19.

## 3. Modelo de datos (Prisma)

**No aplica:** M10 no persiste modelos de negocio propios; **agrega y proyecta**
datos de otros módulos. No se crea migración de tablas en este módulo.

Las fuentes de datos son:

| Reporte / KPI | Origen |
|---|---|
| Alumnos activos / baja | `students.status` (M03) + `student_movements` (M05) |
| Inscripciones por grupo | `enrollments` + `groups` (M07) |
| Lista de asistencia | `attendance_sessions` + `attendance` (M18) |
| Calificaciones por grupo | `grades` + `assessments` + `enrollments` (M08) |
| Pagos del periodo | `payments` (M09) |
| Adeudos | `charges` con saldo > 0 (M09) |
| Ocupación de grupos | `groups.capacity` vs. inscripciones vigentes (M07) |
| Ingresos del mes | suma de `payments` vigentes del mes (M09) |

Los datos se leen con consultas de agregación (`groupBy`, `_sum`, `_count`) y
`Decimal` para montos, sin materializar vistas en base de datos.

## 4. Reglas de negocio

1. Cada reporte y KPI **respeta el rol y el alcance** del usuario que consulta.
2. El **profesor solo ve sus grupos** (alcance `AREA`): reportes de asistencia y
   calificaciones limitados a `groups.teacher_id = usuario`.
3. El **alumno** no accede a reportes institucionales (alcance `NONE`); sus datos
   propios se ven por M05/M06/M08/M09 (`OWN`).
4. Todo reporte se filtra por **ciclo activo** por defecto si no se especifica.
5. Los montos se agregan como `Decimal` y se serializan como número decimal.
6. Las fechas de los reportes del periodo usan rango local `America/Mexico_City`
   y se resuelven server-side.
7. `?format=xlsx|pdf` aplica **exactamente los mismos filtros** que la consulta
   JSON vigente (sin divergencia de criterio).
8. Los reportes de adeudos excluyen cargos `CANCELLED` y pagos cancelados.
9. Un `:type` de reporte desconocido responde `NOT_FOUND` (404).
10. La exportación requiere además el permiso `reports.export`.

## 5. API

Módulo bajo `api/src/modules/reports/`
(`routes/ · controllers/ · services/ · models/{dto,entity}/`).

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/reports/:type` | Ejecuta un reporte con filtros y `?format=json\|xlsx\|pdf` | `reports.view` (exportar: `reports.export`) |
| GET | `/api/v1/dashboard` | KPIs del tablero (alumnos activos, ocupación, ingresos del mes, adeudos) | `reports.view` |

`:type` ∈ `students-active` · `students-inactive` · `enrollments-by-group` ·
`attendance-list` · `grades-by-group` · `payments-period` · `debts`.

**Reporte** `GET /api/v1/reports/grades-by-group?termId=…&groupId=…&format=json`:
```jsonc
// 200
{
  "report": "grades-by-group",
  "generatedAt": "2026-02-01T15:04:05.000Z",
  "filters": { "termId": "…", "groupId": "…" },
  "columns": [ { "key": "studentNumber", "label": "Matrícula" }, { "key": "final", "label": "Final" } ],
  "rows": [ { "studentNumber": "2026-0001", "name": "…", "final": 85.5, "status": "PASSED" } ],
  "totals": { "rows": 42 }
}
```

**Tablero** `GET /api/v1/dashboard`:
```jsonc
// 200
{
  "activeStudents": 512,
  "groupOccupancy": { "average": 0.86, "groups": [ { "groupId": "…", "ratio": 0.95 } ] },
  "monthIncome": 184500.00,
  "totalDebt": 32750.50
}
```

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `reportApi` | `entities/report` | API de reportes y tablero |
| `dashboard` | `widgets/dashboard` | KPIs + gráficas |
| Filtros de reporte | `features/reports/filter-report` | Filtros compartidos (ciclo, grupo, fechas) |
| Exportar | `features/reports/export-report` | `xlsx`/`pdf` con filtros vigentes |
| Pantallas | `pages/reports` y `pages/dashboard` | Reportes y tablero |

Tablero con `KpiTile` (`@shared/ui/kpi-tile`) para los indicadores y
`shared/ui/charts` para las gráficas (ocupación, ingresos por mes, adeudos).
Listados con `ITPage` + `ITDataTable`; el botón «Exportar» se coloca en las
acciones de `ITPage` y reutiliza los filtros vigentes. Secciones con `PanelCard`.
i18n con namespace `reports` (y `dashboard`).

## 7. Permisos y alcance

| Permiso | Roles (alcance) |
|---|---|
| `reports.view` | ADMIN (ALL), CONTROL_ESCOLAR (ALL), PROFESOR (AREA) |
| `reports.export` | ADMIN (ALL), CONTROL_ESCOLAR (ALL), PROFESOR (AREA) |

El scoping `AREA` del profesor restringe todos los reportes a sus grupos; se
aplica en la consulta (`AND`) para que ningún filtro lo amplíe. El alumno tiene
`NONE` sobre `reports`. Ver [`roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

- `:type` debe pertenecer al catálogo de reportes (`NOT_FOUND` si no existe).
- `format` ∈ `json|xlsx|pdf` (`VALIDATION_ERROR`); por defecto `json`.
- `termId`, `groupId`, `status`: valores válidos; referencias inexistentes →
  `INVALID_REFERENCE`.
- Rango de fechas invertido → 400 `INVALID_RANGE`; filtro no admitido →
  `INVALID_FILTER`.
- Exportar sin `reports.export` → 403 `INSUFFICIENT_PERMISSIONS`.
- Tamaños de página consisten con el contrato de tablas (tope 200) cuando aplica.

## 9. Bitácora

M10 es de solo lectura: **no** registra altas ni ediciones de negocio. Se
registran las **exportaciones** para trazabilidad de datos sensibles:

| Acción | `entityType` | Notas |
|---|---|---|
| `REPORT_EXPORTED` | `Report` | `metadata`: tipo, filtros, formato y total de filas |
| `REPORT_VIEWED` | `Report` | Opcional, en reportes con datos personales |

Los accesos denegados a reportes se registran como `ACCESS_DENIED` (fire-and-forget)
por el middleware de permisos. No se persiste el contenido del reporte.

## 10. Pruebas (Playwright)

- Unitarias (`api/tests/unit`): `reports.service.spec.ts` (cada tipo de reporte,
  agregación de montos `Decimal`, exclusión de cancelados) y
  `dashboard.service.spec.ts` (KPIs y ocupación).
- Contrato (`api/tests/e2e`): `?format=json|xlsx|pdf`, respeto de alcance `AREA`
  para profesor, `NOT_FOUND` para tipo desconocido, `INVALID_RANGE`,
  `REPORT_EXPORTED` en bitácora.
- Navegador (`web/tests/e2e`): tablero con KPIs/gráficas y exportación de un reporte.
- Spec(s) del módulo: `api/tests/e2e/m10-reportes-tablero.spec.ts`,
  `web/tests/e2e/m10-reportes-tablero.spec.ts`.
- Una prueba por regla de la sección 4. Solo se corre el spec del cambio.

## 11. Criterios de aceptación

- [x] Endpoints de reportes y tablero con permisos y alcance (sin migración propia).
- [x] Módulo API (routes/controller/service/dto/entity) con bitácora de exportación.
- [x] KPIs y gráficas con `KpiTile` y `shared/ui/charts`.
- [x] Exportación `xlsx`/`pdf` con los filtros vigentes.
- [x] Pantallas web con UI kit (ITPage, ITDataTable, PanelCard).
- [x] Specs pasando (solo los del módulo).
- [x] Este README completo.

## 12. Decisiones abiertas

- ¿Se permiten reportes sin filtro de ciclo (histórico) o se fuerza el ciclo activo?
- ¿La lista de asistencia corresponde a una sesión (`attendance_sessions`) o a un
  grupo completo con resumen de faltas?
- ¿Los `xlsx`/`pdf` se generan en API o en web con `@react-pdf/renderer`?
- ¿Se cachean los KPIs del tablero o se calculan en vivo?
- ¿`REPORT_VIEWED` se registra en todos los reportes o solo en los que exponen
  datos personales (apellidos, montos)?
- Ver [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Plantilla de módulo](../../plantillas/plantilla-modulo.md).
- [Convenciones generales](../../guia/convenciones.md) y
  [convenciones de API](../../api/convenciones.md).
- [Catálogo de errores](../../api/errores.md) (`RECORD_NOT_FOUND`,
  `INVALID_RANGE`, `INVALID_FILTER`, `INSUFFICIENT_PERMISSIONS`, …).
- [Roles y permisos](../../seguridad/roles-permisos.md) · [Bitácora](../../seguridad/bitacora.md).
- [Diccionario de datos](../../modelo-datos/diccionario-datos.md) (M03, M05, M07, M08, M09, M18).
- Axzy UI System: [`../../arquitectura/axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).
- Especificación original del módulo (M10) y roadmap en
  [`../../guia/roadmap.md`](../../guia/roadmap.md).
