# AXZY UI System — paquete de contexto para IA

> Pegá este archivo entero en el chat (o súbelo como conocimiento del proyecto). Contiene todo lo
> necesario para que un modelo escriba código correcto con `@axzydev/axzy_ui_system`: instalación real,
> reglas, accesibilidad, trampas, ejemplos de producción y el catálogo de componentes.
>
> Librería: `@axzydev/axzy_ui_system` · versión de referencia: `1.5.1` ·
> 61 componentes. Generado el 2026-10-15.
>
> Estructura: **Parte 1** guía de uso · **Parte 2** ejemplos reales · **Parte 3** catálogo de componentes.
> Las rutas que se citan dentro (`docs/…`, `LLM_DOCS.md`) son del repo de la librería: este paquete ya
> incluye lo esencial, así que no las necesitas para escribir código.

---

> **Versión corta**: misma guía y ejemplos, catálogo sin descripciones de props. Ideal para contextos
> pequeños; si necesitas el detalle de un prop, usa `catalogo.md` del paquete completo.

---

## Parte 1 — Guía de uso

> **Cómo usar este documento.** Es el contexto que le pasas a un modelo para que genere código con esta
> librería. Léelo en este orden: §1–§4 (qué es y reglas), §5–§9 (cómo se compone cada tipo de pantalla),
> §10–§12 (theming, i18n y accesibilidad), **§13 trampas conocidas** (evita los errores más caros) y §14
> recetas. Para la lista completa de props de un componente, usa `docs/llm/catalogo.md` (generado desde el
> código) o `docs/<capa>/<componente>.md`. Para el detalle del theming, `LLM_DOCS.md`.

| Documento | Para qué |
| --- | --- |
| **Este archivo** (`docs/llm/GUIA.md`) | Cómo pensar y escribir código con el sistema |
| `docs/llm/catalogo.md` | **Generado**: 61 componentes con todos sus props, tipos, defaults y ejemplo |
| `docs/llm/catalogo.json` | El mismo catálogo en JSON (para pegarlo en contexto o indexarlo) |
| **`docs/llm/ejemplos-reales.md`** | **Así se usa en producción** (CYC ERP): capas de CSS, provider real, chassis, páginas de listado/formulario/tablero, tabla con API y toasts |
| `LLM_DOCS.md` | Theming a fondo: variables CSS `--it-*`, layout chassis, patrones |
| `docs/<capa>/<componente>.md` | Referencia por componente (props + ejemplos + textos i18n) |
| `DESIGN.md` | Lenguaje visual del sandbox y del portafolio (dev-only) |

---

### 1. Qué es

Librería de componentes **React + TypeScript + Tailwind CSS v4** (`@axzydev/axzy_ui_system`), publicada en
npm. 61 componentes organizados en capas atómicas — la dependencia va **siempre hacia abajo**:

```
atoms  <  molecules  <  organisms  <  templates
```

- **atoms**: `ITButton`, `ITInput`, `ITText`, `ITBadget`, `ITSlideToggle`, `ITStack`, `ITGrid`, …
- **molecules**: `ITTable`, `ITSelect`, `ITDatePicker`, `ITCard`, `ITTabs`, `ITWysiwyg`, …
- **organisms**: `ITDataTable`, `ITDialog`, `ITToast`, `ITSidebar`, `ITFormBuilder`, `ITPageHeader`, …
- **templates**: `ITLayout` (chassis completo), `ITPage` (página con cabecera y estados).

### 2. Puesta en marcha (receta completa)

```css
/* src/index.css — el orden de capas manda por encima del orden de imports */
@layer theme, base, axzy-ui-system, components, utilities;

@import "tailwindcss";
@import "@axzydev/axzy_ui_system/dist/index.css" layer(axzy-ui-system);
/* o el build ya capado del propio paquete: */
/* @import "@axzydev/axzy_ui_system/layered.css"; */
```

```tsx
// src/main.tsx
import { ITThemeProvider } from "@axzydev/axzy_ui_system";
import "@app/index.css";

// Opcional: fija el modo por defecto ANTES de montar (si no, es "system").
if (!localStorage.getItem("it-theme-dark-mode")) localStorage.setItem("it-theme-dark-mode", "light");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ITThemeProvider theme={{ primary: "#3056B8" }} appearance="flat" radius={10} shadow={1} showFab={false}>
      <App />
    </ITThemeProvider>
  </React.StrictMode>
);
```

Claves de esta receta (todas verificadas en producción, ver `ejemplos-reales.md`):

1. **Las capas se declaran explícitamente** y el CSS de la librería entra en `layer(axzy-ui-system)`
   **antes** de `utilities`: así tu Preflight no pisa su reset y tus utilidades sí pueden ajustar la
   librería. Si la capa de la librería queda después de `utilities`, tus ajustes necesitan el sufijo `!`
   de Tailwind v4 (`m-0! px-4!`).
2. **`dist/index.css` va en el CSS, no en `main.tsx`** (si tu app también importa Tailwind, dos
   importaciones compiten).
3. **Dark mode**: el provider usa la clave `it-theme-dark-mode` (`"light" | "dark" | "system"`) y arranca
   en `system`. Escríbela antes de renderizar para fijar otro default.
4. **Tokens**: para ajustar superficies que inyecta el provider, usa un selector que gane —
   `:root[data-it-appearance="flat"] { --it-layout-bg: #f5f6fa; }`.
5. **Config de producción del provider**: `appearance`, `radius`, `density`, `shadow`, `showFab={false}` y
   una paleta propia (incluye los bloques `layout` y `table`).
6. React ≥ 18 como peer. Ninguna otra librería de UI.

### 3. Reglas de oro

1. **Nunca hardcodees colores.** Usa las utilidades del tema: `bg-primary-600`, `text-slate-600`,
   `border-slate-200`… y las variables `var(--it-*)` cuando escribas CSS propio.
2. **Nunca hardcodees textos visibles.** Todo sale de `useITTranslation()` → `t("namespace.key")`.
3. **Un solo acento por vista**, usado como señal (borde, foco, un CTA). Los colores semánticos
   (`danger`, `warning`, `success`, `info`) son para estado, no decoración.
4. **Un componente por capa**: si un atom necesita un molecule, la pieza está mal ubicada.
5. **`className` es la válvula de escape**: los componentes aceptan `className` (y muchos
   `containerClassName`, `labelClassName`, `contentClassName`) para ajustes puntuales.
6. **Los textos siempre vía `ITText`** dentro de componentes de la librería (es el átomo de tipografía).
7. **La accesibilidad no es opcional**: todo control necesita nombre accesible (§12).
8. **Todo lo que el usuario puede tocar tiene estados**: `disabled`, `loading`, `error`, `empty`.
9. **No inventes props**: consulta `docs/llm/catalogo.md`, que se genera desde el código.
10. **Composición antes que configuración**: prefiere `ITStack`/`ITGrid`/`ITFlex` + componentes simples
    antes que un componente gigante con 30 props.

### 4. Convenciones de props

La mayoría de los componentes comparten estos nombres. Si dudas, asume esto:

| Prop | Valores típicos | Nota |
| --- | --- | --- |
| `size` | `"sm" \| "md" \| "lg"` | Escala única del sistema |
| `color` | `"primary" \| "secondary" \| "success" \| "danger" \| "warning" \| "info" \| "purple" \| "gray"` | Clave semántica de la paleta |
| `variant` | Depende del componente (`"filled" \| "outlined" \| "raised" \| "rounded" \| "text" \| …`) | Estilo visual |
| `label` | `string` | Texto del control o su nombre accesible |
| `value` / `onChange` | Controlado | Si acepta `value`, es controlado |
| `initialX` | Estado inicial | Para uso no controlado |
| `className` | `string` | Clases extra del contenedor |
| `disabled`, `loading`, `error` | `boolean` / `string` | Estados |

**Controlado vs no controlado**: `ITSlideToggle` usa `isOn` + `onToggle`; `ITInput`/`ITSelect` usan
`value` + `onChange`; los que tienen `initialState`/`defaultX` funcionan sin estado externo.

### 5. Componer una pantalla

```tsx
import { ITLayout, ITPageHeader, ITStack, ITGrid, ITCard, ITButton } from "@axzydev/axzy_ui_system";

<ITLayout
  topBar={{ logoText: "Mi App", userMenu: { userName: "Ana", userEmail: "ana@x.dev" } }}
  sidebar={{ navigationItems: [{ id: "home", label: "Inicio", icon: <FaHome />, isActive: true }] }}
>
  <ITPageHeader title="Panel" description="Resumen del día" actions={<ITButton>Exportar</ITButton>} />
  <ITStack spacing={5}>
    <ITGrid container spacing={4}>
      <ITGrid item xs={12} lg={6}><ITCard title="Ventas">…</ITCard></ITGrid>
      <ITGrid item xs={12} lg={6}><ITCard title="Tickets">…</ITCard></ITGrid>
    </ITGrid>
  </ITStack>
</ITLayout>
```

- `ITLayout` = chassis (topbar + sidebar + contenido). `ITPage` = página con `title`, `description`,
  `breadcrumbs`, `actions`, `loading`, `error`, `empty`, `maxWidth`, `horizontalPadding`.
- `ITStack` (vertical), `ITFlex` (flex), `ITGrid` (retícula 12 columnas) resuelven el layout.
- **Importante**: `ITLayout`/`ITNavbar` ocupan la altura del viewport (`h-screen`). Para embeberlos en
  otra superficie pasa `className="!h-full"` y dales un contenedor con altura (§13).

### 6. Formularios

```tsx
<ITStack spacing={4}>
  <ITField label="Correo" htmlFor="email" required error={errors.email} helpText="Lo usamos para avisos">
    <ITInput id="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} />
  </ITField>

  <ITSelect
    name="role"
    label="Rol"
    value={role}
    onChange={(e) => setRole(e.target.value)}
    options={[{ label: "Admin", value: "admin" }, { label: "Staff", value: "staff" }]}
  />

  <ITSlideToggle label="Recibir avisos" isOn={newsletter} onToggle={setNewsletter} />
</ITStack>
```

- **`ITField`** agrupa etiqueta, obligatorio, ayuda y error de cualquier control (`error` acepta
  `string | boolean`).
- Cada control tiene su propio `label`; **si lo omites, pasa al menos `ariaLabel`** (o el control queda
  sin nombre accesible).
- Formik + Yup están soportados (son dependencias): usa `ITField` + los tipos de `src/types/yup.types.ts`
  para mapear `errors`/`touched` a la UI.
- `ITFormBuilder` arma formularios declarativos desde un esquema; `ITWysiwyg` para texto enriquecido;
  `ITMaskedInput` para máscaras; `ITChipInput`/`ITMultiSelect` para listas de valores.

### 7. Datos y tablas

| Componente | Cuándo |
| --- | --- |
| `ITTable` | Datos **en memoria**, con paginación, filtros por columna, cards en móvil |
| `ITDataTable` | Datos **del servidor** (`fetchData`), filtros externos, virtualización |
| `ITSearchTable` | Búsqueda + tabla con barra de filtros ya resuelta |
| `ITStatCard`, `ITLineBarChart`, `ITProgress` | Métricas y gráficas |
| `ITBadget`, `ITChip` | Estados y etiquetas dentro de celdas |

- Pasa `columns` (con `key`, `label`, `render`, filtros) y `data`/`fetchData`.
- En móvil, `renderCard` convierte cada fila en tarjeta (si no lo pasas, se usa el layout de tabla).

### 8. Feedback y overlays

- `ITDialog` / `ITDrawer` / `ITConfirmDialog`: overlays con foco y `Esc` gestionados.
- `ITToast`: mensaje efímero autocontenido (`message`, `type`, `duration`, `position`, `onClose`).
  No hay provider: renderiza el `ITToast` donde quieras y despídelo con `onClose`.
- `ITLoader`, `ITSkeleton`, `ITEmptyState`: estados de carga/vacío (obligatorios en listas y tablas).
- `ITAlert`: aviso en línea (no modal) para errores de formulario o avisos de sistema.

### 9. Navegación

`ITTabs`, `ITStepper`, `ITBreadcrumbs`, `ITPagination`, `ITDropdownMenu`, `ITSegmentedControl`,
`ITToggle` (vía `ITSlideToggle`). Para el chrome: `ITSidebar` (riel que se expande al pasar el cursor y
drawer en móvil) + `ITTopBar`; `ITNavbar` es la variante todo-en-uno.

### 10. Theming

```tsx
<ITThemeProvider
  theme={{ primary: "#2563eb", danger: "#dc2626" }}   // se fusiona con la paleta por defecto
  appearance="flat"      // "soft" (por defecto) | "flat"
  radius={10}            // radio global en px para toda la escala rounded-*
  density={0.95}         // 0.5–1.5: comprime tipografía/espaciados basados en rem
  shadow={2}             // 0–3
  showFab={false}        // oculta el diseñador de temas flotante
>
```

- `useITTheme()` → `{ palette, colors, setPalette, updateColor, resetTheme, applyPreset,
  resolvedTheme, darkModeMode, setDarkModeMode, appearance }`.
- **Dark mode es por clase**: el provider pone/quitá `.dark` en `<html>`; tus clases deben ser
  `bg-white dark:bg-slate-900`, y el CSS propio se escribe con `@variant dark (&:is(.dark &))`.
- Los colores del tema viven en variables CSS `--color-*` y los tokens de componentes en `--it-*`
  (lista completa en `LLM_DOCS.md`): **usa esas variables** en CSS propio, nunca hex sueltos.
- El provider genera escalas dinámicas (`--color-primary-50…950`) a partir del color base y las
  recalcula en dark mode.

### 11. i18n

```tsx
const { t, formatNumber, formatCurrency, formatDate, locale } = useITTranslation();
t("common.save");                    // "Guardar"
formatCurrency(1234.5, "EUR");       // "1.234,50 €"
```

- Claves `namespace.key` en `src/i18n/locales/es.ts` y `en.ts` (**paridad obligatoria**).
- Sin `ITI18nProvider` la salida es idéntica al español por defecto.
- **Los props explícitos ganan sobre el catálogo** (si pasas `label`, se usa tu texto).
- Formateo: siempre por el hook (`formatNumber`, `formatCurrency`, `formatDate`, `dateLocale`).

### 12. Accesibilidad (no negociable)

- **Todo control necesita nombre accesible**: `label` en `ITInput`/`ITSelect`/`ITField`;
  `label`/`ariaLabel` en `ITSlideToggle`; `ariaLabel` en botones de solo icono.
- **Nada de interactivos anidados**: nunca un `<button>`/`ITButton` dentro de un `<a>`.
- **Contraste AA**: el acento de la paleta resuelta se queda corto en algunos tonos. Regla práctica:
  relleno con texto blanco → `primary-700`; texto de acento sobre blanco → `primary-700`;
  sobre fondos tintados → `primary-800`; en dark → `primary-500`. `primary-600` solo para texto grande.
- **Foco visible siempre** (`focus-visible:ring-2`), y no lo elimines con `outline-none` sin reemplazo.
- Usa los landmarks una vez: un `<main>` por documento; `header`/`nav`/`aside` con nombre si se repiten.
- Respeta `prefers-reduced-motion` en animaciones propias.

### 13. Trampas conocidas (esto ahorra horas)

1. **El CSS por componente no viaja**: solo se publica `dist/index.css`. Si añades keyframes o CSS
   propios, ponlos en tu hoja con prefijo (`it-`) bajo `@layer components`.
2. **Tailwind no ve clases construidas en runtime**: `grid-cols-${n}` o `col-span-${n}` no existen en el
   bundle. Usa clases literales o un safelist (`@source inline("grid-cols-1 …")`). Aplica igual si
   consumes la librería.
3. **`col-span-full` se emite después de `col-span-N`**: no pongas las dos en el mismo item.
4. **`ITNavbar`/`ITLayout` fuerzan `h-screen`**: para embeberlos, dales un contenedor con altura y
   `className="!h-full"`; si no, se estiran a 100vh.
5. **El provider inyecta overrides `!important` en dark** para utilidades comunes (`.bg-white`,
   `.text-slate-*`). No pelees con él usando hex sueltos: usa las variables `--it-*` / utilidades del tema.
6. **`ITSidebar` colapsado**: el riel se expande al pasar el cursor; en móvil es un drawer. No hay botón
   de colapso.
7. **Iconos**: usa `react-icons` (ya es dependencia) y nunca emojis en la UI.
8. **`ITText`**: úsalo para todo texto dentro de componentes; `muted` aplica `--color-text-muted`.
9. **`ITPage` trae padding y `max-width` propios**: para una página a sangre usa `noPadding` y, si
   necesitas control total, `className="m-0! px-4! max-w-screen!"`.
10. **Capas de CSS**: si tu capa de la librería acaba después de `utilities`, tus utilidades no ganan a
   los estilos de la librería salvo con el sufijo `!` (`m-0!`, `px-4!`). Con el orden recomendado
   (`axzy-ui-system` antes de `utilities`) no hace falta.
11. **El id del diálogo es una clase interna** (`.it-dialog-panel`): para redimensionarlo sin prop, una
   regla propia (fuera de capas) es suficiente con el orden recomendado.
12. **Verifica antes de publicar**: `pnpm lint` (0 errores), `pnpm bundle` y, si tocas el sandbox,
   `pnpm audit:sandbox` (axe con el set completo + recortes de contenido).

### 14. Recetas

**Formulario con estados y validación**

```tsx
const [values, setValues] = useState({ email: "", role: "" });
const [errors, setErrors] = useState<Record<string, string>>({});

<ITStack spacing={4}>
  <ITField label="Correo" htmlFor="email" required error={errors.email}>
    <ITInput id="email" name="email" value={values.email}
      onChange={(e) => setValues({ ...values, email: e.target.value })} />
  </ITField>
  <ITSelect name="role" label="Rol" value={values.role}
    onChange={(e) => setValues({ ...values, role: e.target.value })}
    options={[{ label: "Admin", value: "admin" }]} />
  <ITFlex justify="end" gap={3}>
    <ITButton variant="outlined" color="gray">Cancelar</ITButton>
    <ITButton onClick={submit}>Guardar</ITButton>
  </ITFlex>
</ITStack>
```

**Listado con carga, vacío y error**

```tsx
{loading ? <ITSkeleton lines={5} /> :
 data.length === 0 ? <ITEmptyState title="Sin resultados" description="Ajusta los filtros" action={<ITButton>Crear</ITButton>} /> :
 <ITTable columns={columns} data={data} title="Usuarios" />}
```

**Tabla del servidor**

```tsx
<ITDataTable
  columns={columns}
  fetchData={async ({ page, pageSize, filters }) => {
    const res = await api.list({ page, pageSize, ...filters });
    return { rows: res.items, total: res.total };
  }}
/>
```

**Diálogo de confirmación + toast**

```tsx
<ITConfirmDialog open={open} title="Eliminar registro" description="No se puede deshacer"
  onConfirm={remove} onCancel={() => setOpen(false)} />
{toast && <ITToast message="Registro eliminado" type="success" onClose={() => setToast(null)} />}
```

### 15. Cómo pedirle código a una IA con esta guía

Dale **estos archivos** como contexto: `docs/llm/GUIA.md` + `docs/llm/catalogo.md` +
`docs/llm/ejemplos-reales.md` (patrones de producción; el que más ayuda a acertar de primeras) y
`LLM_DOCS.md` solo si va a tocar theming. Después pide así:

> Usa AXZY UI System. Compón una pantalla de listado de clientes con `ITLayout` + `ITPageHeader`, una
> `ITDataTable` alimentada por `fetchData`, estados de carga/vacío, un `ITConfirmDialog` para borrar y un
> `ITToast` de confirmación. Respeta las reglas de §3 y la accesibilidad de §12; si necesitas un prop que
> no conoces, búscalo en el catálogo antes de usarlo.

Pedir explícitamente «consulta el catálogo antes de inventar un prop» es lo que evita el 90% de las
alucinaciones con esta librería.

### 16. Mapa del repo (por si hace falta el código)

```
src/components/<capa>/<componente>/<componente>.tsx     implementación
src/components/<capa>/<componente>/<componente>.props.ts props + JSDoc (fuente de verdad)
src/index.ts                                            exports públicos
src/i18n/locales/{es,en}.ts                             catálogo de textos
docs/llm/                                               esta guía + catálogo generado + ejemplos reales
docs/<capa>/<componente>.md                             referencia por componente
docs/i18n/{conventions,strings}.md                      convenciones y catálogo maestro de textos
DESIGN.md                                               lenguaje visual de sandbox y portafolio
scripts/audit-sandbox.mjs                               auditoría (axe + recortes) del sandbox
```


---

## Parte 2 — Ejemplos reales de producción

Extraído de **CYC ERP** (`~/DEV/CYC/web`), una app real con React 19 + Vite + Tailwind v4 + Redux +
react-router. Todo lo de aquí está **en producción**: úsalo como plantilla antes que inventar.

> Estos ejemplos cubren la parte que **no** está en el README: cómo se deja la instalación al 100 (capas
> de CSS, dark mode por defecto, overrides de tokens), cómo se compone el chassis en un guard de rutas, y
> cómo se escriben páginas de listado, formulario y tablero con la librería.

- Versión usada: `@axzydev/axzy_ui_system ^1.4.7`
- React 19 · Vite 6 · Tailwind `4.3.3` (`@tailwindcss/vite`) · `react-i18next` para los textos de la app

---

### 1. CSS: capas, orden y overrides (`src/app/index.css`)

```css
/* 1) El orden de capas manda por encima del orden de imports.
      `axzy-ui-system` va DESPUÉS de `base` (su reset no lo pisa tu app) y
      ANTES de `utilities` (tus utilidades de Tailwind siguen ganando cuando
      necesitas ajustar algo de la librería). */
@layer theme, base, axzy-ui-system, components, utilities;

@import "tailwindcss";
@import "@axzydev/axzy_ui_system/dist/index.css" layer(axzy-ui-system);
/* Alternativa: el propio paquete publica la versión ya capada
   @import "@axzydev/axzy_ui_system/layered.css"; */

/* 2) Tokens del provider que quieras ajustar por CSS.
      `ITThemeProvider` inyecta estos `--it-*`; un selector con atributo
      (`:root[data-it-appearance="flat"]`) gana sobre la inyección del provider. */
:root[data-it-appearance="flat"] {
  --it-layout-bg: #f5f6fa;
  --it-sidebar-border: #e8eaf0;
  --it-topbar-border: #e8eaf0;
}

/* 3) Pisar una clase interna cuando el componente no expone prop para eso.
      Con el orden de capas de arriba NO hace falta `!important`; si tu capa de
      la librería va después de `utilities`, sí (ver §8). */
.it-dialog-panel {
  width: min(94vw, 900px);
}

html {
  scroll-behavior: smooth;
  overflow-x: hidden;
}
```

**Por qué importa**: `dist/index.css` es un build de Tailwind ya compilado con sus propias capas
`theme/base/components/utilities`. Si tu app también importa Tailwind sin capas explícitas, acabas con
**dos** juegos de capas con el mismo nombre y gana el que se registró último (normalmente tu Preflight, que
no conoce los tokens de AXZY). Con `layer(axzy-ui-system)` + el orden declarado, no depende del orden de
los imports.

### 2. Entrada: dark mode por defecto y config del provider (`src/app/main.tsx`)

```tsx
import { ITThemePalette, ITThemeProvider } from "@axzydev/axzy_ui_system";
import "@shared/i18n/config";              // tu i18next antes de renderizar
import "@app/index.css";
import { store } from "@app/store";
import ToastProvider from "@app/toast/ToastProvider";
import { Provider } from "react-redux";
import { HashRouter } from "react-router-dom";
import App from "./App";

// El provider arranca en "system" (según el SO). Si quieres un default propio,
// escribe su clave de localStorage ANTES de montar la app.
if (!localStorage.getItem("it-theme-dark-mode")) {
  localStorage.setItem("it-theme-dark-mode", "light");   // "light" | "dark" | "system"
}

const customTheme: ITThemePalette = {
  primary: "#3056B8",
  secondary: "#27469B",
  ternary: "#EEF2FB",
  alert: "#F97316",
  warning: "#F59E0B",
  danger: "#DC2626",
  info: "#0EA5E9",
  success: "#16A34A",
  layout: { sidebarBg: "#F5F6FA", sidebarText: "#334155", navbarBg: "#FFFFFF", navbarText: "#1E293B" },
  table: { headerBg: "#F8FAFC", headerText: "#475569", rowBg: "#FFFFFF", rowText: "#1E293B", rowHover: "#F5F7FB" },
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ITThemeProvider
        theme={customTheme}
        appearance="flat"   // lenguaje visual plano (bordes finos, sin sombras)
        radius={10}         // radio global de la escala rounded-*
        shadow={1}          // intensidad de sombras
        density={1}         // 0.5–1.5
        showFab={false}     // sin diseñador de temas flotante en producción
      >
        <ToastProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </ToastProvider>
      </ITThemeProvider>
    </Provider>
  </React.StrictMode>
);
```

### 3. Chassis en un guard de rutas (`src/app/guards/PrivateRoutes.tsx`)

Toda la app autenticada vive dentro de **un** `ITLayout`; el menú se arma desde un catálogo y se filtra
por permisos.

```tsx
import { ITLayout, type ITSidebarProps, type ITNavigationItem } from "@axzydev/axzy_ui_system";
import { Outlet } from "react-router-dom";

const NAV_ICONS: Record<string, ReactNode> = { home: <FaHouseUser size={14} />, students: <FaUserGraduate size={14} /> };

export default function PrivateRoutes() {
  const { t } = useTranslation(["common"]);
  const { user } = useSelector((s: RootState) => s.auth);

  const navigationItems: ITNavigationItem[] = APP_SCREENS
    .filter((s) => isScreenVisible(s, user))              // permisos por pantalla
    .map((s) => ({
      id: s.id,
      label: t(`nav.${s.id}`),
      icon: NAV_ICONS[s.id],
      isActive: location.pathname.startsWith(s.path),
      action: () => navigate(s.path),
    }));

  const sidebar: ITSidebarProps = {
    navigationItems,
    notification: { count: unread, icon: <FaBell />, label: t("notifications"), onClick: () => navigate("/notifications") },
  };

  return (
    <ITLayout
      topBar={{
        logo: <img src={cycMark} alt="" className="h-8" />,
        logoText: "CYC ERP",
        userMenu: { userName: user?.name ?? "", userEmail: user?.email ?? "", menuItems: [{ label: t("logout"), onClick: handleLogout }] },
      }}
      sidebar={sidebar}
    >
      <Outlet />
    </ITLayout>
  );
}
```

### 4. Página de listado con tabla server-side

`src/pages/students/StudentsListPage.tsx` (73 líneas: cabecera, KPIs y tabla):

```tsx
import { ITButton, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";

<ITPage
  className="m-0! px-4! max-w-screen!"   // ITPage trae su propio padding/max-width: se pisa con `!`
  noPadding
  breadcrumbs={crumbs({ label: t("common:nav.students") })}
  title={t("list.title")}
  description={t("list.description", { count: fx.total })}
  icon={<FaUserGraduate size={20} />}
  actions={
    <ITFlex gap={2}>
      <ITButton variant="outlined" color="secondary" onClick={fx.reload}>
        <ITFlex align="center" gap={1}>
          <FaSync size={11} />
          <ITText className="font-bold text-[11px]">{t("common:actions.reload")}</ITText>
        </ITFlex>
      </ITButton>
      <ITButton variant="filled" color="primary" onClick={() => navigate("/students/new")}>
        <ITFlex align="center" gap={1}>
          <FaPlus size={11} />
          <ITText className="font-bold text-[11px]">{t("list.new")}</ITText>
        </ITFlex>
      </ITButton>
    </ITFlex>
  }
>
  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <KpiTile label={t("kpi.total")} value={fx.summary?.total ?? "—"} icon={<FaUsers size={16} />} />
  </div>
  <StudentsTable fx={fx} onOpen={(student) => navigate(`/students/${student.id}`)} />
</ITPage>
```

La tabla tipada con `Column<T>` y `fetchData` (así se conecta una API real):

```tsx
import { ITDataTable, ITBadget, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";

const columns: Column<Student>[] = [
  {
    key: "studentNumber",
    label: t("table.studentNumber"),
    type: "string",
    width: 130,
    filter: true,
    sortable: false,
    render: (s) => <ITText className="font-mono text-[12px] font-black text-slate-700">{s.studentNumber}</ITText>,
  },
  { key: "name", label: t("table.name"), type: "string", filter: true, render: (s) => <ITText className="text-[12px]">{s.fullName}</ITText> },
  { key: "status", label: t("table.status"), type: "string", render: (s) => <ITBadget label={s.status} /> },
];

<ITDataTable
  columns={columns as unknown as Column<Record<string, unknown>>[]}
  fetchData={fx.fetchTableData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
  reloadTrigger={fx.reloadKey}       // cambia el número y la tabla vuelve a pedir datos
  onRowClick={(row) => onOpen(row as unknown as Student)}
  defaultItemsPerPage={25}
  itemsPerPageOptions={[25, 50, 100]}
  layout="fixed"
  density="compact"
  virtualized
  virtualizedMaxHeight={400}
  rowHeight={50}
/>
```

**El hook que alimenta la tabla** (filtros, orden y paginación los manda la tabla):

```ts
const fetchTableData = useCallback(async (params: ITDataTableFetchParams) => {
  const res = await studentApi.table({
    page: params.page, limit: params.limit, filters: params.filters, sort: params.sort,
  });
  setTotal(res.total);
  return {
    data: res.data as unknown as Record<string, unknown>[],
    total: res.total,
  };
}, []);
// …
const reload = () => setReloadKey((k) => k + 1);   // se pasa como `reloadTrigger`
```

> El doble cast (`as unknown as Column<Record<string, unknown>>[]`) es el precio de que la tabla sea
> genérica por dentro y tipada por fuera. Es el patrón que usa CYC y evita `any` sueltos.

### 5. Página de formulario con estados

`ITPage` ya resuelve `loading`/`error`/`backAction`; la página solo orquesta (53 líneas):

```tsx
<ITPage
  className="m-0! px-4! max-w-screen!"
  noPadding
  breadcrumbs={crumbs({ label: t("common:nav.students"), to: "/students" }, { label: id ? t("form.titleEdit") : t("form.titleNew") })}
  title={id ? t("form.titleEdit") : t("form.titleNew")}
  description={student ? `${student.studentNumber} · ${student.fullName}` : undefined}
  icon={<FaUserGraduate size={20} />}
  loading={loading}
  error={error}
  backAction={() => navigate(id ? `/students/${id}` : "/students")}
>
  {(!id || student) && (
    <StudentForm
      student={student}
      onCancel={() => navigate("/students")}
      onSaved={(saved, created) => {
        notify.success(created ? t("form.created") : t("form.saved"));
        navigate(`/students/${saved.id}`);
      }}
    />
  )}
</ITPage>
```

### 6. Tablero con filtros en la cabecera

Los filtros del tablero viven en `actions` de `ITPage` (no en una barra aparte) y encadenan
dependencias (al cambiar ciclo/curso se limpia el grupo):

```tsx
<ITPage
  className="m-0! px-4! max-w-screen!"
  noPadding
  title={t("home.title")}
  description={t("home.welcome", { name: user?.name ?? "" })}
  icon={<FaHouseUser size={20} />}
  actions={
    <ITFlex align="center" gap={2} wrap="wrap" className="justify-end">
      <div className="w-[168px]">
        <ITSelect
          size="sm"
          name="termId"
          label={t("reports:home.term")}
          value={filters.termId ?? ""}
          placeholder={t("reports:activeTerm")}
          options={terms.map((term) => ({ value: term.id, label: term.name }))}
          onChange={(e) => set("termId", e.target.value)}
        />
      </div>
    </ITFlex>
  }
>
  <DashboardView filters={filters} />
</ITPage>
```

### 7. Toasts globales (patrón portal + store)

`ITToast` es un componente tonto: **tú** decides dónde vive y cuándo se va. En CYC hay un provider con
portal sobre el store:

```tsx
// app/toast/useNotify.ts — la API que usan las páginas
export const useNotify = () => {
  const dispatch = useDispatch();
  const success = (message: string) => dispatch(showToast({ message, type: "success" }));
  const error = (message: string) => dispatch(showToast({ message, type: "error", duration: 4000 }));
  return { success, error };
};

// app/toast/ToastProvider.tsx — un solo toast global, encima de todo
{isVisible &&
  createPortal(
    <div className="fixed inset-0 z-[99999] pointer-events-none">
      <ITToast message={message} type={type} duration={duration} position={position}
        onClose={() => dispatch(hideToast())} />
    </div>,
    document.body
  )}
```

### 8. Reglas aprendidas (esto es lo que faltaba en la doc)

1. **Capas primero**: `@layer theme, base, axzy-ui-system, components, utilities;` + importar el CSS de la
   librería con `layer(...)`. Si la capa de la librería queda **después** de `utilities`, cualquier
   utilidad tuya que deba ganarle necesita el sufijo `!` de Tailwind v4 (`m-0! px-4! max-w-screen!`), que
   es justo lo que hace CYC en sus páginas.
2. **`ITPage` ya trae padding y max-width**: para una página a sangre usa `noPadding` y, si necesitas
   control total, `className="m-0! px-4! max-w-screen!"`.
3. **Dark mode por defecto**: escribe `it-theme-dark-mode` (`"light" | "dark" | "system"`) en
   `localStorage` antes de montar; el provider lo lee al inicializar.
4. **Los tokens se ajustan por CSS**: `:root[data-it-appearance="flat"] { --it-layout-bg: …; }` gana sobre
   lo que inyecta el provider. Para clases internas (`.it-dialog-panel`), una regla propia **fuera de
   capas** basta con el orden recomendado.
5. **i18n conviven**: la librería cae a su catálogo en español si no montas `ITI18nProvider`; la app puede
   usar `react-i18next` para lo suyo sin conflicto. Si quieres que la librería siga tu idioma, monta
   `<ITI18nProvider locale={...} messages={...}>`.
6. **Permisos en la UI**: los `actions` de `ITPage` se renderizan condicionados (`canExport && …`), y el
   menú se filtra por permiso antes de pasarlo a `ITLayout`.
7. **La tabla es genérica**: tipa tus columnas con `Column<T>` y castea al pasarlas; el `fetchData` debe
   devolver `{ data, total }`.
8. **Un solo toast global** con portal: no montes un `ITToast` por página.


---

## Parte 3 — Catálogo compacto

### Catálogo compacto (nombre · capa · qué es · props)

`*` = obligatorio. Los tipos van sin descripción; para el detalle completo usa `catalogo.md`.

#### `ITAvatar` — atoms

Circular avatar component with image, initials fallback, and optional badge overlay.

Props: src: string · alt: string · initials: string · size: AvatarSize · color: string · className: string · badge: React.ReactNode · onClick: () => void

#### `ITBadget` — atoms

Small status tag or label with theme-based colors and filled/outlined variants.

Props: label: string · children: React.ReactNode · color: "gray" | "purple" | "info" | "success" | "warnin · size: SizesTypes · variant: "filled" | "outlined" · className: string

#### `ITButton` — atoms

Highly configurable action button supporting 8 visual variants, theme colors, 3 sizes, icons, and hover/focus states.

Props: label: string · children: React.ReactNode · icon: React.ReactNode · onClick: () => void · color: "gray" | "purple" | "info" | "success" | "warnin · size: SizesTypes · variant: string · disabled: boolean · className: string · type: "button" | "reset" | "submit" · ariaLabel: string · title: string

#### `ITCheckbox` — atoms

Checkbox component with label, indeterminate state, and disabled support. Uses a visually hidden native input for accessibility.

Props: checked: boolean · onChange: (checked: boolean) => void · label: React.ReactNode · disabled: boolean · indeterminate: boolean · className: string · name: string

#### `ITChip` — atoms

Compact tag / pill used for labels, active filters, and multi-value selections. Supports soft, filled, and outlined variants, an optional leading icon, a removable (X) affordance, and a selected state for filter toggles.

Props: label: string · children: React.ReactNode · color: "gray" | "purple" | "info" | "success" | "warnin · size: SizesTypes · variant: "filled" | "outlined" | "soft" · icon: React.ReactNode · removable: boolean · onRemove: () => void · onClick: () => void · selected: boolean · disabled: boolean · className: string

#### `ITDivider` — atoms

Horizontal or vertical separator line. Renders a thin full-width (horizontal) or full-height (vertical) bar using Tailwind utility classes. Supports custom color and thickness overrides.

Props: orientation: DividerOrientation · className: string · color: string · thickness: string

#### `ITFlex` — atoms

A complete flexbox container with all alignment and spacing options.

Props: children: React.ReactNode · direction: FlexDirection · align: FlexAlign · justify: FlexJustify · wrap: FlexWrap · gap: number · grow: number | boolean · shrink: number | boolean · basis: string | number · className: string · style: React.CSSProperties · as: React.ElementType · onClick: (e: React.MouseEvent) => void

#### `ITGrid` — atoms

Responsive 12-column CSS grid layout system. Renders as a grid container when `container` is true, as a column-spanning item when `item` is true. Supports breakpoint-aware column spans and configurable spacing between items.

Props: children: React.ReactNode · container: boolean · item: boolean · spacing: number · columns: number · xs: number · sm: number · md: number · lg: number · xl: number · className: string · style: React.CSSProperties · as: React.ElementType

#### `ITImage` — atoms

Image component with automatic fallback on load error. Displays the primary `src` image and gracefully switches to the `fallback` image if loading fails.

Props: src*: string · alt: string · className: string · fallback: string · onClick: () => void

#### `ITInput` — atoms

Text input component with label, validation error display, icon slots, and helper text. Supports text, password, email, number (with currency and thousand formatting), checkbox, radio, and textarea types.

Props: name*: string · type: "number" | "checkbox" | "radio" | "textarea" | " · label: string · currencyFormat: boolean · decimals: number · placeholder: string · value: any · onChange*: (event: any) => void · onBlur: (event: React.FocusEvent<HTMLInputElement> | Rea · onKeyDown: (event: React.KeyboardEvent) => void · showHintLength: boolean · maxLength: number · minLength: number · variant: "gray" | "purple" | "info" | "success" | "warnin · size: SizesTypes · disabled: boolean · containerClassName: string · labelClassName: string · className: string · touched: boolean · error: string | boolean · required: boolean · formatNumber: boolean · autoFocus: boolean · focusContent: boolean · onClick: () => void · iconLeft: React.ReactNode · iconRight: React.ReactNode · checked: boolean · rows: number · min: number · max: number · readOnly: boolean

#### `ITInputNumber` — atoms

Numeric field that always renders currency-style formatting (thousand separators + fixed decimals) and emits a real `number`. Built on top of `ITInput`: it is the same field, but `onChange`/`onBlur` already receive the parsed value, so consumers can do math directly instead of converting strings first.

Props: name*: string · value: number · onChange*: (value: number | undefined, event: React.ChangeE · onBlur: (value: number | undefined, event: React.FocusEv · decimals: number · prefix: string · label: string · placeholder: string · min: number · max: number · size: SizesTypes · disabled: boolean · readOnly: boolean · required: boolean · touched: boolean · error: string | boolean · iconLeft: React.ReactNode · iconRight: React.ReactNode · containerClassName: string · labelClassName: string · className: string · autoFocus: boolean · focusContent: boolean · onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) =

#### `ITLoader` — atoms

Loading indicators with multiple animation types: spinner, dots, pulse, and bar. Supports configurable size, color (theme semantic or custom), and inline/padded rendering.

Props: size: LoaderSize · variant: LoaderVariant · color: string · className: string

#### `ITPopover` — atoms

Floating content panel triggered by click on a trigger element, with position control and click-outside dismissal.

Props: trigger*: React.ReactNode · children*: React.ReactNode · position: PopoverPosition · isOpen: boolean · onClose: () => void · className: string

#### `ITProgress` — atoms

Progress bar indicator with support for determinate and indeterminate variants, themed colors, and multiple sizes.

Props: value: number · max: number · variant: "determinate" | "indeterminate" · color: "gray" | "purple" | "info" | "success" | "warnin · size: "sm" | "md" | "lg" · className: string · style: React.CSSProperties

#### `ITRadioGroup` — atoms

Radio button group with configurable layout direction and themed selection styling.

Props: name*: string · value*: string · onChange*: (value: string) => void · options*: ITRadioOption[] · disabled: boolean · direction: "column" | "row" · className: string

#### `ITSegmentedControl` — atoms

iOS-style segmented toggle for switching between mutually exclusive options.

Props: options*: ISegmentedOption[] · value*: string · onChange*: (value: string) => void · size: SegmentedControlSize · className: string · disabled: boolean

#### `ITSkeleton` — atoms

Content placeholder loader with pulse animation for text, circles, and rectangles.

Props: variant: SkeletonVariant · width: string | number · height: string | number · count: number · className: string · style: React.CSSProperties

#### `ITSlider` — atoms

Range slider control with min/max/step and optional label displaying the current value.

Props: value*: number · onChange*: (value: number) => void · min: number · max: number · step: number · label: string · disabled: boolean · className: string

#### `ITSlideToggle` — atoms

iOS-style toggle switch with theme color support. Supports fully controlled (`isOn`) or uncontrolled (`initialState`) modes.

Props: onToggle: (value: boolean) => void · isOn: boolean · initialState: boolean · activeColor: string · inactiveColor: string · disabled: boolean · size: "sm" | "md" | "lg" · label: string · ariaLabel: string · className: string

#### `ITStack` — atoms

Simplified flex stack with consistent spacing (gap) for arranging children in a row or column. Supports an optional divider element between children.

Props: children: React.ReactNode · direction: StackDirection · spacing: number · alignItems: StackAlignment · justifyContent: StackJustify · flexWrap: StackWrap · divider: React.ReactNode · className: string · style: React.CSSProperties · as: React.ElementType

#### `ITText` — atoms

Semantic typography wrapper that renders any HTML element. Supports muted styling via the `muted` prop and passes through all standard HTML attributes.

Props: children: React.ReactNode · className: string · as: React.ElementType · muted: boolean · htmlFor: string · style: React.CSSProperties

#### `ITTextarea` — atoms

Multi-line text input with optional label, validation error display, character limit, and configurable resize behavior.

Props: value: string · onChange: (value: string) => void · label: string · placeholder: string · rows: number · disabled: boolean · error: string · className: string · name: string · maxLength: number · resize: "none" | "both" | "horizontal" | "vertical"

#### `ITAccordion` — molecules

Collapsible sections for FAQs, settings panels, and long content. Works uncontrolled (`defaultOpenIds`) or controlled (`openIds` + `onChange`). Supports single-open (default) or multiple-open mode, and animates the body with a CSS grid-rows transition (no JS height measurement).

Props: items*: ITAccordionItem[] · allowMultiple: boolean · defaultOpenIds: string[] · openIds: string[] · onChange: (openIds: string[]) => void · variant: "default" | "separated" | "bordered" · className: string · itemClassName: string

#### `ITAlert` — molecules

Dismissible alert banner with 4 visual variants and optional custom icon.

Props: variant: AlertVariant · title: string · children: React.ReactNode · dismissible: boolean · onDismiss: () => void · icon: React.ReactNode · className: string

#### `ITBreadcrumbs` — molecules

Navigation breadcrumb trail with automatic link/button rendering and custom separator.

Props: items*: ITBreadcrumbItem[] · separator: React.ReactNode · className: string

#### `ITCalendar` — molecules

Full-featured calendar and date picker with week/day/month views, event display, range selection, and drag-to-select.

Props: events: CalendarEvent[] · mode: "week" | "day" | "month" · onEventClick: (event: CalendarEvent) => void · onSlotClick: (date: Date) => void · onSlotHover: (date: Date) => void · onSelectRange: (start: Date, end: Date) => void · value: Date · onChange: (date: Date) => void · selectionMode: "range" | "single" · startDate: Date · endDate: Date · minDate: Date · maxDate: Date · className: string · disabled: boolean · variant: "gray" | "purple" | "info" | "success" | "warnin

#### `ITCard` — molecules

Versatile card container with optional image, title, body content, and action footer. Supports interactive hover states.

Props: onClick: () => void · title: string · image: string · alt: string · children: React.ReactNode · actions: React.ReactNode · className: string · imageClassName: string · titleClassName: string · contentClassName: string · actionClassName: string

#### `ITChipInput` — molecules

Free-text input that turns entered values into removable tags (chips). Commits a tag on `Enter`/`,` (configurable via `delimiters`), on blur, or on paste of delimited text. Supports `maxTags`, dedupe control, and per-tag validation.

Props: name: string · label: string · placeholder: string · value*: string[] · onChange: (values: string[]) => void · onBlur: (e: React.FocusEvent<HTMLInputElement>) => void · delimiters: string[] · maxTags: number · allowDuplicates: boolean · validate: (value: string) => string | undefined · color: "gray" | "purple" | "info" | "success" | "warnin · size: SizesTypes · disabled: boolean · required: boolean · touched: boolean · error: string | boolean · helpText: string · className: string

#### `ITDatePicker` — molecules

Date picker component with single-date and date-range modes. Supports manual text input (DD/MM/YYYY format) and a calendar popover. In range mode the user selects a start date then an end date; the calendar highlights the interval. Position-aware popover flips above the input when near the bottom of the viewport.

Props: name*: string · value: Date | [Date, Date] · onChange*: (event: React.ChangeEvent<HTMLInputElement> | {  · onBlur: (event: React.FocusEvent<HTMLInputElement> | { t · range: boolean · variant: "gray" | "purple" | "info" | "success" | "warnin · size: SizesTypes · className: string · calendarClassName: string · disabled: boolean · placeholder: string · label: string · required: boolean · touched: boolean · error: string | boolean · minDate: Date · maxDate: Date

#### `ITDropdownMenu` — molecules

Action menu with keyboard navigation and ARIA menu semantics. Renders the menu through a portal so it escapes `overflow: hidden` and transformed ancestors, and flips above the trigger when there is no room below.

Props: items*: ITDropdownMenuItem[] · trigger: React.ReactNode · triggerLabel: string · placement: "bottom-start" | "bottom-end" | "top-start" | "t · onSelect: (id: string, item: ITDropdownMenuItem) => void · disabled: boolean · className: string · menuClassName: string

#### `ITEmptyState` — molecules

Placeholder display for empty data sets. Shows a large icon, a title, an optional description, and an optional call-to-action element (usually a button). Centered vertically and horizontally within its container.

Props: icon: React.ReactNode · title*: string · description: string · action: React.ReactNode · className: string

#### `ITField` — molecules

Form-field wrapper that standardizes label, required marker, helper text, and error message around any control. Keeps spacing and error styling consistent across forms so each control does not re-implement label/error logic.

Props: label: string · htmlFor: string · required: boolean · error: string | boolean · helpText: string · children*: React.ReactNode · className: string · labelClassName: string · contentClassName: string

#### `ITFormHeader` — molecules

Colored header bar for modals and forms with an optional close button. Uses the theme's primary color as the background and automatically calculates a contrasting text color for readability.

Props: title*: string · onClose: () => void · className: string

#### `ITLineBarChart` — molecules

Barras + línea en SVG puro (sin librería de gráficas). Pensado para comparar dos series por periodo —ingresos contra gastos, cobrado contra proyectado—: las barras van al fondo y la línea con su área encima, con tooltip al pasar el cursor. El SVG escala con `viewBox`, así que el trazo y el texto no se deforman al cambiar el ancho del contenedor.

Props: data*: ITLineBarDatum[] · ariaLabel*: string · lineLabel: string · barLabel: string · lineColor: string · barColor: string · height: number · formatValue: (value: number) => string · formatAxis: (value: number) => string · className: string

#### `ITMaskedInput` — molecules

Text input that applies a formatting mask while the user types, exposing only the clean (raw) value through `onChange`. The mask is defined by a pattern string. Tokens are filled by the user and any other character acts as an auto-inserted literal separator. Empty slots are painted with `placeholderChar`, so the mask is always visible.

Props: name*: string · mask*: string · value: string · onChange*: (event: { target: { name: string; value: string; · onBlur: (event: React.FocusEvent<HTMLInputElement>) => v · onComplete: (value: string) => void · pattern: RegExp · placeholderChar: string · variant: "gray" | "purple" | "info" | "success" | "warnin · size: SizesTypes · label: string · disabled: boolean · required: boolean · touched: boolean · error: string | boolean · className: string · containerClassName: string · iconLeft: React.ReactNode · iconRight: React.ReactNode · autoFocus: boolean

#### `ITMultiSelect` — molecules

Multi-value select with searchable dropdown, removable chips, and keyboard navigation. Supports local filtering and remote search (`onSearch`), a collapsed chip summary (`maxVisibleChips`), and custom option templates (`renderOption`). The dropdown is portaled so it is never clipped by cards or overflow ancestors.

Props: name: string · label: string · placeholder: string · options*: ITMultiSelectOption[] · value*: (string | number)[] · onChange: (values: (string | number)[], options: ITMultiSe · onBlur: (e: React.FocusEvent<HTMLInputElement>) => void · valueField: string · labelField: string · disabled: boolean · readOnly: boolean · required: boolean · touched: boolean · error: string | boolean · size: SizesTypes · maxVisibleChips: number · clearable: boolean · searchable: boolean · onSearch: (query: string) => void · isLoading: boolean · noResultsMessage: string · renderOption: (option: ITMultiSelectOption, state: { isSelecte · className: string

#### `ITPagination` — molecules

Page navigation controls with previous/next buttons, page number display, and optional items-per-page selector.

Props: currentPage*: number · totalPages*: number · onPageChange*: (page: number) => void · siblingCount: number · color: string · className: string · itemsPerPageOptions: number[] · itemsPerPage: number · onItemsPerPageChange: (value: number) => void · totalItems: number

#### `ITSearchSelect` — molecules

Searchable dropdown select with local client-side filtering and server-side search via API.

Props: name: string · label: string · placeholder: string · value: string | number · options: ITSearchSelectOption[] · valueField: string · labelField: string · onChange: (value: string | number, option?: ITSearchSelect · onBlur: (e: React.FocusEvent<any>) => void · disabled: boolean · className: string · touched: boolean · required: boolean · error: string | boolean · readOnly: boolean · size: SizesTypes · onSearch: (query: string) => void · isLoading: boolean · noResultsMessage: string · renderOption: (option: ITSearchSelectOption, state: { isSelect · clearable: boolean · onClear: () => void

#### `ITSelect` — molecules


Props: name*: string · options*: OptionType[] · valueField: string · labelField: string · label: string · placeholder: string · value: string · onChange: (event: React.ChangeEvent<HTMLSelectElement>) => · onBlur: (event: React.FocusEvent<HTMLSelectElement>) =>  · variant: "gray" | "purple" | "info" | "success" | "warnin · size: SizesTypes · disabled: boolean · className: string · touched: boolean · error: string | boolean · required: boolean · autoFocus: boolean · readOnly: boolean

#### `ITStatCard` — molecules

A metric card displaying a value with an optional trend indicator and icon. Automatically detects trend direction from the trend string prefix.

Props: label*: string · value*: string | number · trend: string · trendDirection: "up" | "down" | "neutral" · icon: React.ReactNode · color: string · className: string · style: React.CSSProperties · onClick: () => void

#### `ITStepper` — molecules

A step-by-step wizard / progress indicator with animated content transitions, clickable step navigation, and configurable icons.

Props: steps*: Step[] · currentStep*: number · onFinish: () => void · onStepChange: (step: number) => void · allowClickToJump: boolean · useIcons: boolean · disableNext: boolean · containerClassName: string · stepClassName: string · scrollableContent: boolean · maxContentHeight: string · color: string

#### `ITTable` — molecules

A feature-rich data table with per-column filtering, sortable columns, pagination, boolean/catalog type support, and currency formatting.

Props: columns*: Column<T>[] · containerClassName: string · data*: T[] · variant: TableVariants · className: string · size: TableSize · itemsPerPageOptions: number[] · defaultItemsPerPage: number · title: string · renderCard: (row: T) => React.ReactNode · defaultView: "table" | "cards" · showVerticalBorder: boolean · verticalBorderClassname: string · onRowClick: (row: T, event: React.MouseEvent<HTMLElement> |  · layout: "auto" | "fixed" · density: TableDensity · autoCardBreakpoint: number · virtualized: boolean · virtualizedMaxHeight: number · rowHeight: number · overscan: number · stickyHeader: boolean · showViewToggle: boolean · design: TableDesign · colors: TableColors · containerStyle: React.CSSProperties · cardClassName: string · cardStyle: React.CSSProperties · toolbarClassName: string · toolbarStyle: React.CSSProperties · headerClassName: string · headerStyle: React.CSSProperties · headerCellClassName: string · headerCellStyle: React.CSSProperties · rowClassName: string · rowStyle: React.CSSProperties · cellClassName: string · cellStyle: React.CSSProperties · cardsClassName: string · cardsStyle: React.CSSProperties · footerClassName: string · footerStyle: React.CSSProperties

#### `ITTabs` — molecules

Tabbed navigation component with "line" and "pill" visual variants. Manages its own active state internally via a defaultActiveId.

Props: items*: ITTabItem[] · defaultActiveId: string · onChange: (id: string) => void · variant: "line" | "pill" · className: string · containerClassName: string

#### `ITTimePicker` — molecules

Time selection input with a dual-column dropdown (hours / minutes). Supports manual typing with auto-formatting, validation, and keyboard-friendly picker.

Props: name*: string · value: string · label: string · placeholder: string · onChange*: (e: any) => void · onBlur: (e: any) => void · required: boolean · touched: boolean · error: string | boolean · disabled: boolean · className: string · size: SizesTypes · variant: "purple" | "info" | "success" | "warning" | "pri · color: string

#### `ITWysiwyg` — molecules

Lightweight WYSIWYG editor (no external rich-text dependency). Provides bold, italic, underline, a yellow marker highlight and ordered/unordered lists. Formatting is applied manually over the Selection/Range API (no deprecated `document.execCommand`), toggling elements by wrapping/unwrapping text nodes. The component is uncontrolled at the DOM level: it renders `value` lazily and only re-syncs it when the editor is not focused (`onChange` reports the HTML).

Props: value: string · onChange: (html: string) => void · label: string · placeholder: string · error: string · disabled: boolean · readOnly: boolean · name: string · size: SizesTypes · minHeight: number · highlightColor: string · toolbar: ToolbarAction[] · className: string

#### `ITConfirmDialog` — organisms

Confirmation modal dialog for destructive or critical actions. Renders a centered overlay with a warning icon, title, message body, and confirm/cancel buttons. The dialog auto-hides when `isOpen` is false.

Props: isOpen*: boolean · onClose*: () => void · onConfirm*: () => void · title: string · message: React.ReactNode · confirmLabel: string · cancelLabel: string · variant: "gray" | "purple" | "info" | "success" | "warnin · loading: boolean

#### `ITDataTable` — organisms

Async server-side data table with sorting, filtering, and pagination. Fetches data via the `fetchData` callback whenever pagination, sorting, or filters change. Supports column-level text/catalog/boolean filters, sortable columns, and a loading overlay. Built on-top of internal table hooks for automatic state coordination.

Props: columns*: Column<T>[] · fetchData*: (params: ITDataTableFetchParams) => Promise<ITDa · debounceMs: number · externalFilters: ColumnFilters · loadingIndicator: React.ReactNode · fetchOnMount: boolean · reloadTrigger: string | number | boolean · containerClassName: string · className: string · variant: "default" | "bordered" | "striped" | "minimal" · size: "sm" | "md" | "lg" · itemsPerPageOptions: number[] · defaultItemsPerPage: number · title: React.ReactNode · renderCard: (row: T) => React.ReactNode · defaultView: "table" | "cards" · showVerticalBorder: boolean · verticalBorderClassname: string · onRowClick: (row: T, event: React.MouseEvent<HTMLElement> |  · layout: "auto" | "fixed" · density: TableDensity · autoCardBreakpoint: number · virtualized: boolean · virtualizedMaxHeight: number · rowHeight: number · overscan: number · stickyHeader: boolean · showViewToggle: boolean · design: TableDesign · colors: TableColors · containerStyle: React.CSSProperties · cardClassName: string · cardStyle: React.CSSProperties · toolbarClassName: string · toolbarStyle: React.CSSProperties · headerClassName: string · headerStyle: React.CSSProperties · headerCellClassName: string · headerCellStyle: React.CSSProperties · rowClassName: string · rowStyle: React.CSSProperties · cellClassName: string · cellStyle: React.CSSProperties · cardsClassName: string · cardsStyle: React.CSSProperties · footerClassName: string · footerStyle: React.CSSProperties

#### `ITDialog` — organisms

Modal dialog rendered via React portal with overlay backdrop. Supports Escape-key dismissal, click-outside-to-close, optional title bar (plain or ITFormHeader), and a full-screen variant. Content is portaled to `document.body` so it sits above all other page layers.

Props: isOpen*: boolean · onClose*: () => void · children*: React.ReactNode · className: string · title: string · useFormHeader: boolean · fullScreen: boolean

#### `ITDrawer` — organisms

Sliding panel drawer from the left or right screen edge. Renders an overlay backdrop with a horizontally-anchored panel that slides in. Includes an optional title bar with close button and a scrollable body area. Uses the `useClickOutside` hook for overlay dismissal.

Props: isOpen*: boolean · onClose*: () => void · position: DrawerPosition · size: string · title: React.ReactNode · children: React.ReactNode · className: string · style: React.CSSProperties

#### `ITDropfile` — organisms

Drag-and-drop file uploader with preview, status tracking, and confirmation flow. Supports configurable accepted file types (PDF, Excel, CSV, images), visual drag-active feedback, image previews, and a three-step workflow: select → confirm → upload. Upload status is tracked internally or controlled externally via the `uploadStatus` prop. Re-exports `FileTypeEnum` and `UploadStatus` enums for consuming code.

Props: onFileSelect*: (file: File | null) => void · onCancel: () => void · onSubmit: (file: File) => void · acceptedFileTypes: FileTypeEnum[] · contentClassName: string · containerClassName: string · showStatusBadge: boolean · uploadStatus: UploadStatus · onStatusChange: (status: UploadStatus) => void · initialPreviewUrl: string · view: "button" | "drop" · buttonLabel: string · modalTitle: string

#### `ITFormBuilder` — organisms

`ITFormBuilder` is a declarative form generator. It renders a responsive grid of inputs from either a legacy V1 `fields` array or the richer V2 `config` array and wires every rendered input/select/date to the supplied Formik-style `handleChange`/`handleBlur`/`setFieldValue` callbacks. **V2 features (recommended):** - Rules engine: `renderWhen`, `dynamicProps`, `dependsOn`. - Section grouping with `type: "section"`. - Custom renderers with `type: "custom"`. - Async option loaders via `options: () => Promise<...>`. - Per-field `onChangeAction` for derived fields and side effects. - Nested sections and grids via `fields?: FieldConfigV2[]`. **V1 (legacy):** The `fields` prop accepts a simpler shape (`text` / `number` / `password` / `select` / `date`) without rules, sections, or async options. Kept for backward compatibility. The component is fully controlled: it does not own form state. Wrap it in a Formik `<Formik>` (or any state holder of your choice) and forward its `values`, `handleChange`, `handleBlur`, `touched`, `errors`, and `setFieldValue` props.

Props: fields: FieldConfig[] · config: FieldConfigV2[] · columns: number · values*: ITFormBuilderValues · handleChange*: (event: ITFormBuilderChangeEvent) => void · handleBlur*: (event: ITFormBuilderBlurEvent) => void · touched*: ITFormBuilderTouched · errors*: ITFormBuilderErrors · setFieldValue: (field: string, value: any, shouldValidate?: boo · setFieldTouched: (field: string, touched?: boolean, shouldValidat · setFieldError: (field: string, message: string | undefined) =>  · isSubmitting: boolean · children: React.ReactNode

#### `ITNavbar` — organisms

Full sidebar navigation shell with collapsible submenus, user menu dropdown, and themed styling.

Props: logo: React.ReactNode · logoText: string · navigationItems: ITNavigationItem[] · userMenu: { userImage?: string; userName: string; userEmai · children: React.ReactNode · navItems: React.ReactNode · showSidebar: boolean · showSidebarOnMobile: boolean · sidebarItems: React.ReactNode

#### `ITPageHeader` — organisms

Page title bar with breadcrumbs, description, back button, and action buttons.

Props: title*: string · description: string · breadcrumbs: ITBreadcrumbItem[] · actions: React.ReactNode · backAction: () => void · icon: React.ReactNode · iconColor: string · className: string

#### `ITSearchTable` — organisms

Server-side data table with global search, column sorting, inline editing, and pagination.

Props: editingRow: number · searchTermInitial: string · onClearSearch: () => void · onEdit: (row: T, index: number) => void · onSave: (row: T, index: number) => void · onCancel: () => void · sortConfig: { key: string; direction: "asc" | "desc"; } · columns*: SearchColumn<T>[] · containerClassName: string · searchInputPlaceholder: string · data*: T[] · variant: TableVariants · className: string · size: TableSize · itemsPerPageOptions: number[] · defaultItemsPerPage: number · validationSchema: ObjectSchema<any, AnyObject, any, ""> · title: string · pageIndex*: number · totalCount*: number · totalPages*: number · hasPreviousPage*: boolean · hasNextPage*: boolean · onPageChange: (page: number) => void · onItemsPerPageChange: (itemsPerPage: number) => void · onSortChange: (sortConfig: { key: string; direction: "asc" | " · onFilterChange: (filters: Record<string, string | boolean | numb

#### `ITSidebar` — organisms

Vertical navigation sidebar with submenu expand/collapse, hover tooltips in collapsed mode, and glassmorphism styling. The collapsed rail expands automatically on pointer hover — there is no toggle button; the hover is the only way to expand and collapse it.

Props: navigationItems*: ITNavigationItem[] · isCollapsed: boolean · onToggleCollapse: () => void · expandOnHover: boolean · visibleOnMobile: boolean · onItemClick: (item: ITNavigationItem) => void · onSubItemClick: (subitem: ITNavigationSubItem) => void · subitemConnector: "none" | "dot" | "|" · className: string · header: React.ReactNode · notification: ITSidebarNotification · brand: ITSidebarBrand

#### `ITToast` — organisms

ITToast — floating notification with automatic dismiss and severity-based styling. Renders a positioned alert with an icon, message, and close button. Supports "success", "error", "warning", "info", "primary", and "danger" types. Auto-dismisses after the configured duration and calls `onClose` on completion.

Props: message*: string · type: string · duration: number · position: "top-right" | "top-center" | "top-left" | "botto · onClose: () => void

#### `ITTripleFilter` — organisms


Props: value*: T · onChange*: (value: T) => void · options*: ITTripleFilterOption<T>[] · color: "gray" | "purple" | "info" | "success" | "warnin · className: string

#### `ITLayout` — templates

Main application shell with sidebar, topbar, and content area. Provides a responsive layout with a collapsible desktop sidebar, a sliding mobile sidebar overlay, and a scrollable main content region.

Props: topBar*: ITTopBarProps · sidebar*: ITSidebarProps · children*: React.ReactNode · className: string · contentClassName: string · sidebarFullHeight: boolean

#### `ITPage` — templates

Page template combining a page header and content area with built-in states for loading, error, and empty.

Props: title: string · description: string · breadcrumbs: ITBreadcrumbItem[] · actions: React.ReactNode · backAction: () => void · icon: React.ReactNode · iconColor: string · loading: boolean · error: string · errorTitle: string · errorActionLabel: string · onRetry: () => void · empty: boolean · emptyTitle: string · emptyDescription: string · emptyAction: React.ReactNode · className: string · children*: React.ReactNode · maxWidth: "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl" · noPadding: boolean · horizontalPadding: string

#### `ITI18nProvider` — others

Provee locale y mensajes al árbol de componentes. Sin provider, los componentes usan el catálogo base en español. Con provider, cualquier prop de texto explícita de un componente sigue teniendo prioridad sobre el catálogo.

Props: locale: string · fallbackLocale: string · messages: ITMessagesByLocale · children*: React.ReactNode

#### `ITThemeProvider` — others

Root theme context provider that injects CSS custom properties for all components, supports custom color palettes, dark/light mode, and an optional in-app theme designer FAB.

Props: theme: Partial<ITThemePalette> · children*: React.ReactNode · showFab: boolean · density: number · radius: number · shadow: number · appearance: ITThemeAppearance

