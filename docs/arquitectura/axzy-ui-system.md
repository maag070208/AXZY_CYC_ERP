# Axzy UI System

Toda la interfaz del SGE usa la librería de la casa
**`@axzydev/axzy_ui_system`** (React + Tailwind CSS v4), diseñada para
aplicaciones de datos densos, dashboards y sistemas de gestión.

## 1. Integración en la app

### CSS por capas (crítico)
`dist/index.css` es un build de Tailwind independiente. Para que su reset no
pise al de la app y las utilities sigan pudiendo sobreescribir, se importa con
capa propia en `src/app/index.css`:

```css
@layer theme, base, axzy-ui-system, components, utilities;

@import "tailwindcss";
@import "@axzydev/axzy_ui_system/dist/index.css" layer(axzy-ui-system);
@source "../node_modules/@axzydev/axzy_ui_system/src/**/*.{ts,tsx}";
```

### Provider
```tsx
import { ITThemeProvider } from "@axzydev/axzy_ui_system";

<ITThemeProvider showFab={false} density={1}>
  <App />
</ITThemeProvider>
```
- `showFab` por defecto `true`: en producción se pasa `false`.
- Dark mode gobierna la clase `.dark` y se persiste en
  `localStorage["it-theme-dark-mode"]`.

## 2. Arquitectura atómica y aislamiento

Capas unidireccionales: `atoms < molecules < organisms < templates`. Garantías:
clases `it-*`, selectores `:where(.it-*)`, tokens `--it-*`, y checks automáticos
(`check:atomic`, `check:css`). Anidar componentes no produce interferencia.

## 3. Componentes clave

| Categoría | Componentes |
|---|---|
| Átomos | `ITButton`, `ITInput`, `ITInputNumber`, `ITText`, `ITGrid`, `ITFlex`, `ITStack`, `ITAvatar`, `ITBadget`, `ITChip`, `ITProgress`, `ITSegmentedControl` |
| Moléculas | `ITCard`, `ITStatCard`, `ITDatePicker`, `ITSelect`, `ITSearchSelect`, `ITMultiSelect`, `ITMaskedInput`, `ITField`, `ITStepper`, `ITTabs`, `ITDropdownMenu`, `ITEmptyState`, `ITAlert` |
| Organismos | `ITDataTable`, `ITTable`, `ITFormBuilder`, `ITSearchTable`, `ITDialog`, `ITConfirmDialog`, `ITDrawer`, `ITToast`, `ITDropfile`, `ITSidebar`, `ITTopbar` |
| Plantillas | `ITLayout`, `ITPage` (+ `ITPageHeader`) |
| Tema | `ITThemeProvider`, `useITTheme` |

Los más usados en el SGE: **`ITDataTable`** (listados), **`ITFormBuilder`**
(formularios), **`ITPage`/`ITLayout`** (chasis), **`ITDatePicker`**,
**`ITSearchSelect`**, **`ITInputNumber`** (montos), **`ITDialog`**,
**`ITStatCard`**.

## 4. ITDataTable (contrato server-side)

```ts
interface ITDataTableFetchParams {
  page: number;            // 1-indexado
  limit: number;
  filters: ColumnFilters;
  sort?: { key: string; direction: "asc" | "desc" };
}
interface ITDataTableResponse<T> { data: T[]; total: number; }
```
Props: `fetchData`, `columns`, `layout`, `density`, `defaultItemsPerPage`,
`itemsPerPageOptions`, `reloadTrigger` (re-fetch tras mutación), `externalFilters`,
`pinned`, `virtualized`, `onRowClick`, `renderCard`.

**Columnas** (`Column<T>`): `key`, `label`, `type`
(`string|date|number|boolean|actions|catalog`), `render`, `actions`, `sortable`,
`filter` (`true | "catalog" | "search" | "date" | "date-range"`), `width`,
`align`, `truncate`, `pinned` (`"left"|"right"`).

Regla de la casa (PTNV): **toda columna con datos lleva su filtro y su orden**
(las de acciones no). El contrato de tabla de la API se documenta en
[`../api/convenciones.md`](../api/convenciones.md).

## 5. ITFormBuilder

Formularios desde JSON (controlado):
```tsx
const config: FieldConfigV2[] = [
  { name: "nombre", label: "Nombre", type: "text", required: true, column: 6 },
  { name: "nivel",  label: "Nivel",  type: "select", column: 6, options: niveles },
  { name: "curp",   label: "CURP",   type: "text", column: 12,
    dependsOn: ["tipo"], renderWhen: (v) => v.tipo === "nacional" },
];
<ITFormBuilder config={config} values={values} handleChange={...} handleBlur={...}
  touched={touched} errors={errors} setFieldValue={...} />
```
Soporta secciones, arreglos, reglas (`renderWhen`, `dynamicProps`), validación
(`Yup.AnySchema`, `asyncValidation`) y campos `custom`.

## 6. Theming

- Tokens públicos `--it-*` (`--it-card-bg`, `--it-sidebar-bg`, `--it-table-*`).
- Override runtime por la prop `theme` (`primary`, `secondary`, `layout`, `table`)
  o con `useITTheme().updateColor(...)`.
- Override por CSS en cualquier contenedor:
  ```css
  .zona { --it-card-bg: #eef2ff; }
  ```
- No hardcodear colores; usar tokens y las clases estándar (`text-slate-800`,
  `bg-white`, `border-gray-100`) que el dark mode ya cubre.

## 7. Patrón de página del proyecto

```tsx
<ITLayout topBar={topBar} sidebar={sidebar}>
  <ITPage
    title="Alumnos"
    description="Gestión de expedientes"
    breadcrumbs={[{ label: "Inicio", href: "/" }, { label: "Alumnos" }]}
    actions={<ITButton label="Nuevo" onClick={...} />}
    loading={isLoading} error={error} onRetry={refetch}
  >
    <ITDataTable columns={columns} fetchData={fetch} layout="fixed" density="compact" />
  </ITPage>
</ITLayout>
```
La casa define además `PanelCard` (`@shared/ui/panel-card`) para secciones y
`KpiTile` (`@shared/ui/kpi-tile`) para indicadores.

## 8. Gotchas

- El CSS del kit entra **sin capa** en algunos proyectos: para sobreescribir sus
  utilidades se usa el `!` de Tailwind (`!p-5`, `md:!grid-cols-4`).
- Tailwind v4 no ve clases construidas en runtime; las dinámicas del kit ya están
  en su safelist.
- `ITDataTable` **no** trae exportación integrada: el botón «Exportar» se pone en
  las acciones de `ITPage` y reutiliza los filtros vigentes.
- No usar ejemplos de API obsoleta de `ITDataTable` (`data`/`page`/`onPageChange`);
  la prop real es `fetchData`.

Referencia completa: documentación del Axzy UI System
(`LLM_DOCS.md`, `DOCUMENTACION_DETALLADA_COMPONENTES.txt`) y sandbox del kit.
