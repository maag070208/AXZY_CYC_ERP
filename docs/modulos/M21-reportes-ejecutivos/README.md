# M21 — Reportes y tablero ejecutivo avanzado

| Campo | Valor |
|---|---|
| **Código** | M21 |
| **Versión** | 0.1 |
| **Estado** | Planeado |
| **Fase** | Extras |
| **Depende de** | M03 (alumnos), M05 (bajas/reingresos), M07 (grupos/inscripciones), M08 (calificaciones), M09 (cargos/pagos), M10 (reportes básicos y export), M18 (asistencia) |
| **Habilita a** | Dirección y coordinación académica (toma de decisiones), M10 (gráficas avanzadas) |
| **Permisos** | `reports.view`, `reports.export` (alcance `AREA` para profesor) |

## 1. Objetivo

Ofrecer a dirección y coordinación indicadores ejecutivos consolidados
(deserción, morosidad, ingresos vs. proyección, rendimiento por curso/profesor,
ocupación por grupo y tendencia de inscripciones) con filtros por periodo, gráficas
comparativas y exportación a PDF/Excel. Reutiliza el motor de reportes de M10 y
añade la capa analítica.

## 2. Alcance

**Incluye**
- Indicadores: **tasa de deserción**, **morosidad** (% y monto), **ingresos vs.
  proyección**, **rendimiento promedio por curso y profesor**, **ocupación por
  grupo** y **tendencia de inscripciones**.
- Filtros por ciclo, nivel, curso y grupo.
- Gráficas comparativas **entre periodos** (ciclo actual vs. anterior).
- Exportación a **PDF y Excel** reutilizando el motor de M10.
- Consultas optimizadas con **índices** o **vistas materializadas**.
- Tablero con KPIs y gráficas en la web.

**No incluye (en este módulo)**
- Reportes operativos básicos y sus plantillas (viven en M10).
- Edición de datos subyacentes: M21 es **solo lectura/analítica**.
- Cuadros de mando configurables por el usuario final (constructor *ad hoc*).
- Cálculo de la *proyección* financiera como proceso de negocio (se parametriza en
  M11 `settings` y se consume aquí).

## 3. Modelo de datos (Prisma)

**No aplica: M21 no define entidades de negocio propias.** Todos los indicadores se
calculan en **tiempo de consulta** sobre las tablas existentes (M03, M07, M08, M09,
M18). Para optimizar se agregan, vía migración SQL, **índices de apoyo** y
**vistas materializadas** de solo lectura.

```prisma
// No hay modelos nuevos. Ejemplo de índices de apoyo (Prisma @@index no cubre
// índices parciales ni vistas; se agregan en migración SQL):
//   CREATE INDEX idx_charges_status_venc ON charges (status, fecha_vencimiento);
//   CREATE INDEX idx_enrollments_group_status ON enrollments (group_id, status);
//   CREATE MATERIALIZED VIEW mv_morosidad AS …
//   CREATE MATERIALIZED VIEW mv_rendimiento_curso AS …
//   CREATE MATERIALIZED VIEW mv_ocupacion_grupo AS …
```

**Índices:** `charges(status, fecha_vencimiento)`,
`enrollments(group_id, status)`, `grades(assessment_id)`,
`student_movements(tipo, fecha)` para los agregados de M21.
**Relaciones:** no aplica (sin FKs nuevas). Las vistas materializadas tienen
**refresh** programado (ver §12) y se leen con permiso de solo lectura.

## 4. Reglas de negocio

1. **Indicadores definidos:** tasa de deserción (bajas del periodo ÷ matrícula
   inicial), morosidad (% de cargos vencidos y monto pendiente), ingresos vs.
   proyección, rendimiento promedio por curso y por profesor, ocupación por grupo
   (inscritos ÷ cupo) y tendencia de inscripciones por periodo.
2. **Filtros combinables:** ciclo, nivel, curso y grupo; los filtros se aplican de
   forma consistente a todos los indicadores del tablero.
3. **Comparativas entre periodos:** cada indicador admite comparación con el ciclo
   anterior (variación absoluta y relativa).
4. **Solo lectura:** ningún endpoint de M21 modifica datos; no genera bitácora de
   negocio, solo de acceso/exportación.
5. **Exportación reutiliza M10:** `?format=pdf|xlsx` delega en el motor de M10
   (mismas plantillas, membrete y utilidades), respetando los filtros vigentes.
6. **Consultas optimizadas:** los indicadores que escanean grandes volúmenes se
   sirven desde **vistas materializadas** o con **índices** dedicados; el tablero
   nunca dispara *full scans* sobre `grades`, `payments` o `enrollments`.
7. **Alcance `AREA` para profesor:** un `PROFESOR` solo ve indicadores de sus
   grupos/curso (`AREA`); CONTROL_ESCOLAR y ADMIN ven el consolidado (`ALL`).
8. **Filas del tablero = indicadores:** cada KPI del tablero se alimenta de un
   endpoint de reporte; el fallo de un indicador no derriba el resto del tablero.
9. **Consistencia de montos:** dinero en `Decimal` (nunca flotante); porcentajes
   calculados sobre los mismos totales usados en la exportación.
10. **Caché de vistas:** el refresco de vistas materializadas es explícito
    (programado o bajo demanda con `reports.export`); el usuario ve la marca de
    actualización.

## 5. API

Módulo bajo `api/src/modules/reports/` (reutiliza servicios de M10)
(`routes/ · controllers/ · services/ · models/{dto,entity}/`).

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/reports/:tipo` | Indicador/reporte con filtros y `?format=json\|xlsx\|pdf` | `reports.view` (export: `reports.export`) |
| POST | `/api/v1/reports/:tipo/query` | Variante de tabla/consulta server-side | `reports.view` |
| GET | `/api/v1/reports/dashboard` | Consolidado de KPIs del tablero | `reports.view` |

Tipos (`:tipo`): `desercion`, `morosidad`, `ingresos-vs-proyeccion`,
`rendimiento-curso`, `rendimiento-profesor`, `ocupacion-grupo`,
`tendencia-inscripciones`.

**`GET /api/v1/reports/morosidad`**:

```jsonc
// GET /reports/morosidad?ciclo=2025-2026&nivel=Secundaria&grupo=…&format=json
// Response 200
{
  "tipo": "morosidad",
  "filtros": { "ciclo": "2025-2026", "nivel": "Secundaria", "curso": null, "grupo": null },
  "comparativo": { "periodo": "2024-2025", "variacionPct": -3.2 },
  "resumen": { "porcentaje": 18.4, "montoPendiente": 254300.00, "cargosVencidos": 132 },
  "detalle": [ { "grupo": "A", "porcentaje": 12.0, "monto": 40200.00 } ],
  "actualizadoEn": "2026-10-08T15:00:00Z"
}
```

Con `?format=xlsx` o `?format=pdf` responde el binario (`Content-Disposition`) con
el mismo contenido, generado por el motor de M10.

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `report` | `entities/report` | API + tipos + hooks de indicadores |
| `reports/filters` | `features/reports/filters` | Filtros por ciclo/nivel/curso/grupo |
| `reports/export` | `features/reports/export` | Exportación PDF/Excel |
| Tablero | `pages/reports/dashboard` | KPIs + gráficas comparativas |
| Detalle | `pages/reports/:tipo` | Indicador con tabla y reporte |
| Charts | `shared/ui/charts` | Gráficas reutilizables |

El tablero usa `ITPage` + `KpiTile` para cada indicador y las gráficas de
`shared/ui/charts`; el detalle usa `ITDataTable` para el desglose. La generación de
PDF se apoya en `widgets/*-pdf` con `@react-pdf/renderer` y descarga con
`file-saver` (mismo patrón que M10). i18n con namespace **`reports`**.

## 7. Permisos y alcance

- `reports.view` — consultar indicadores. ADMIN/CONTROL_ESCOLAR `ALL`; PROFESOR
  `AREA` (solo sus grupos/curso).
- `reports.export` — exportar a PDF/Excel. ADMIN/CONTROL_ESCOLAR `ALL`; PROFESOR
  `AREA`.
- El scoping `AREA` se aplica **en la consulta** (`AND`), nunca en el cliente; un
  profesor no puede ampliar su alcance con filtros. Fail-closed por
  [`roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

Zod en `models/dto`:

- `:tipo` ∈ catálogo de reportes (`INVALID_FORMAT`).
- `format` ∈ `{json, xlsx, pdf}` (`INVALID_FORMAT`); defecto `json`.
- `ciclo`, `nivel`, `curso`, `grupo` del catálogo (M11); valor no admitido →
  `INVALID_FILTER`; rango de fechas invertido → `INVALID_RANGE`.
- Paginación de desglose: `page`, `limit` (tope 200); filtros inválidos →
  `INVALID_FILTER`.
- No hay validaciones de escritura (módulo de solo lectura).

## 9. Bitácora

Acciones registradas vía `AuditPort` (solo lectura y accesos):

- `REPORT_GENERATED` (tipo, filtros, formato) — también para exportaciones.
- `REPORT_EXPORTED` (tipo, filtros, formato, alcance).
- `ACCESS_DENIED` en cada 403 de `requiresPermission`.

No se registran datos de negocio porque el módulo no muta estado. El refresco de
vistas materializadas bajo demanda se registra como `REPORT_VIEW_REFRESHED`. Ver
[`bitacora.md`](../../seguridad/bitacora.md).

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): fórmulas de cada indicador (deserción,
  morosidad, ocupación, rendimiento, tendencia) con casos límite (división por
  cero, periodos vacíos); comparativa entre periodos; aplicación de alcance `AREA`.
- **Contrato** (`api/tests/e2e`): `GET /reports/:tipo` respeta filtros y devuelve
  el contrato; `?format=xlsx|pdf` produce binarios no vacíos; tipo/filtro inválido
  → 400; permisos 401/403; scope `AREA` del profesor devuelve solo sus grupos;
  `REPORT_EXPORTED` en bitácora.
- **Navegador** (`web/tests/e2e`): tablero carga KPIs y gráficas, aplica filtros y
  exporta PDF/Excel.
- **Spec(s) del módulo:** `api/tests/e2e/reports-exec.spec.ts`,
  `web/tests/e2e/reports-exec.spec.ts` (una prueba por regla numerada de §4).

## 11. Criterios de aceptación

- [ ] Migración con índices de apoyo y vistas materializadas.
- [ ] Módulo API (routes/controller/service/dto/entity) de solo lectura, con
      permisos, alcance `AREA` y bitácora de acceso/exportación.
- [ ] Indicadores de §4.1 calculados y comparables entre periodos.
- [ ] Exportación PDF/Excel reutilizando el motor de M10.
- [ ] Pantallas web (tablero + detalle) con `KpiTile` y `shared/ui/charts`.
- [ ] Specs pasando (solo los del módulo).
- [ ] Este README completo.

## 12. Decisiones abiertas

- Conjunto final de indicadores y sus fórmulas exactas (validar con dirección).
- Estrategia de refresco de vistas materializadas (programado vs. bajo demanda) y
  ventana de baja actividad.
- Fuente y método de la **proyección de ingresos** (M11 vs. captura anual).
- ¿Se requiere caché de resultados con marca de frescura en el tablero?
- Alcance del profesor: ¿por grupo, por curso o ambos?
- Enlazar en [`DECISIONES.md`](../../../DECISIONES.md) al cerrarse.

## 13. Referencias

- Plantilla: [`plantilla-modulo.md`](../../plantillas/plantilla-modulo.md).
- Reutiliza: [`M10`](../M10-reportes-tablero/README.md) (reportes básicos y export).
- Convenciones: [`convenciones.md`](../../guia/convenciones.md),
  [`api/convenciones.md`](../../api/convenciones.md).
- Arquitectura: [`api-modular.md`](../../arquitectura/api-modular.md),
  [`web-fsd.md`](../../arquitectura/web-fsd.md),
  [`axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).
- Errores: [`errores.md`](../../api/errores.md).
- Seguridad: [`roles-permisos.md`](../../seguridad/roles-permisos.md),
  [`bitacora.md`](../../seguridad/bitacora.md).
- Pruebas: [`estrategia-pruebas.md`](../../pruebas/estrategia-pruebas.md).
- Datos: [`diccionario-datos.md`](../../modelo-datos/diccionario-datos.md).
- Módulos fuente: [`M03`](../M03-alumnos/README.md),
  [`M07`](../M07-cursos-grupos-inscripciones/README.md),
  [`M08`](../M08-examenes-calificaciones/README.md),
  [`M09`](../M09-colegiaturas-pagos/README.md).
