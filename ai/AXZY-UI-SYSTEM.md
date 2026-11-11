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

## Parte 3 — Catálogo de componentes (props completos)

### Atoms

#### `ITAvatar`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/avatar/avatar.tsx`
- **Qué es:** Circular avatar component with image, initials fallback, and optional badge overlay.

```tsx
<ITAvatar src="/avatar.jpg" alt="John Doe" size="lg" badge={<span className="w-2.5 h-2.5 bg-success-500 rounded-full" />} />
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `src` | `string` | — | Image source URL for the avatar. When provided, displays an `<img>` element. |
| `alt` | `string` | — | Alt text for the avatar image. Also used as fallback initial when no `initials` or `src` is provided. |
| `initials` | `string` | — | Initials to display when no image is available (max 2 characters recommended). |
| `size` | `AvatarSize` | `"md"` | Avatar dimensions. Valid values: `"xs"`, `"sm"`, `"md"`, `"lg"`, `"xl"`. |
| `color` | `string` | `"bg-primary-600"` | Color de fondo para el fallback de iniciales. Acepta un valor de color real (`"#8b5cf6"`, `"rgb(...)"`, `"hsl(...)"`, `"var(--...)"`) — se aplica como `style` inline y SIEMPRE se renderiza — o una clase de Tailwind (`"bg-purple-600"`) por compatibilidad con código existente. Una clase de Tailwind solo se ve si esa clase exacta ya existe en el CSS compilado que consume la app (esta librería se dis… |
| `className` | `string` | — | Additional CSS class names for the avatar container. |
| `badge` | `React.ReactNode` | — | React node rendered as a badge overlay at the bottom-right corner. |
| `onClick` | `() => void` | — | Click handler. When provided, the avatar becomes interactive (role="button"). |

`*` = obligatorio.

#### `ITBadget`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/badget/badget.tsx`
- **Qué es:** Small status tag or label with theme-based colors and filled/outlined variants.

```tsx
<ITBadget label="Active" color="success" variant="filled" />
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `label` | `string` | — | Text label displayed inside the badge. Overridden if `children` is provided. |
| `children` | `React.ReactNode` | — | Custom content to render inside the badge. Takes precedence over `label`. |
| `color` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | `"primary"` | Color theme key. Values come from the semantic color palette (e.g. `"primary"`, `"secondary"`, `"success"`, `"danger"`, `"warning"`, `"info"`, `"purple"`, `"error"`, `"gray"`). |
| `size` | `SizesTypes` | `"md"` | Badge size. Valid values: `"sm"`, `"md"`, `"lg"`. |
| `variant` | `"filled" \| "outlined"` | `"filled"` | Badge visual style. Valid values: `"filled"`, `"outlined"`. |
| `className` | `string` | — | Additional CSS class names for the badge element. |

`*` = obligatorio.

#### `ITButton`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/button/button.tsx`
- **Qué es:** Highly configurable action button supporting 8 visual variants, theme colors, 3 sizes, icons, and hover/focus states.

```tsx
<ITButton label="Submit" color="primary" variant="filled" onClick={() => {}} />
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `label` | `string` | — | Button text label. Overridden if `children` is provided. |
| `children` | `React.ReactNode` | — | Custom content to render inside the button. Takes precedence over `label`. |
| `icon` | `React.ReactNode` | — | Icon element rendered before the label. With `variant="icon-only"` and no `label`/`children` it becomes the only content and is centered in the square button. |
| `onClick` | `() => void` | — | Click handler for the button. |
| `color` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | `"primary"` | Color theme key. Values come from the semantic color palette (e.g. `"primary"`, `"secondary"`, `"success"`, `"danger"`, `"warning"`, `"info"`, `"purple"`, `"error"`, `"gray"`). |
| `size` | `SizesTypes` | `"md"` | Button size. Valid values: `"sm"`, `"md"`, `"lg"`. In `variant="icon-only"` it also scales the square padding (`buttonIconPadding`: `sm` 0.5rem, `md` 0.625rem, `lg` 0.75rem). |
| `variant` | `string` | `"filled"` | Button visual style. Valid values: `"filled"`, `"outlined"`, `"raised"`, `"rounded"`, `"text"`, `"raised-text"`, `"icon-only"`, `"link"`. `"icon-only"` renders a centered square icon button; combine it with `icon` and `ariaLabel`. |
| `disabled` | `boolean` | `false` | Disables the button interaction and applies reduced opacity. |
| `className` | `string` | — | Additional CSS class names for the button element. |
| `type` | `"button" \| "reset" \| "submit"` | `"button"` | HTML button type attribute. Valid values: `"submit"`, `"reset"`, `"button"`. |
| `ariaLabel` | `string` | — | Accessible label for screen readers. Falls back to `label` if not set. |
| `title` | `string` | — | HTML title attribute for native tooltip. Falls back to `ariaLabel` or `label`. |

`*` = obligatorio.

#### `ITCheckbox`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/checkbox/checkbox.tsx`
- **Qué es:** Checkbox component with label, indeterminate state, and disabled support. Uses a visually hidden native input for accessibility.

```tsx
<ITCheckbox label="Accept terms" checked={agreed} onChange={setAgreed} />
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `checked` | `boolean` | `false` | Controlled checked state. |
| `onChange` | `(checked: boolean) => void` | — | Callback fired when the checkbox value changes. Receives the new checked state. |
| `label` | `React.ReactNode` | — | Label text or element rendered next to the checkbox. |
| `disabled` | `boolean` | `false` | Disables the checkbox interaction and applies reduced opacity. |
| `indeterminate` | `boolean` | `false` | Renders the checkbox in an indeterminate (dash) state. Has no effect when `checked` is `true`. |
| `className` | `string` | — | Additional CSS class names for the label wrapper. |
| `name` | `string` | — | HTML name attribute for the native `<input>` element. |

`*` = obligatorio.

#### `ITChip`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/chip/chip.tsx`
- **Qué es:** Compact tag / pill used for labels, active filters, and multi-value selections. Supports soft, filled, and outlined variants, an optional leading icon, a removable (X) affordance, and a selected state for filter toggles.

```tsx
<ITChip label="React" color="primary" />
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `label` | `string` | — | Text label displayed inside the chip. Overridden if `children` is provided. |
| `children` | `React.ReactNode` | — | Custom content rendered inside the chip. Takes precedence over `label`. |
| `color` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | `"secondary"` | Color theme key from the semantic palette (e.g. `"primary"`, `"success"`, `"danger"`). |
| `size` | `SizesTypes` | `"md"` | Chip size. Valid values: `"sm"`, `"md"`, `"lg"`. |
| `variant` | `"filled" \| "outlined" \| "soft"` | `"soft"` | Visual style. Valid values: `"soft"`, `"filled"`, `"outlined"`. |
| `icon` | `React.ReactNode` | — | Icon rendered before the label. |
| `removable` | `boolean` | `false` | Shows a remove (X) button at the end of the chip. |
| `onRemove` | `() => void` | — | Callback fired when the remove button is pressed. |
| `onClick` | `() => void` | — | Makes the chip clickable (filter/toggle usage). |
| `selected` | `boolean` | `false` | Highlights the chip as selected, using the `color` palette. |
| `disabled` | `boolean` | `false` | Disables all chip interactions and reduces opacity. |
| `className` | `string` | — | Additional CSS classes for the chip element. |

`*` = obligatorio.

#### `ITDivider`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/divider/divider.tsx`
- **Qué es:** Horizontal or vertical separator line. Renders a thin full-width (horizontal) or full-height (vertical) bar using Tailwind utility classes. Supports custom color and thickness overrides.

```tsx
```tsx
<ITDivider />
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `orientation` | `DividerOrientation` | `"horizontal"` | Layout direction. |
| `className` | `string` | — | Additional CSS classes for the divider element. |
| `color` | `string` | `"bg-slate-200 dark:bg-slate-700"` | Tailwind background color class(es). |
| `thickness` | `string` | — | Tailwind width/height utility (e.g. "h-px", "h-1", "w-px"). Auto-set based on orientation if omitted. |

`*` = obligatorio.

#### `ITFlex`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/flex/flex.tsx`
- **Qué es:** A complete flexbox container with all alignment and spacing options.

```tsx
<ITFlex direction="row" justify="between" align="center" gap={4}>
  <div>Left</div>
  <div>Right</div>
</ITFlex>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `children` | `React.ReactNode` | — | Child elements to render inside the flex container |
| `direction` | `FlexDirection` | — | Main axis direction: "row" \| "column" \| "row-reverse" \| "column-reverse" |
| `align` | `FlexAlign` | — | Cross-axis alignment: "start" \| "end" \| "center" \| "stretch" \| "baseline" |
| `justify` | `FlexJustify` | — | Main-axis justification: "start" \| "end" \| "center" \| "between" \| "around" \| "evenly" |
| `wrap` | `FlexWrap` | — | Wrapping behavior: "nowrap" \| "wrap" \| "wrap-reverse" |
| `gap` | `number` | — | Gap between children in units of 0.25rem |
| `grow` | `number \| boolean` | — | Flex grow factor. Pass `true` for 1, `false` for 0, or a number |
| `shrink` | `number \| boolean` | — | Flex shrink factor. Pass `true` for 1, `false` for 0, or a number |
| `basis` | `string \| number` | — | Flex basis value. Numbers are multiplied by 0.25rem; strings used as-is |
| `className` | `string` | — | Additional CSS classes |
| `style` | `React.CSSProperties` | — | Inline styles |
| `as` | `React.ElementType` | — | Custom HTML element type to render instead of the default `div` |
| `onClick` | `(e: React.MouseEvent) => void` | — | Click handler |

`*` = obligatorio.

#### `ITGrid`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/grid/grid.tsx`
- **Qué es:** Responsive 12-column CSS grid layout system. Renders as a grid container when `container` is true, as a column-spanning item when `item` is true. Supports breakpoint-aware column spans and configurable spacing between items.

```tsx
<ITGrid container columns={12} spacing={4}>
  <ITGrid item xs={12} md={6}>Sidebar</ITGrid>
  <ITGrid item xs={12} md={6}>Content</ITGrid>
</ITGrid>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `children` | `React.ReactNode` | — | Child elements |
| `container` | `boolean` | — | Render as a grid container (CSS grid parent) |
| `item` | `boolean` | — | Render as a grid item (CSS grid child). If neither `container` nor `item` is set, renders a plain div |
| `spacing` | `number` | — | Gap between grid children in units of 0.25rem. Only applies when `container` is true |
| `columns` | `number` | — | Number of grid columns (1-12). Only applies when `container` is true |
| `xs` | `number` | — | Column span at the base breakpoint (mobile). Falls back to `sm` if not set |
| `sm` | `number` | — | Column span at the `sm` breakpoint |
| `md` | `number` | — | Column span at the `md` breakpoint |
| `lg` | `number` | — | Column span at the `lg` breakpoint |
| `xl` | `number` | — | Column span at the `xl` breakpoint |
| `className` | `string` | — | Additional CSS classes |
| `style` | `React.CSSProperties` | — | Inline styles |
| `as` | `React.ElementType` | — | Custom HTML element type to render instead of the default `div` |

`*` = obligatorio.

#### `ITImage`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/image/image.tsx`
- **Qué es:** Image component with automatic fallback on load error. Displays the primary `src` image and gracefully switches to the `fallback` image if loading fails.

```tsx
<ITImage
  src="https://example.com/photo.jpg"
  fallback="/images/placeholder.png"
  alt="User photo"
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `src` **\*** | `string` | — | Source URL of the image |
| `alt` | `string` | — | Alt text for accessibility |
| `className` | `string` | — | Additional CSS classes |
| `fallback` | `string` | — | Fallback image URL shown when the primary `src` fails to load |
| `onClick` | `() => void` | — | Click handler |

`*` = obligatorio.

#### `ITInput`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/input/input.tsx`
- **Qué es:** Text input component with label, validation error display, icon slots, and helper text. Supports text, password, email, number (with currency and thousand formatting), checkbox, radio, and textarea types.

```tsx
<ITInput
  name="email"
  label="Email Address"
  type="email"
  placeholder="you@example.com"
  value={email}
  onChange={handleChange}
  error={errors.email}
  required
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `name` **\*** | `string` | — | Field name used for form identification |
| `type` | `"number" \| "checkbox" \| "radio" \| "textarea" \| "text" \| "password" \| "email"` | — | Input type: "text" \| "password" \| "number" \| "email" \| "checkbox" \| "radio" \| "textarea" |
| `label` | `string` | — | Label displayed above the input |
| `currencyFormat` | `boolean` | — | Enable currency formatting for number inputs (MX locale) |
| `decimals` | `number` | `currencyFormat ? 2 : 0` | Decimal places allowed for number inputs. `0` restricts to integers. |
| `placeholder` | `string` | — | Placeholder text |
| `value` | `any` | — | Current input value |
| `onChange` **\*** | `(event: any) => void` | — | Change event handler |
| `onBlur` | `(event: React.FocusEvent<HTMLInputElement> \| React.FocusEvent<HTMLTextAreaElement, Element>) => void` | — | Blur event handler |
| `onKeyDown` | `(event: React.KeyboardEvent) => void` | — | Keydown event handler |
| `showHintLength` | `boolean` | — | Show character count hint below the input |
| `maxLength` | `number` | — | Maximum allowed character length |
| `minLength` | `number` | — | Minimum allowed character length |
| `variant` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | — | Color variant from the theme palette |
| `size` | `SizesTypes` | `"md"` | Size preset: "sm" \| "md" \| "lg". |
| `disabled` | `boolean` | — | Disable the input |
| `containerClassName` | `string` | — | Additional CSS classes for the outer container |
| `labelClassName` | `string` | — | Additional CSS classes for the label |
| `className` | `string` | — | Additional CSS classes for the input element |
| `touched` | `boolean` | — | Whether the field has been touched by the user |
| `error` | `string \| boolean` | — | Validation error message. Pass `true` for a generic error, or a string for a custom message |
| `required` | `boolean` | — | Mark the field as required |
| `formatNumber` | `boolean` | — | Enable number formatting on blur |
| `autoFocus` | `boolean` | — | Auto-focus the input on mount |
| `focusContent` | `boolean` | — | Select all content on click |
| `onClick` | `() => void` | — | Click handler for the input |
| `iconLeft` | `React.ReactNode` | — | Icon element rendered on the left side of the input |
| `iconRight` | `React.ReactNode` | — | Icon element rendered on the right side of the input |
| `checked` | `boolean` | — | Checked state for checkbox and radio types |
| `rows` | `number` | — | Number of visible rows for textarea type |
| `min` | `number` | — | Minimum numeric value for number inputs |
| `max` | `number` | — | Maximum numeric value for number inputs |
| `readOnly` | `boolean` | — | Render the input in read-only mode |

`*` = obligatorio.

#### `ITInputNumber`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/input-number/input-number.tsx`
- **Qué es:** Numeric field that always renders currency-style formatting (thousand separators + fixed decimals) and emits a real `number`. Built on top of `ITInput`: it is the same field, but `onChange`/`onBlur` already receive the parsed value, so consumers can do math directly instead of converting strings first.

```tsx
```tsx
<ITInputNumber
  name="amount"
  label="Monto"
  value={amount}
  prefix="$"
  onChange={(value) => setAmount(value)}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `name` **\*** | `string` | — | Field name used for form identification. |
| `value` | `number` | — | Current numeric value. Pass `null`/`undefined` for "empty". |
| `onChange` **\*** | `(value: number \| undefined, event: React.ChangeEvent<HTMLInputElement>) => void` | — | Called with the parsed value on every change. Receives `undefined` when the field is empty, plus the original input event. |
| `onBlur` | `(value: number \| undefined, event: React.FocusEvent<HTMLInputElement>) => void` | — | Called on blur with the parsed (and min/max clamped) value, plus the original focus event. |
| `decimals` | `number` | `2` | Number of decimal places allowed. `0` restricts to integers. |
| `prefix` | `string` | — | Text prefix rendered inside the field, e.g. `"$"`. Ignored when `iconLeft` is set. |
| `label` | `string` | — | Label displayed above the input. |
| `placeholder` | `string` | — | Placeholder text. |
| `min` | `number` | — | Minimum numeric value. Values below are clamped on blur. |
| `max` | `number` | — | Maximum numeric value. Values above are clamped on blur. |
| `size` | `SizesTypes` | `"md"` | Size preset: "sm" \| "md" \| "lg". |
| `disabled` | `boolean` | `false` | Disable the input. |
| `readOnly` | `boolean` | `false` | Render the input in read-only mode. |
| `required` | `boolean` | `false` | Mark the field as required. |
| `touched` | `boolean` | — | Whether the field has been touched by the user. |
| `error` | `string \| boolean` | — | Validation error. Pass `true` for a generic message, or a string for a custom one. |
| `iconLeft` | `React.ReactNode` | — | Icon element rendered on the left side of the input. Takes precedence over `prefix`. |
| `iconRight` | `React.ReactNode` | — | Icon element rendered on the right side of the input. |
| `containerClassName` | `string` | — | Additional CSS classes for the outer container. |
| `labelClassName` | `string` | — | Additional CSS classes for the label. |
| `className` | `string` | — | Additional CSS classes for the input element. |
| `autoFocus` | `boolean` | `false` | Auto-focus the input on mount. |
| `focusContent` | `boolean` | `false` | Select all content on click. |
| `onKeyDown` | `(event: React.KeyboardEvent<HTMLInputElement>) => void` | — | Keydown handler for the underlying input. |

`*` = obligatorio.

#### `ITLoader`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/loader/loader.tsx`
- **Qué es:** Loading indicators with multiple animation types: spinner, dots, pulse, and bar. Supports configurable size, color (theme semantic or custom), and inline/padded rendering.

```tsx
<ITLoader variant="spinner" size="lg" color="primary" />
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `size` | `LoaderSize` | — | Loader size: "sm" \| "md" \| "lg" \| "xl" |
| `variant` | `LoaderVariant` | — | Animation variant: "spinner" \| "dots" \| "bar" \| "pulse" |
| `color` | `string` | — | Color value. Can be a theme semantic color key, hex string, rgb string, or CSS class |
| `className` | `string` | — | Additional CSS classes |

`*` = obligatorio.

#### `ITPopover`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/popover/popover.tsx`
- **Qué es:** Floating content panel triggered by click on a trigger element, with position control and click-outside dismissal.

```tsx
```tsx
<ITPopover trigger={<ITButton label="Options" />} position="bottom">
  <ul>
    <li><button onClick={handleEdit}>Edit</button></li>
    <li><button onClick={handleDelete}>Delete</button></li>
  </ul>
</ITPopover>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `trigger` **\*** | `React.ReactNode` | — | Element that triggers the popover when clicked. |
| `children` **\*** | `React.ReactNode` | — | Content rendered inside the popover panel. |
| `position` | `PopoverPosition` | — | Position of the popover relative to the trigger. Options: "top", "bottom", "left", "right". Default: "bottom". |
| `isOpen` | `boolean` | — | Controlled open state. When provided, the component acts in controlled mode. |
| `onClose` | `() => void` | — | Callback fired when the popover is closed in controlled mode. |
| `className` | `string` | — | Additional CSS classes for the container. |

`*` = obligatorio.

#### `ITProgress`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/progress/progress.tsx`
- **Qué es:** Progress bar indicator with support for determinate and indeterminate variants, themed colors, and multiple sizes.

```tsx
```tsx
<ITProgress value={75} max={100} color="success" size="lg" />
<ITProgress variant="indeterminate" color="primary" />
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `value` | `number` | — | Current progress value. Default: 0. |
| `max` | `number` | — | Maximum progress value. Default: 100. |
| `variant` | `"determinate" \| "indeterminate"` | — | Progress variant. "determinate" shows a fixed-width fill, "indeterminate" shows an animated pulsing bar. Default: "determinate". |
| `color` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | — | Semantic color from the theme. Options: primary, secondary, success, danger, warning, info, purple, error, gray. Default: "primary". |
| `size` | `"sm" \| "md" \| "lg"` | — | Size of the progress bar. Options: "sm", "md", "lg". Default: "md". |
| `className` | `string` | — | Additional CSS classes for the container. |
| `style` | `React.CSSProperties` | — | Inline styles applied to the container. |

`*` = obligatorio.

#### `ITRadioGroup`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/radio/radio.tsx`
- **Qué es:** Radio button group with configurable layout direction and themed selection styling.

```tsx
```tsx
<ITRadioGroup
  name="color"
  value={selectedColor}
  onChange={(value) => setSelectedColor(value)}
  options={[
    { value: 'red', label: 'Red' },
    { value: 'blue', label: 'Blue' },
    { value: 'green', label: 'Green' },
  ]}
  direction="row"
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `name` **\*** | `string` | — | Name attribute for the radio input group. Used for form accessibility. |
| `value` **\*** | `string` | — | Currently selected value. |
| `onChange` **\*** | `(value: string) => void` | — | Callback fired when a radio option is selected. Receives the selected value. |
| `options` **\*** | `ITRadioOption[]` | — | Array of radio options to render. |
| `disabled` | `boolean` | — | Whether the entire radio group is disabled. |
| `direction` | `"column" \| "row"` | — | Layout direction of the radio options. Options: "row", "column". Default: "column". |
| `className` | `string` | — | Additional CSS classes for the container. |

`*` = obligatorio.

#### `ITSegmentedControl`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/segmented-control/segmented-control.tsx`
- **Qué es:** iOS-style segmented toggle for switching between mutually exclusive options.

```tsx
```tsx
<ITSegmentedControl
  options={[
    { value: "day", label: "Day" },
    { value: "week", label: "Week", icon: <FaCalendar /> },
  ]}
  value={view}
  onChange={setView}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `options` **\*** | `ISegmentedOption[]` | — | Array of mutually exclusive options: { label, value, icon? }. |
| `value` **\*** | `string` | — | Currently selected value (controlled). |
| `onChange` **\*** | `(value: string) => void` | — | Callback fired when the user selects a different option. Receives the new value. |
| `size` | `SegmentedControlSize` | — | Control size: "sm" \| "md". Default: "md". |
| `className` | `string` | — | Additional CSS classes on the container. |
| `disabled` | `boolean` | — | Whether the entire control is disabled. |

`*` = obligatorio.

#### `ITSkeleton`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/skeleton/skeleton.tsx`
- **Qué es:** Content placeholder loader with pulse animation for text, circles, and rectangles.

```tsx
```tsx
<ITSkeleton variant="circular" width={40} height={40} />
<ITSkeleton variant="text" count={3} />
<ITSkeleton variant="rectangular" width="100%" height={200} />
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `variant` | `SkeletonVariant` | — | Skeleton shape: "text" \| "circular" \| "rectangular". Default: "text". |
| `width` | `string \| number` | — | Explicit width (CSS value or number in px). Text variant defaults to random 60%-90%. |
| `height` | `string \| number` | — | Explicit height (CSS value or number in px). |
| `count` | `number` | — | Number of skeleton items to render. Default: 1. |
| `className` | `string` | — | Additional CSS classes on each skeleton item. |
| `style` | `React.CSSProperties` | — | Inline style object applied to each skeleton item. |

`*` = obligatorio.

#### `ITSlider`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/slider/slider.tsx`
- **Qué es:** Range slider control with min/max/step and optional label displaying the current value.

```tsx
```tsx
<ITSlider
  label="Volume"
  value={volume}
  onChange={setVolume}
  min={0}
  max={100}
  step={5}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `value` **\*** | `number` | — | Current slider value (controlled). |
| `onChange` **\*** | `(value: number) => void` | — | Callback fired when the value changes. Receives the new numeric value. |
| `min` | `number` | — | Minimum allowed value. Default: 0. |
| `max` | `number` | — | Maximum allowed value. Default: 100. |
| `step` | `number` | — | Step increment. Default: 1. |
| `label` | `string` | — | Label displayed above the slider. Also shows the current value. |
| `disabled` | `boolean` | — | Whether the slider is disabled. |
| `className` | `string` | — | Additional CSS classes on the container. |

`*` = obligatorio.

#### `ITSlideToggle`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/slide/slide.tsx`
- **Qué es:** iOS-style toggle switch with theme color support. Supports fully controlled (`isOn`) or uncontrolled (`initialState`) modes.

```tsx
```tsx
// Controlled
<ITSlideToggle isOn={enabled} onToggle={setEnabled} activeColor="primary" />

// Uncontrolled with initial state
<ITSlideToggle initialState onToggle={(v) => console.log(v)} />
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `onToggle` | `(value: boolean) => void` | — | Callback executed when the switch is toggled. Receives the new boolean state. |
| `isOn` | `boolean` | — | Controlled state. Use this to fully control the component externally. |
| `initialState` | `boolean` | — | Initial state for uncontrolled usage. Default: false. |
| `activeColor` | `string` | — | Semantic theme color when activated (e.g. "primary", "success", "danger"). Can also be a hex value. Default: "success". |
| `inactiveColor` | `string` | — | Semantic theme color or hex value when deactivated. Default: '#9ca3af' (gray-400). |
| `disabled` | `boolean` | — | Whether the switch is disabled. |
| `size` | `"sm" \| "md" \| "lg"` | — | Size of the switch: "sm" \| "md" \| "lg". Default: "md". |
| `label` | `string` | — | Texto visible del interruptor. Se asocia al control como nombre accesible (`aria-label`) cuando no hay un `<label>` externo que lo nombre. |
| `ariaLabel` | `string` | — | Nombre accesible cuando la etiqueta visible vive fuera del componente. Tiene prioridad sobre `label`. |
| `className` | `string` | — | Additional CSS classes on the container. |

`*` = obligatorio.

#### `ITStack`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/stack/stack.tsx`
- **Qué es:** Simplified flex stack with consistent spacing (gap) for arranging children in a row or column. Supports an optional divider element between children.

```tsx
```tsx
<ITStack direction="row" spacing={4} alignItems="center">
  <ITButton>Cancel</ITButton>
  <ITButton variant="primary">Save</ITButton>
</ITStack>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `children` | `React.ReactNode` | — | Stack children elements. |
| `direction` | `StackDirection` | — | Flex direction. Default: "column". |
| `spacing` | `number` | — | Spacing between children in 0.25rem units (0–12). Default: 0. |
| `alignItems` | `StackAlignment` | — | Cross-axis alignment. |
| `justifyContent` | `StackJustify` | — | Main-axis justification. |
| `flexWrap` | `StackWrap` | — | Whether children should wrap. |
| `divider` | `React.ReactNode` | — | Optional divider element inserted between children. |
| `className` | `string` | — | Additional CSS classes on the container. |
| `style` | `React.CSSProperties` | — | Inline styles on the container. |
| `as` | `React.ElementType` | — | HTML element type to render as. Default: "div". |

`*` = obligatorio.

#### `ITText`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/text/text.tsx`
- **Qué es:** Semantic typography wrapper that renders any HTML element. Supports muted styling via the `muted` prop and passes through all standard HTML attributes.

```tsx
<ITText as="h1" className="text-2xl font-bold">Welcome</ITText>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `children` | `React.ReactNode` | — | The content rendered inside the element. |
| `className` | `string` | — | Additional CSS classes applied to the element. |
| `as` | `React.ElementType` | — | HTML element type to render (e.g. "p", "span", "h1", "label"). |
| `muted` | `boolean` | — | Applies muted text color (--color-text-muted) when true. |
| `htmlFor` | `string` | — | Associates a label with a form element (rendered as `htmlFor` when `as` is "label"). |
| `style` | `React.CSSProperties` | — | — |

`*` = obligatorio.

#### `ITTextarea`

- **Capa:** Atoms
- **Fuente:** `src/components/atoms/textarea/textarea.tsx`
- **Qué es:** Multi-line text input with optional label, validation error display, character limit, and configurable resize behavior.

```tsx
<ITTextarea
  name="bio"
  label="Biography"
  value={bio}
  onChange={setBio}
  maxLength={500}
  rows={6}
  resize="vertical"
  error={bio.length > 500 ? "Max 500 characters" : undefined}
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `value` | `string` | — | Controlled value of the textarea. |
| `onChange` | `(value: string) => void` | — | Callback fired when the value changes, receiving the new string. |
| `label` | `string` | — | Label text rendered above the textarea. |
| `placeholder` | `string` | — | Placeholder text shown when the textarea is empty. |
| `rows` | `number` | — | Number of visible text rows (default 4). |
| `disabled` | `boolean` | — | Disables the textarea when true. |
| `error` | `string` | — | Validation error message displayed below the textarea. |
| `className` | `string` | — | Additional CSS classes for the wrapper. |
| `name` | `string` | — | Name attribute for form submission and label association via `htmlFor`. |
| `maxLength` | `number` | — | Maximum number of characters allowed. |
| `resize` | `"none" \| "both" \| "horizontal" \| "vertical"` | — | Resize behavior of the textarea: "none" \| "vertical" \| "horizontal" \| "both". |

`*` = obligatorio.

### Molecules

#### `ITAccordion`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/accordion/accordion.tsx`
- **Qué es:** Collapsible sections for FAQs, settings panels, and long content. Works uncontrolled (`defaultOpenIds`) or controlled (`openIds` + `onChange`). Supports single-open (default) or multiple-open mode, and animates the body with a CSS grid-rows transition (no JS height measurement).

```tsx
<ITAccordion
  items={[
    { id: "a", title: "¿Qué es AXZY?", content: "Un sistema de componentes." },
    { id: "b", title: "¿Cómo instalo?", content: "pnpm add
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `items` **\*** | `ITAccordionItem[]` | — | Sections to render. |
| `allowMultiple` | `boolean` | `false` | Allows more than one section open at the same time. |
| `defaultOpenIds` | `string[]` | — | Ids open on first render (uncontrolled mode). |
| `openIds` | `string[]` | — | Controlled list of open ids. When provided, the component is controlled. |
| `onChange` | `(openIds: string[]) => void` | — | Fired with the next list of open ids whenever a section toggles. |
| `variant` | `"default" \| "separated" \| "bordered"` | `"separated"` | Visual style. Valid values: `"default"`, `"separated"`, `"bordered"`. |
| `className` | `string` | — | Additional CSS classes for the wrapper. |
| `itemClassName` | `string` | — | Additional CSS classes applied to every item. |

`*` = obligatorio.

#### `ITAlert`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/alert/alert.tsx`
- **Qué es:** Dismissible alert banner with 4 visual variants and optional custom icon.

```tsx
<ITAlert variant="success" title="Success" dismissible onDismiss={() => {}}>
  Operation completed successfully.
</ITAlert>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `variant` | `AlertVariant` | `"info"` | Alert visual style. Valid values: `"info"`, `"success"`, `"warning"`, `"error"`. |
| `title` | `string` | — | Optional bold title text displayed above the message. |
| `children` | `React.ReactNode` | — | Alert message content. |
| `dismissible` | `boolean` | `false` | Whether the alert can be dismissed by the user. |
| `onDismiss` | `() => void` | — | Callback fired when the dismiss button is clicked. |
| `icon` | `React.ReactNode` | — | Custom icon element. Overrides the default variant icon. |
| `className` | `string` | — | Additional CSS class names for the alert container. |

`*` = obligatorio.

#### `ITBreadcrumbs`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/breadcrumbs/breadcrumbs.tsx`
- **Qué es:** Navigation breadcrumb trail with automatic link/button rendering and custom separator.

```tsx
<ITBreadcrumbs
  items={[
    { label: "Home", href: "/" },
    { label: "Products", href: "/products" },
    { label: "Details" },
  ]}
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `items` **\*** | `ITBreadcrumbItem[]` | — | Ordered array of breadcrumb items. The last item is rendered as plain text (current page). |
| `separator` | `React.ReactNode` | `<FaChevronRight size={10} />` | Custom separator element rendered between items. |
| `className` | `string` | — | Additional CSS class names for the `<nav>` container. |

`*` = obligatorio.

#### `ITCalendar`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/calendar/calendar.tsx`
- **Qué es:** Full-featured calendar and date picker with week/day/month views, event display, range selection, and drag-to-select.

```tsx
<ITCalendar mode="month" onChange={(date) => console.log(date)} variant="primary" />
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `events` | `CalendarEvent[]` | — | Array of calendar events to display in the scheduler view. |
| `mode` | `"week" \| "day" \| "month"` | — | Display mode. Valid values: `"week"`, `"day"`, `"month"`. Auto-detected as `"month"` when `onChange` is provided. |
| `onEventClick` | `(event: CalendarEvent) => void` | — | Callback fired when an event is clicked. |
| `onSlotClick` | `(date: Date) => void` | — | Callback fired when an empty time slot is clicked. |
| `onSlotHover` | `(date: Date) => void` | — | Callback fired when the mouse enters a time slot. |
| `onSelectRange` | `(start: Date, end: Date) => void` | — | Callback fired when a time range is selected via drag. |
| `value` | `Date` | — | Currently selected date (date picker mode). |
| `onChange` | `(date: Date) => void` | — | Callback fired when a date is selected in picker mode. |
| `selectionMode` | `"range" \| "single"` | `"single"` | Selection mode for the date picker. Valid values: `"single"`, `"range"`. |
| `startDate` | `Date` | — | Start date for range selection. |
| `endDate` | `Date` | — | End date for range selection. |
| `minDate` | `Date` | — | Minimum selectable date (dates before this are disabled). |
| `maxDate` | `Date` | — | Maximum selectable date (dates after this are disabled). |
| `className` | `string` | — | Additional CSS class names for the calendar container. |
| `disabled` | `boolean` | `false` | Whether the calendar is in a disabled state. |
| `variant` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | `"primary"` | Accent color theme for selection highlights. Uses semantic color keys. |

`*` = obligatorio.

#### `ITCard`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/card/card.tsx`
- **Qué es:** Versatile card container with optional image, title, body content, and action footer. Supports interactive hover states.

```tsx
<ITCard title="Welcome" image="/hero.jpg" actions={<ITButton label="Learn more" />}>
  This is the card content.
</ITCard>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `onClick` | `() => void` | — | Click handler. When provided, the card becomes interactive with hover shadow effect. |
| `title` | `string` | — | Card title displayed in the header area. |
| `image` | `string` | — | Image source URL displayed at the top of the card. |
| `alt` | `string` | `"Card Image"` | Alt text for the card image. |
| `children` | `React.ReactNode` | — | Card body content. Rendered below the title. |
| `actions` | `React.ReactNode` | — | Action elements rendered in a footer section separated by a border. |
| `className` | `string` | — | Additional CSS class names for the card container. |
| `imageClassName` | `string` | — | Additional CSS class names for the image element. |
| `titleClassName` | `string` | — | Additional CSS class names for the title element. |
| `contentClassName` | `string` | — | Additional CSS class names for the content wrapper. |
| `actionClassName` | `string` | — | Additional CSS class names for the actions footer. |

`*` = obligatorio.

#### `ITChipInput`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/chip-input/chip-input.tsx`
- **Qué es:** Free-text input that turns entered values into removable tags (chips). Commits a tag on `Enter`/`,` (configurable via `delimiters`), on blur, or on paste of delimited text. Supports `maxTags`, dedupe control, and per-tag validation.

```tsx
<ITChipInput
  label="Etiquetas"
  value={tags}
  onChange={setTags}
  placeholder="Agrega una etiqueta..."
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `name` | `string` | — | Name attribute for form integrations. |
| `label` | `string` | — | Label displayed above the control. |
| `placeholder` | `string` | `"Escribe y presiona Enter"` | Placeholder for the text input. |
| `value` **\*** | `string[]` | — | Current list of tags (controlled). |
| `onChange` | `(values: string[]) => void` | — | Fired with the next list of tags. |
| `onBlur` | `(e: React.FocusEvent<HTMLInputElement>) => void` | — | Fired when the control loses focus. |
| `delimiters` | `string[]` | `["Enter", ","]` | Keys that commit the current text as a tag. |
| `maxTags` | `number` | — | Maximum number of tags allowed. |
| `allowDuplicates` | `boolean` | `false` | Allows duplicated tags. |
| `validate` | `(value: string) => string \| undefined` | — | Returns an error string to reject the tag, or undefined if valid. |
| `color` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | `"primary"` | Color applied to the tag chips. |
| `size` | `SizesTypes` | `"md"` | Control size. Valid values: `"sm"`, `"md"`, `"lg"`. |
| `disabled` | `boolean` | `false` | Disables the control. |
| `required` | `boolean` | `false` | Marks the field as required (red asterisk). |
| `touched` | `boolean` | — | Whether the field has been touched (form validation). |
| `error` | `string \| boolean` | — | Error message or boolean indicating an error state. |
| `helpText` | `string` | — | Helper text shown below the control when there is no error. |
| `className` | `string` | — | Additional CSS classes for the container. |

`*` = obligatorio.

#### `ITDatePicker`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/date-picker/datePicker.tsx`
- **Qué es:** Date picker component with single-date and date-range modes. Supports manual text input (DD/MM/YYYY format) and a calendar popover. In range mode the user selects a start date then an end date; the calendar highlights the interval. Position-aware popover flips above the input when near the bottom of the viewport.

```tsx
```tsx
<ITDatePicker
  name="birthDate"
  label="Date of birth"
  value={date}
  onChange={(e) => setDate(e.target.value)}
  maxDate={new Date()}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `name` **\*** | `string` | — | Unique name attribute for the underlying input element. |
| `value` | `Date \| [Date, Date]` | — | Selected date. Accepts a single Date or a tuple `[startDate, endDate]` when `range` is true. |
| `onChange` **\*** | `(event: React.ChangeEvent<HTMLInputElement> \| { target: { name: string; value: Date \| [Date \| null, Date \| null]; }; }) => void` | — | Called when the selected date changes. The event object carries `name` and `value` in its target. |
| `onBlur` | `(event: React.FocusEvent<HTMLInputElement> \| { target: { name: string; value: Date \| [Date \| null, Date \| null]; }; }) => void` | — | Called when the input loses focus. |
| `range` | `boolean` | `false` | Enables date-range selection mode. When true, `value` is treated as a start-end tuple. |
| `variant` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | `"primary"` | Color variant matching the design system (ColorsTypes). |
| `size` | `SizesTypes` | `"md"` | Size preset: "sm" \| "md" \| "lg". |
| `className` | `string` | — | Additional CSS classes for the wrapper element. |
| `calendarClassName` | `string` | — | Additional CSS classes for the calendar popover. |
| `disabled` | `boolean` | `false` | Disables the date picker. |
| `placeholder` | `string` | — | Placeholder text shown when no date is selected. |
| `label` | `string` | — | Accessible label rendered above the input. |
| `required` | `boolean` | — | Marks the field as required. |
| `touched` | `boolean` | — | Visually indicates the field has been interacted with. |
| `error` | `string \| boolean` | — | Error state — pass a string message or `true` for default styling. |
| `minDate` | `Date` | — | Earliest selectable date. |
| `maxDate` | `Date` | — | Latest selectable date. |

`*` = obligatorio.

#### `ITDropdownMenu`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/dropdown-menu/dropdown-menu.tsx`
- **Qué es:** Action menu with keyboard navigation and ARIA menu semantics. Renders the menu through a portal so it escapes `overflow: hidden` and transformed ancestors, and flips above the trigger when there is no room below.

```tsx
<ITDropdownMenu
  items={[
    { id: "edit", label: "Editar", icon: <FaEdit />, onClick: edit },
    { id: "delete", label: "Eliminar", icon: <FaTrash />, danger: true, divider: true, onClick: remove },
  ]}
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `items` **\*** | `ITDropdownMenuItem[]` | — | Menu actions. |
| `trigger` | `React.ReactNode` | — | Custom trigger content. Defaults to a vertical ellipsis icon. |
| `triggerLabel` | `string` | `i18n `dropdownMenu.open` ("Abrir menú")` | Accessible label for the trigger button. |
| `placement` | `"bottom-start" \| "bottom-end" \| "top-start" \| "top-end"` | `"bottom-end"` | Placement of the menu relative to the trigger. Valid values: `"bottom-start"`, `"bottom-end"`, `"top-start"`, `"top-end"`. |
| `onSelect` | `(id: string, item: ITDropdownMenuItem) => void` | — | Fired after an item is activated, with its id and definition. |
| `disabled` | `boolean` | `false` | Disables the trigger. |
| `className` | `string` | — | Additional CSS classes for the trigger button. |
| `menuClassName` | `string` | — | Additional CSS classes for the menu panel. |

`*` = obligatorio.

#### `ITEmptyState`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/empty-state/empty-state.tsx`
- **Qué es:** Placeholder display for empty data sets. Shows a large icon, a title, an optional description, and an optional call-to-action element (usually a button). Centered vertically and horizontally within its container.

```tsx
```tsx
<ITEmptyState
  title="No results found"
  description="Try adjusting your search or filters."
  action={<ITButton label="Clear filters" variant="outlined" onClick={clearFilters} />}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `icon` | `React.ReactNode` | `<FaInbox size={40} />` | Icon or illustration displayed above the title. |
| `title` **\*** | `string` | — | Primary heading text (required). |
| `description` | `string` | — | Secondary explanatory text shown below the title. |
| `action` | `React.ReactNode` | — | Action element (typically a button) rendered below the description. |
| `className` | `string` | — | Additional CSS classes for the wrapper element. |

`*` = obligatorio.

#### `ITField`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/field/field.tsx`
- **Qué es:** Form-field wrapper that standardizes label, required marker, helper text, and error message around any control. Keeps spacing and error styling consistent across forms so each control does not re-implement label/error logic.

```tsx
<ITField label="Email" htmlFor="email" required error={errors.email} helpText="We never share it.">
  <ITInput name="email" value={email} onChange={onChange} />
</ITField>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `label` | `string` | — | Label rendered above the control. |
| `htmlFor` | `string` | — | `id` of the control the label points to (`htmlFor`). |
| `required` | `boolean` | `false` | Shows a red asterisk next to the label. |
| `error` | `string \| boolean` | — | Validation error. Pass `true` for the generic message or a string for a custom one. |
| `helpText` | `string` | — | Helper text shown below the control when there is no error. |
| `children` **\*** | `React.ReactNode` | — | The form control (ITInput, ITSelect, ITTextarea, …). |
| `className` | `string` | — | Additional CSS classes for the wrapper. |
| `labelClassName` | `string` | — | Additional CSS classes for the label. |
| `contentClassName` | `string` | — | Additional CSS classes for the control container. |

`*` = obligatorio.

#### `ITFormHeader`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/form-header/form-header.tsx`
- **Qué es:** Colored header bar for modals and forms with an optional close button. Uses the theme's primary color as the background and automatically calculates a contrasting text color for readability.

```tsx
<ITFormHeader title="Create User" onClose={() => setOpen(false)} />
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `title` **\*** | `string` | — | Header title text |
| `onClose` | `() => void` | — | Optional close button click handler. If omitted, no close button is rendered |
| `className` | `string` | — | Additional CSS classes |

`*` = obligatorio.

#### `ITLineBarChart`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/line-bar-chart/line-bar-chart.tsx`
- **Qué es:** Barras + línea en SVG puro (sin librería de gráficas). Pensado para comparar dos series por periodo —ingresos contra gastos, cobrado contra proyectado—: las barras van al fondo y la línea con su área encima, con tooltip al pasar el cursor. El SVG escala con `viewBox`, así que el trazo y el texto no se deforman al cambiar el ancho del contenedor.

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `data` **\*** | `ITLineBarDatum[]` | — | — |
| `ariaLabel` **\*** | `string` | — | Etiqueta accesible del gráfico. |
| `lineLabel` | `string` | `i18n `lineBarChart.lineLabel` ("Serie A")` | Nombre de la serie de la línea (leyenda y tooltip). |
| `barLabel` | `string` | `i18n `lineBarChart.barLabel` ("Serie B")` | Nombre de la serie de barras (leyenda y tooltip). |
| `lineColor` | `string` | — | Color de la línea (por defecto el verde de la casa). |
| `barColor` | `string` | — | Color de las barras. |
| `height` | `number` | — | — |
| `formatValue` | `(value: number) => string` | — | Formatea los valores del tooltip; por defecto número con separadores. |
| `formatAxis` | `(value: number) => string` | — | Texto del eje Y; por defecto número compacto. |
| `className` | `string` | — | — |

`*` = obligatorio.

#### `ITMaskedInput`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/masked-input/masked-input.tsx`
- **Qué es:** Text input that applies a formatting mask while the user types, exposing only the clean (raw) value through `onChange`. The mask is defined by a pattern string. Tokens are filled by the user and any other character acts as an auto-inserted literal separator. Empty slots are painted with `placeholderChar`, so the mask is always visible.

```tsx
```tsx
<ITMaskedInput
  name="code"
  mask="xxxx-xxxx-xxxx"
  label="Código"
  onChange={(e) => setCode(e.target.value)}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `name` **\*** | `string` | — | Unique name attribute for the underlying input element. |
| `mask` **\*** | `string` | — | Mask pattern. Tokens are filled by the user and everything else is an auto-inserted literal. - `9` — digit - `A` — letter (stored uppercase) - `a` — letter - `x` — alphanumeric - `*` — any character - any other character ( `-`, `/`, `(`, `)`, ` `, `.` ) is a literal separator |
| `value` | `string` | — | Clean value containing only the useful characters (no separators, no placeholders). |
| `onChange` **\*** | `(event: { target: { name: string; value: string; }; }) => void` | — | Called when the masked value changes. `event.target.value` is the raw value without separators. |
| `onBlur` | `(event: React.FocusEvent<HTMLInputElement>) => void` | — | Called when the input loses focus. |
| `onComplete` | `(value: string) => void` | — | Fired when all token slots are filled with valid characters. |
| `pattern` | `RegExp` | — | Optional regex full-matched against the raw value to validate the field (e.g. `/^\\d{16}$/`). |
| `placeholderChar` | `string` | `"_"` | Character shown for empty token slots. |
| `variant` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | `"primary"` | Color variant matching the design system (ColorsTypes). |
| `size` | `SizesTypes` | `"md"` | Size preset: "sm" \| "md" \| "lg". |
| `label` | `string` | — | Label displayed above the input. |
| `disabled` | `boolean` | `false` | Disables the input. |
| `required` | `boolean` | — | Marks the field as required. |
| `touched` | `boolean` | — | Visually indicates the field has been interacted with. |
| `error` | `string \| boolean` | — | Error state — pass a string message or `true` for default styling. |
| `className` | `string` | — | Additional CSS classes for the outer wrapper element. |
| `containerClassName` | `string` | — | Additional CSS classes for the underlying input container. |
| `iconLeft` | `React.ReactNode` | — | Icon element rendered on the left side of the input. |
| `iconRight` | `React.ReactNode` | — | Icon element rendered on the right side of the input. |
| `autoFocus` | `boolean` | `false` | Auto-focus the input on mount. |

`*` = obligatorio.

#### `ITMultiSelect`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/multi-select/multi-select.tsx`
- **Qué es:** Multi-value select with searchable dropdown, removable chips, and keyboard navigation. Supports local filtering and remote search (`onSearch`), a collapsed chip summary (`maxVisibleChips`), and custom option templates (`renderOption`). The dropdown is portaled so it is never clipped by cards or overflow ancestors.

```tsx
<ITMultiSelect
  label="Skills"
  options={skills}
  value={selected}
  onChange={(values) => setSelected(values)}
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `name` | `string` | — | Name attribute for form integrations. |
| `label` | `string` | — | Label displayed above the control. |
| `placeholder` | `string` | `"Selecciona opciones"` | Placeholder shown when no value is selected. |
| `options` **\*** | `ITMultiSelectOption[]` | — | Available options. |
| `value` **\*** | `(string \| number)[]` | — | Selected values (controlled). |
| `onChange` | `(values: (string \| number)[], options: ITMultiSelectOption[]) => void` | — | Fired with the next selected values and their option objects. |
| `onBlur` | `(e: React.FocusEvent<HTMLInputElement>) => void` | — | Fired when the control loses focus. |
| `valueField` | `string` | `"value"` | Field used as the option value. |
| `labelField` | `string` | `"label"` | Field used as the option display label. |
| `disabled` | `boolean` | `false` | Disables the control. |
| `readOnly` | `boolean` | `false` | Read-only mode: chips shown, no editing. |
| `required` | `boolean` | `false` | Marks the field as required (red asterisk). |
| `touched` | `boolean` | — | Whether the field has been touched (form validation). |
| `error` | `string \| boolean` | — | Error message or boolean indicating an error state. |
| `size` | `SizesTypes` | `"md"` | Control size. Valid values: `"sm"`, `"md"`, `"lg"`. |
| `maxVisibleChips` | `number` | `3` | Maximum number of chips shown before collapsing into "+N". |
| `clearable` | `boolean` | `true` | Shows a clear-all (X) button. |
| `searchable` | `boolean` | `true` | Enables the search input inside the control. |
| `onSearch` | `(query: string) => void` | — | Callback for server-side search. Receives the query string. |
| `isLoading` | `boolean` | `false` | Whether options are loading from an external source. |
| `noResultsMessage` | `string` | `"No se encontraron resultados"` | Message shown when no options match. |
| `renderOption` | `(option: ITMultiSelectOption, state: { isSelected: boolean; searchTerm: string; }) => React.ReactNode` | — | Custom template for each dropdown option. |
| `className` | `string` | — | Additional CSS classes for the container. |

`*` = obligatorio.

#### `ITPagination`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/pagination/pagination.tsx`
- **Qué es:** Page navigation controls with previous/next buttons, page number display, and optional items-per-page selector.

```tsx
```tsx
<ITPagination
  currentPage={1}
  totalPages={10}
  onPageChange={(page) => setPage(page)}
  color="primary"
  itemsPerPageOptions={[10, 25, 50]}
  itemsPerPage={10}
  onItemsPerPageChange={(value) => setItemsPerPage(value)}
  totalItems={95}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `currentPage` **\*** | `number` | — | Current active page (1-indexed). |
| `totalPages` **\*** | `number` | — | Total number of pages available. |
| `onPageChange` **\*** | `(page: number) => void` | — | Callback fired when a page is clicked or prev/next is activated. Receives the new page number. |
| `siblingCount` | `number` | — | Number of visible page siblings before and after the current page. Default: 1. |
| `color` | `string` | — | Semantic color from the theme. Options: primary, secondary, success, danger, warning, info, purple. Default: "primary". |
| `className` | `string` | — | Additional CSS classes for the container. |
| `itemsPerPageOptions` | `number[]` | — | Available options for the items-per-page selector dropdown. |
| `itemsPerPage` | `number` | — | Current items per page value. Required if `itemsPerPageOptions` is provided. |
| `onItemsPerPageChange` | `(value: number) => void` | — | Callback fired when the items per page value is changed. |
| `totalItems` | `number` | — | Total number of items across all pages. Used to render the "1-10 of 50" summary text. |

`*` = obligatorio.

#### `ITSearchSelect`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/search-select/search-select.tsx`
- **Qué es:** Searchable dropdown select with local client-side filtering and server-side search via API.

```tsx
```tsx
// Static options (Mode 1)
<ITSearchSelect
  label="Country"
  placeholder="Select a country"
  options={[
    { value: 'us', label: 'United States' },
    { value: 'mx', label: 'Mexico' },
  ]}
  value={selectedCountry}
  onChange={(value) => setSelectedCountry(value)}
/>

// API search (Mode 2)
<ITSearchSelect
  label="User"
  placeholder="Search users..."
  onSearch={(query) => searchUsers(query)}
  options={apiResults}
  isLoading={isSearching}
  value={selectedUser}
  onChange={(value) => setSelectedUser(value)}
/>

// Custom option template + clear button
<ITSearchSelect
  label="User"
  options={users}
  value={selectedUser}
  onChange={(value) => setSelectedUser(value)}
  onClear={() => console.log("cleared")}
  renderOption={(option, { isSelected }) => (
    <span className={isSelected ? "font-bold" : ""}>{option.label}</span>
  )}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `name` | `string` | — | Name attribute for form integrations. |
| `label` | `string` | — | Label displayed above the select input. |
| `placeholder` | `string` | — | Placeholder text shown when no value is selected. |
| `value` | `string \| number` | — | Currently selected value. |
| `options` | `ITSearchSelectOption[]` | — | Array of options for static mode (Mode 1: local client-side filtering). |
| `valueField` | `string` | — | Field used as the option value. Default: "value". |
| `labelField` | `string` | — | Field used as the option display label. Default: "label". |
| `onChange` | `(value: string \| number, option?: ITSearchSelectOption) => void` | — | Callback fired when the selected value changes. Receives the value and the full option object. |
| `onBlur` | `(e: React.FocusEvent<any>) => void` | — | Callback fired when the input loses focus. |
| `disabled` | `boolean` | — | Whether the component is disabled. |
| `className` | `string` | — | Additional CSS classes for the container. |
| `touched` | `boolean` | — | Whether the field has been touched (for form validation). |
| `required` | `boolean` | — | Whether the field is required. Shows a red asterisk on the label. |
| `error` | `string \| boolean` | — | Error message or boolean indicating an error state. |
| `readOnly` | `boolean` | — | Whether the field is read-only. |
| `size` | `SizesTypes` | `"md"` | Size preset: "sm" \| "md" \| "lg". |
| `onSearch` | `(query: string) => void` | — | Callback for server-side search (Mode 2: API connection). Receives the search query string. |
| `isLoading` | `boolean` | — | Whether options are being loaded from an external API. |
| `noResultsMessage` | `string` | — | Message displayed when no results are found. Default: "No se encontraron resultados". |
| `renderOption` | `(option: ITSearchSelectOption, state: { isSelected: boolean; searchTerm: string; }) => React.ReactNode` | — | Custom template for each option in the dropdown list. Receives the option and its state (`isSelected`, `searchTerm`). |
| `clearable` | `boolean` | — | Shows a clear (X) button inside the input. Default: true. |
| `onClear` | `() => void` | — | Callback fired when the clear button is pressed. |

`*` = obligatorio.

#### `ITSelect`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/select/select.tsx`

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `name` **\*** | `string` | — | Name attribute for the underlying `<select>` element. |
| `options` **\*** | `OptionType[]` | — | Array of option objects with value/label key-value pairs. |
| `valueField` | `string` | — | Key in each option object used as the option value. Default: "value". |
| `labelField` | `string` | — | Key in each option object used as the display label. Default: "label". |
| `label` | `string` | — | Label text rendered above the select. |
| `placeholder` | `string` | — | Placeholder text for the default empty option. |
| `value` | `string` | — | Currently selected value (controlled). |
| `onChange` | `(event: React.ChangeEvent<HTMLSelectElement>) => void` | — | Callback fired on selection change. Receives the native change event. |
| `onBlur` | `(event: React.FocusEvent<HTMLSelectElement>) => void` | — | Callback fired on blur. Receives the native focus event. |
| `variant` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | — | Theme color variant (e.g. "primary", "success", "danger"). |
| `size` | `SizesTypes` | — | Control size: "sm" \| "md" \| "lg". |
| `disabled` | `boolean` | — | Whether the select is disabled. |
| `className` | `string` | — | Additional CSS classes on the `<select>` element. |
| `touched` | `boolean` | — | Marks the field as touched (for validation display). |
| `error` | `string \| boolean` | — | Error message string or true for a default required error. |
| `required` | `boolean` | — | Whether the field is required. Shows a red asterisk and default error. |
| `autoFocus` | `boolean` | — | Autofocus the select on mount. |
| `readOnly` | `boolean` | — | Read-only mode: shows the current value as a single disabled option. |

`*` = obligatorio.

#### `ITStatCard`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/stat-card/stat-card.tsx`
- **Qué es:** A metric card displaying a value with an optional trend indicator and icon. Automatically detects trend direction from the trend string prefix.

```tsx
<ITStatCard label="Revenue" value="$12,430" trend="+12%" trendDirection="up" icon={<FaDollarSign />} />
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `label` **\*** | `string` | — | The metric label displayed above the value. |
| `value` **\*** | `string \| number` | — | The primary numeric or string value shown in the card. |
| `trend` | `string` | — | Optional trend indicator text (e.g. "+12%", "-3"). |
| `trendDirection` | `"up" \| "down" \| "neutral"` | — | Direction of the trend, used to color the trend badge. |
| `icon` | `React.ReactNode` | — | Icon element rendered next to the label in the top-right corner. |
| `color` | `string` | — | Background color class for the card (e.g. "bg-primary-50 dark:bg-primary-950/20"). |
| `className` | `string` | — | Additional CSS classes for the outermost wrapper. |
| `style` | `React.CSSProperties` | — | Inline styles applied to the card container. |
| `onClick` | `() => void` | — | Click handler — when provided the card gains button semantics. |

`*` = obligatorio.

#### `ITStepper`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/stepper/stepper.tsx`
- **Qué es:** A step-by-step wizard / progress indicator with animated content transitions, clickable step navigation, and configurable icons.

```tsx
<ITStepper
  steps={[
    { label: "Details", content: <StepOneForm /> },
    { label: "Review", content: <StepTwoReview />, icon: <FaClipboardCheck /> },
  ]}
  currentStep={0}
  onStepChange={setStep}
  onFinish={() => alert("Done!")}
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `steps` **\*** | `Step[]` | — | Array of step objects defining label, content, and optional icon. |
| `currentStep` **\*** | `number` | — | Zero-based index of the currently active step. |
| `onFinish` | `() => void` | — | Called when the user clicks "Finish" on the last step. |
| `onStepChange` | `(step: number) => void` | — | Called whenever the active step changes, receiving the new index. |
| `allowClickToJump` | `boolean` | — | Whether clicking on completed or current step indicators jumps to that step. |
| `useIcons` | `boolean` | — | When true, renders step icons (if provided) instead of numeric indicators. |
| `disableNext` | `boolean` | — | Disables the "Next" / "Finish" button. |
| `containerClassName` | `string` | — | Additional CSS classes for the outermost wrapper. |
| `stepClassName` | `string` | — | Additional CSS classes for the content panel. |
| `scrollableContent` | `boolean` | — | Makes the step content area vertically scrollable. |
| `maxContentHeight` | `string` | — | Maximum height of the scrollable content area (CSS value, e.g. "400px"). |
| `color` | `string` | — | Semantic theme color for active steps and buttons. Default: 'primary' |

`*` = obligatorio.

#### `ITTable`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/table/table.tsx`
- **Qué es:** A feature-rich data table with per-column filtering, sortable columns, pagination, boolean/catalog type support, and currency formatting.

```tsx
<ITTable
  columns={[
    { key: "name", label: "Name", type: "string", sortable: true },
    { key: "active", label: "Active", type: "boolean", filter: true },
    { key: "actions", label: "", type: "actions", actions: (row) => <ITButton>Edit</ITButton> },
  ]}
  data={users}
  title="User List"
  size="sm"
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `columns` **\*** | `Column<T>[]` | — | Column definitions: key, label, type, sortable behavior, filters, and custom rendering. |
| `containerClassName` | `string` | — | Additional CSS classes for the outermost container. |
| `data` **\*** | `T[]` | — | The data array to render in the table body. |
| `variant` | `TableVariants` | — | Visual variant: "default", "striped", "bordered". |
| `className` | `string` | — | Additional CSS classes for the root table wrapper. |
| `size` | `TableSize` | — | Row size preset: "sm" \| "md" \| "lg". |
| `itemsPerPageOptions` | `number[]` | — | Available options for the per-page selector (e.g. [5, 10, 20]). |
| `defaultItemsPerPage` | `number` | — | Default number of rows shown per page. |
| `title` | `string` | — | Optional title rendered above the table in the header section. |
| `renderCard` | `(row: T) => React.ReactNode` | — | Custom card renderer for mobile/tablet responsive view. Receives the row data. |
| `defaultView` | `"table" \| "cards"` | — | Initial view mode. Defaults to "table". |
| `showVerticalBorder` | `boolean` | — | Whether to show vertical borders between columns. Defaults to true. |
| `verticalBorderClassname` | `string` | — | Custom class for vertical borders (overrides the default subtle gray). |
| `onRowClick` | `(row: T, event: React.MouseEvent<HTMLElement> \| React.KeyboardEvent<HTMLElement>) => void` | — | Callback fired when a row (table view) or card (cards view) is activated, receiving the row item and the originating event. The event is a `MouseEvent` for pointer interaction and a `KeyboardEvent` for Enter/Space activation. Not fired when the interaction starts inside an interactive child (button, link, input, or any `[data-row-click-ignore]` element). |
| `layout` | `"auto" \| "fixed"` | `"auto"` | Table layout algorithm. `"fixed"` respects column `width` values and drops the `min-w-max` / `min-w-[150px]` floors so content no longer forces horizontal scrolling; `"auto"` keeps the content-driven layout. |
| `density` | `TableDensity` | `"normal"` | Cell padding and row-height preset. Independent of `size`, which only controls font-size: `"compact"` \| `"normal"` \| `"comfortable"`. |
| `autoCardBreakpoint` | `number` | `0` | Container width (in px) below which the table automatically falls back to the cards view. `0` disables the fallback. |
| `virtualized` | `boolean` | `false` | Enables row virtualization for the table view: only the visible window of rows is rendered, with spacer rows preserving the full scroll height. The cards view is never virtualized. |
| `virtualizedMaxHeight` | `number` | `400` | Max height (px) of the virtualized table's scroll container. Only used when `virtualized` is true. |
| `rowHeight` | `number` | — | Assumed uniform row height (px) used by the virtualizer. Defaults to `getRowHeight(size, density)`, which is size-aware: the `size="md"` baseline is 33 / 45 / 53 (compact / normal / comfortable) and `size` shifts it by the font-size line box (sm 16px / md 20px / lg 28px). Only used when `virtualized` is true. |
| `overscan` | `number` | `5` | Number of extra rows rendered above and below the viewport to avoid blank gaps while scrolling. Only used when `virtualized` is true. |
| `stickyHeader` | `boolean` | `false` | Makes the header cells sticky while the virtualized body scrolls. Only effective when `virtualized` is true. |
| `showViewToggle` | `boolean` | `true` | Whether to render the Table\|Cards view switcher in the toolbar. Hiding it still honors `defaultView` and `autoCardBreakpoint`. |
| `design` | `TableDesign` | — | Per-region visual overrides (classes + inline styles). |
| `colors` | `TableColors` | — | Per-instance color overrides for header and rows, beating the global theme. |
| `containerStyle` | `React.CSSProperties` | — | Inline styles for the outermost wrapper. |
| `cardClassName` | `string` | — | Extra classes for the card surface (the rounded container). |
| `cardStyle` | `React.CSSProperties` | — | Inline styles for the card surface. |
| `toolbarClassName` | `string` | — | Extra classes for the toolbar strip (title + view toggle). |
| `toolbarStyle` | `React.CSSProperties` | — | Inline styles for the toolbar strip. |
| `headerClassName` | `string` | — | Extra classes for the header row. |
| `headerStyle` | `React.CSSProperties` | — | Inline styles for the header row. |
| `headerCellClassName` | `string` | — | Extra classes for every header cell. |
| `headerCellStyle` | `React.CSSProperties` | — | Inline styles for every header cell. |
| `rowClassName` | `string` | — | Extra classes for every body row. |
| `rowStyle` | `React.CSSProperties` | — | Inline styles for every body row. |
| `cellClassName` | `string` | — | Extra classes for every body cell. |
| `cellStyle` | `React.CSSProperties` | — | Inline styles for every body cell. |
| `cardsClassName` | `string` | — | Extra classes for the cards-view scroll wrapper. |
| `cardsStyle` | `React.CSSProperties` | — | Inline styles for the cards-view scroll wrapper. |
| `footerClassName` | `string` | — | Extra classes for the pagination footer strip. |
| `footerStyle` | `React.CSSProperties` | — | Inline styles for the pagination footer strip. |

`*` = obligatorio.

#### `ITTabs`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/tabs/tabs.tsx`
- **Qué es:** Tabbed navigation component with "line" and "pill" visual variants. Manages its own active state internally via a defaultActiveId.

```tsx
<ITTabs
  items={[
    { id: "tab1", label: "General", content: <GeneralPanel /> },
    { id: "tab2", label: "Settings", content: <SettingsPanel />, disabled: true },
  ]}
  defaultActiveId="tab1"
  onChange={(id) => console.log("Active tab:", id)}
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `items` **\*** | `ITTabItem[]` | — | Array of tab definitions: id, label, content, icon, and disabled state. |
| `defaultActiveId` | `string` | — | The id of the tab active by default (first item if omitted). |
| `onChange` | `(id: string) => void` | — | Callback fired when the active tab changes, receiving the new tab id. |
| `variant` | `"line" \| "pill"` | — | Visual variant: "line" (underline indicator) or "pill" (rounded background). |
| `className` | `string` | — | Additional CSS classes for the tab header row. |
| `containerClassName` | `string` | — | Additional CSS classes for the outermost wrapper. |

`*` = obligatorio.

#### `ITTimePicker`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/time-picker/timePicker.tsx`
- **Qué es:** Time selection input with a dual-column dropdown (hours / minutes). Supports manual typing with auto-formatting, validation, and keyboard-friendly picker.

```tsx
<ITTimePicker
  name="startTime"
  label="Start Time"
  value={startTime}
  onChange={(e) => setStartTime(e.target.value)}
  color="primary"
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `name` **\*** | `string` | — | Form field name attribute and key for the change event. |
| `value` | `string` | — | Controlled time value in "HH:MM" format. |
| `label` | `string` | — | Label text displayed above the input. |
| `placeholder` | `string` | — | Placeholder text when no value is set (default "HH:MM"). |
| `onChange` **\*** | `(e: any) => void` | — | Callback fired on valid time selection, receives event-like object with `target.name` and `target.value`. |
| `onBlur` | `(e: any) => void` | — | Callback fired when the input loses focus. |
| `required` | `boolean` | — | Marks the field as required. |
| `touched` | `boolean` | — | Whether the input has been touched (interacted with). |
| `error` | `string \| boolean` | — | Validation error message or boolean to show error state. |
| `disabled` | `boolean` | — | Disables the time picker when true. |
| `className` | `string` | — | Additional CSS classes for the wrapper. |
| `size` | `SizesTypes` | `"md"` | Size preset: "sm" \| "md" \| "lg". |
| `variant` | `"purple" \| "info" \| "success" \| "warning" \| "primary" \| "secondary" \| "danger"` | — | Style variant for the input: "primary" \| "secondary" \| "danger" \| "success" \| "warning" \| "info" \| "purple". |
| `color` | `string` | — | Theme color used for the dropdown highlight and confirm button. Accepts semantic keys or raw hex. |

`*` = obligatorio.

#### `ITWysiwyg`

- **Capa:** Molecules
- **Fuente:** `src/components/molecules/wysiwyg/wysiwyg.tsx`
- **Qué es:** Lightweight WYSIWYG editor (no external rich-text dependency). Provides bold, italic, underline, a yellow marker highlight and ordered/unordered lists. Formatting is applied manually over the Selection/Range API (no deprecated `document.execCommand`), toggling elements by wrapping/unwrapping text nodes. The component is uncontrolled at the DOM level: it renders `value` lazily and only re-syncs it when the editor is not focused (`onChange` reports the HTML).

```tsx
<ITWysiwyg
  label="Descripción"
  value={content}
  onChange={setContent}
  placeholder="Escribe aquí..."
/>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `value` | `string` | — | Controlled HTML value rendered inside the editor. Overrides the visible content only while the editor is not focused (avoids caret jumps). |
| `onChange` | `(html: string) => void` | — | Callback fired with the editor's HTML whenever the content changes. |
| `label` | `string` | — | Label text rendered above the editor. |
| `placeholder` | `string` | — | Placeholder text shown when the editor is empty. |
| `error` | `string` | — | Validation error message displayed below the editor. |
| `disabled` | `boolean` | `false` | Disables the editor and toolbar when true. |
| `readOnly` | `boolean` | `false` | Renders content in read-only mode (not editable, toolbar disabled). |
| `name` | `string` | — | Name attribute for form submission and label association via `htmlFor`. |
| `size` | `SizesTypes` | `"md"` | Editor size: controls padding and font size. Valid values: `"sm"`, `"md"`, `"lg"`. |
| `minHeight` | `number` | `128` | Minimum height in pixels of the editable area. |
| `highlightColor` | `string` | `"#fde68a"` | Background color used by the marker tool (yellow highlight). |
| `toolbar` | `ToolbarAction[]` | `all actions` | Subset of toolbar actions to render. |
| `className` | `string` | — | Additional CSS classes for the wrapper. |

`*` = obligatorio.

### Organisms

#### `ITConfirmDialog`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/confirm-dialog/confirm-dialog.tsx`
- **Qué es:** Confirmation modal dialog for destructive or critical actions. Renders a centered overlay with a warning icon, title, message body, and confirm/cancel buttons. The dialog auto-hides when `isOpen` is false.

```tsx
```tsx
<ITConfirmDialog
  isOpen={showConfirm}
  onClose={() => setShowConfirm(false)}
  onConfirm={handleDelete}
  title="Delete record"
  message="This action is permanent and cannot be undone."
  variant="danger"
  loading={isDeleting}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `isOpen` **\*** | `boolean` | — | Controls whether the confirmation dialog is visible. |
| `onClose` **\*** | `() => void` | — | Callback fired when the user cancels or closes the dialog. |
| `onConfirm` **\*** | `() => void` | — | Callback fired when the user confirms the destructive action. |
| `title` | `string` | `i18n `confirmDialog.title` ("Confirmar acción")` | Heading text displayed at the top of the dialog. |
| `message` | `React.ReactNode` | `i18n `confirmDialog.message` ("¿Estás seguro de que deseas continuar?")` | Body content — accepts plain strings or React nodes. |
| `confirmLabel` | `string` | `i18n `common.confirm` ("Confirmar")` | Label for the confirm button. |
| `cancelLabel` | `string` | `i18n `common.cancel` ("Cancelar")` | Label for the cancel button. |
| `variant` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | `"primary"` | Color variant applied to the confirm button. Accepts any ColorsTypes value (e.g. "primary", "danger", "warning", "info"). |
| `loading` | `boolean` | `false` | Disables all buttons and signals a loading state. |

`*` = obligatorio.

#### `ITDataTable`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/data-table/dataTable.tsx`
- **Qué es:** Async server-side data table with sorting, filtering, and pagination. Fetches data via the `fetchData` callback whenever pagination, sorting, or filters change. Supports column-level text/catalog/boolean filters, sortable columns, and a loading overlay. Built on-top of internal table hooks for automatic state coordination.

```tsx
```tsx
<ITDataTable
  columns={[
    { key: "name", label: "Name", sortable: true, filter: true },
    { key: "status", label: "Status", type: "boolean", filter: true },
  ]}
  fetchData={async (params) => api.fetchItems(params)}
  title="Users"
  variant="bordered"
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `columns` **\*** | `Column<T>[]` | — | The column configuration array matching ITTable but adapted for Server-Side processing |
| `fetchData` **\*** | `(params: ITDataTableFetchParams) => Promise<ITDataTableResponse<T>>` | — | Async callback that the component will trigger whenever pagination, filtering or sorting changes. It must return a Promise with `data` array and the `total` items matching the query. |
| `debounceMs` | `number` | `400` | The amount of milliseconds to wait after internal `filters` state changes before triggering `fetchData`. Helpful to avoid spamming the backend while typing. |
| `externalFilters` | `ColumnFilters` | — | Filters managed outside of the ITDataTable (e.g. a date range picker). These will be merged with the internal column filters before calling fetchData. |
| `loadingIndicator` | `React.ReactNode` | — | Custom element to display instead of the default spinner while `isLoading` is true. |
| `fetchOnMount` | `boolean` | `true` | Re-fetches the table automatically upon mounting. |
| `reloadTrigger` | `string \| number \| boolean` | — | External hook to force the component to re-fetch the current page. Example: trigger after a successful modal form submission. |
| `containerClassName` | `string` | — | Additional CSS classes for the outer wrapper element. |
| `className` | `string` | — | Additional CSS classes applied directly to the `<table>` element. |
| `variant` | `"default" \| "bordered" \| "striped" \| "minimal"` | `"default"` | Visual style variant: "default" \| "striped" \| "bordered" \| "minimal". |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Row density preset: "sm" \| "md" \| "lg". |
| `itemsPerPageOptions` | `number[]` | `[5, 10, 20]` | Selectable page-size options for the paginator. |
| `defaultItemsPerPage` | `number` | `10` | Initial number of rows per page. |
| `title` | `React.ReactNode` | — | Optional heading displayed above the table. |
| `renderCard` | `(row: T) => React.ReactNode` | — | Custom card renderer for mobile/tablet responsive view. Receives the row data. |
| `defaultView` | `"table" \| "cards"` | — | Initial view mode. Defaults to "table". |
| `showVerticalBorder` | `boolean` | — | Whether to show vertical borders between columns. Defaults to true. |
| `verticalBorderClassname` | `string` | — | Custom class for vertical borders (overrides the default subtle gray). |
| `onRowClick` | `(row: T, event: React.MouseEvent<HTMLElement> \| React.KeyboardEvent<HTMLElement>) => void` | — | Callback fired when a row (table view) or card (cards view) is activated, receiving the row item and the originating event. The event is a `MouseEvent` for pointer interaction and a `KeyboardEvent` for Enter/Space activation. Not fired when the interaction starts inside an interactive child (button, link, input, or any `[data-row-click-ignore]` element). |
| `layout` | `"auto" \| "fixed"` | `"auto"` | Table layout algorithm. `"fixed"` respects column `width` values and drops the `min-w-max` / `min-w-[150px]` floors so content no longer forces horizontal scrolling; `"auto"` keeps the content-driven layout. |
| `density` | `TableDensity` | `"normal"` | Cell padding and row-height preset. Independent of `size`, which only controls font-size: `"compact"` \| `"normal"` \| `"comfortable"`. |
| `autoCardBreakpoint` | `number` | `0` | Container width (in px) below which the table automatically falls back to the cards view. `0` disables the fallback. |
| `virtualized` | `boolean` | `false` | Enables row virtualization for the table view: only the visible window of rows is rendered, with spacer rows preserving the full scroll height. The cards view is never virtualized. |
| `virtualizedMaxHeight` | `number` | `400` | Max height (px) of the virtualized table's scroll container. Only used when `virtualized` is true. |
| `rowHeight` | `number` | — | Assumed uniform row height (px) used by the virtualizer. Defaults to `getRowHeight(size, density)`, which is size-aware: the `size="md"` baseline is 33 / 45 / 53 (compact / normal / comfortable) and `size` shifts it by the font-size line box (sm 16px / md 20px / lg 28px). Only used when `virtualized` is true. |
| `overscan` | `number` | `5` | Number of extra rows rendered above and below the viewport to avoid blank gaps while scrolling. Only used when `virtualized` is true. |
| `stickyHeader` | `boolean` | `false` | Makes the header cells sticky while the virtualized body scrolls. Only effective when `virtualized` is true. |
| `showViewToggle` | `boolean` | `true` | Whether to render the Table\|Cards view switcher in the toolbar. Hiding it still honors `defaultView` and `autoCardBreakpoint`. |
| `design` | `TableDesign` | — | Per-region visual overrides (classes + inline styles). |
| `colors` | `TableColors` | — | Per-instance color overrides for header and rows, beating the global theme. |
| `containerStyle` | `React.CSSProperties` | — | Inline styles for the outermost wrapper. |
| `cardClassName` | `string` | — | Extra classes for the card surface (the rounded container). |
| `cardStyle` | `React.CSSProperties` | — | Inline styles for the card surface. |
| `toolbarClassName` | `string` | — | Extra classes for the toolbar strip (title + view toggle). |
| `toolbarStyle` | `React.CSSProperties` | — | Inline styles for the toolbar strip. |
| `headerClassName` | `string` | — | Extra classes for the header row. |
| `headerStyle` | `React.CSSProperties` | — | Inline styles for the header row. |
| `headerCellClassName` | `string` | — | Extra classes for every header cell. |
| `headerCellStyle` | `React.CSSProperties` | — | Inline styles for every header cell. |
| `rowClassName` | `string` | — | Extra classes for every body row. |
| `rowStyle` | `React.CSSProperties` | — | Inline styles for every body row. |
| `cellClassName` | `string` | — | Extra classes for every body cell. |
| `cellStyle` | `React.CSSProperties` | — | Inline styles for every body cell. |
| `cardsClassName` | `string` | — | Extra classes for the cards-view scroll wrapper. |
| `cardsStyle` | `React.CSSProperties` | — | Inline styles for the cards-view scroll wrapper. |
| `footerClassName` | `string` | — | Extra classes for the pagination footer strip. |
| `footerStyle` | `React.CSSProperties` | — | Inline styles for the pagination footer strip. |

`*` = obligatorio.

#### `ITDialog`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/dialog/dialog.tsx`
- **Qué es:** Modal dialog rendered via React portal with overlay backdrop. Supports Escape-key dismissal, click-outside-to-close, optional title bar (plain or ITFormHeader), and a full-screen variant. Content is portaled to `document.body` so it sits above all other page layers.

```tsx
```tsx
<ITDialog
  isOpen={open}
  onClose={() => setOpen(false)}
  title="User details"
  useFormHeader
>
  <UserForm />
</ITDialog>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `isOpen` **\*** | `boolean` | — | Controls whether the dialog is visible. |
| `onClose` **\*** | `() => void` | — | Callback fired when the overlay or close button is clicked, or Escape is pressed. |
| `children` **\*** | `React.ReactNode` | — | Content rendered inside the dialog body. |
| `className` | `string` | — | Additional CSS classes for the dialog panel. |
| `title` | `string` | — | Optional heading displayed at the top of the dialog. |
| `useFormHeader` | `boolean` | `false` | When true and `title` is provided, renders an ITFormHeader instead of the default title bar. |
| `fullScreen` | `boolean` | `false` | Makes the dialog fill the entire viewport. |

`*` = obligatorio.

#### `ITDrawer`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/drawer/drawer.tsx`
- **Qué es:** Sliding panel drawer from the left or right screen edge. Renders an overlay backdrop with a horizontally-anchored panel that slides in. Includes an optional title bar with close button and a scrollable body area. Uses the `useClickOutside` hook for overlay dismissal.

```tsx
```tsx
<ITDrawer
  isOpen={menuOpen}
  onClose={() => setMenuOpen(false)}
  title="Navigation"
  position="left"
  size="w-72"
>
  <NavMenu />
</ITDrawer>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `isOpen` **\*** | `boolean` | — | Controls whether the drawer is visible. |
| `onClose` **\*** | `() => void` | — | Callback fired when the overlay is clicked or the close button is pressed. |
| `position` | `DrawerPosition` | `"right"` | Edge the drawer attaches to. |
| `size` | `string` | `"w-80"` | Tailwind width class (e.g. "w-80", "w-96"). |
| `title` | `React.ReactNode` | — | Optional heading rendered in the drawer header. |
| `children` | `React.ReactNode` | — | Content displayed in the drawer body. |
| `className` | `string` | — | Additional CSS classes for the drawer panel. |
| `style` | `React.CSSProperties` | — | Inline styles for the drawer panel. |

`*` = obligatorio.

#### `ITDropfile`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/dropfile/dropfile.tsx`
- **Qué es:** Drag-and-drop file uploader with preview, status tracking, and confirmation flow. Supports configurable accepted file types (PDF, Excel, CSV, images), visual drag-active feedback, image previews, and a three-step workflow: select → confirm → upload. Upload status is tracked internally or controlled externally via the `uploadStatus` prop. Re-exports `FileTypeEnum` and `UploadStatus` enums for consuming code.

```tsx
```tsx
<ITDropfile
  onFileSelect={(file) => setSelectedFile(file)}
  onSubmit={(file) => uploadToServer(file)}
  acceptedFileTypes={[FileTypeEnum.PDF, FileTypeEnum.XLSX]}
  showStatusBadge
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `onFileSelect` **\*** | `(file: File \| null) => void` | — | Called when a file is selected or cleared. |
| `onCancel` | `() => void` | — | Called when the user cancels the current selection. |
| `onSubmit` | `(file: File) => void` | — | Called when the user confirms and submits the file. |
| `acceptedFileTypes` | `FileTypeEnum[]` | — | List of accepted MIME types. |
| `contentClassName` | `string` | — | Additional classes for the preview/content area. |
| `containerClassName` | `string` | — | Additional classes for the outermost container. |
| `showStatusBadge` | `boolean` | — | Whether to show the status badge (pending/uploading/uploaded/error). |
| `uploadStatus` | `UploadStatus` | — | Externally controlled upload status. |
| `onStatusChange` | `(status: UploadStatus) => void` | — | Callback when upload status changes. |
| `initialPreviewUrl` | `string` | — | An initial preview URL to display before any file is selected. |
| `view` | `"button" \| "drop"` | `"drop"` | Presentation mode. `"drop"` renders the dropzone/preview inline (default, current behavior, unaffected by anything below). `"button"` renders a compact trigger button instead — clicking it opens the same dropzone/preview UI inside an `ITDialog`, so callers don't need to build their own "open a modal" button around `ITDropfile`. Meant for repeated uploads (e.g. an attachments list): ~900ms after a… |
| `buttonLabel` | `string` | `"Subir archivo"` | Label for the trigger button when `view="button"` and no file is selected yet. |
| `modalTitle` | `string` | — | Title of the modal opened when `view="button"`. Defaults to `buttonLabel`. |

`*` = obligatorio.

#### `ITFormBuilder`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/form-builder/formBuilder.tsx`
- **Qué es:** `ITFormBuilder` is a declarative form generator. It renders a responsive grid of inputs from either a legacy V1 `fields` array or the richer V2 `config` array and wires every rendered input/select/date to the supplied Formik-style `handleChange`/`handleBlur`/`setFieldValue` callbacks. **V2 features (recommended):** - Rules engine: `renderWhen`, `dynamicProps`, `dependsOn`. - Section grouping with `type: "section"`. - Custom renderers with `type: "custom"`. - Async option loaders via `options: () => Promise<...>`. - Per-field `onChangeAction` for derived fields and side effects. - Nested sections and grids via `fields?: FieldConfigV2[]`. **V1 (legacy):** The `fields` prop accepts a simpler shape (`text` / `number` / `password` / `select` / `date`) without rules, sections, or async options. Kept for backward compatibility. The component is fully controlled: it does not own form state. Wrap it in a Formik `<Formik>` (or any state holder of your choice) and forward its `values`, `handleChange`, `handleBlur`, `touched`, `errors`, and `setFieldValue` props.

```tsx
Minimal login form (V1)
```tsx
<ITFormBuilder
fields={[
{ name: "email", label: "Email", type: "text", required: true, column: 12 },
{ name: "password", label: "Password", type: "password", required: true, column: 12 },
]}
values={formik.values}
handleChange={formik.handleChange}
handleBlur={formik.handleBlur}
touched={formik.touched}
errors={formik.errors}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `fields` | `FieldConfig[]` | — | Legacy V1 field definitions. |
| `config` | `FieldConfigV2[]` | — | V2 field configuration array. The recommended entry point. Supports the rules engine (`renderWhen` / `dynamicProps` / `dependsOn`), nested `sections`, custom renderers via `type: "custom"`, async option loaders, and per-field `validation` / `asyncValidation`. When this prop is supplied it shadows any `fields` prop. |
| `columns` | `number` | `12` | Number of grid columns used by the responsive layout. Allowed range is 1..12; values outside the supported grid map fall back to a 12-column layout. |
| `values` **\*** | `ITFormBuilderValues` | — | Current form values keyed by field `name`. |
| `handleChange` **\*** | `(event: ITFormBuilderChangeEvent) => void` | — | Change handler invoked by every rendered input/select/textarea. Designed to receive the native `event` from a controlled child, so a Formik `handleChange` can be passed directly. |
| `handleBlur` **\*** | `(event: ITFormBuilderBlurEvent) => void` | — | Blur handler invoked by every rendered input/select/textarea. Designed to receive the native `event` from a controlled child, so a Formik `handleBlur` can be passed directly. |
| `touched` **\*** | `ITFormBuilderTouched` | — | Touch state keyed by field `name`. |
| `errors` **\*** | `ITFormBuilderErrors` | — | Validation errors keyed by field `name`. |
| `setFieldValue` | `(field: string, value: any, shouldValidate?: boolean) => Promise<void \| any>` | — | Programmatically sets a field value. Mirrors Formik's `setFieldValue(field, value, shouldValidate?)` so it can be passed through. Required to enable V2 features such as `onChangeAction` and `dynamicProps` side effects. Defaults to a no-op. |
| `setFieldTouched` | `(field: string, touched?: boolean, shouldValidate?: boolean) => Promise<void \| any>` | — | Programmatically marks a field as touched. Mirrors Formik's `setFieldTouched(field, touched?, shouldValidate?)`. Defaults to a no-op. |
| `setFieldError` | `(field: string, message: string \| undefined) => void` | — | Programmatically sets a field-level error message (Formik parity). Defaults to a no-op. |
| `isSubmitting` | `boolean` | — | True while the parent form is submitting. Surfaced via the form context. |
| `children` | `React.ReactNode` | — | Optional children rendered **inside** the V2 `ITFormBuilderProvider`, after the field grid. Useful for custom submit buttons or progress badges that read live state via {@link useFormBuilder } / `useITFormBuilderContext`. Ignored in the V1 (legacy) path because no provider is mounted there. |

`*` = obligatorio.

#### `ITNavbar`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/navbar/navbar.tsx`
- **Qué es:** Full sidebar navigation shell with collapsible submenus, user menu dropdown, and themed styling.

```tsx
```tsx
<ITNavbar
  logo={<LogoIcon />}
  logoText="My App"
  navigationItems={[
    { id: 'home', label: 'Home', icon: <FaHome />, isActive: true },
    {
      id: 'settings',
      label: 'Settings',
      icon: <FaCog />,
      subitems: [{ id: 'profile', label: 'Profile', action: () => {} }],
    },
  ]}
  userMenu={{
    userName: 'John Doe',
    userEmail: 'john@example.com',
    menuItems: [{ label: 'Logout', onClick: () => {} }],
  }}
>
  <ITPage title="Dashboard">...</ITPage>
</ITNavbar>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `logo` | `React.ReactNode` | — | Logo element rendered in the sidebar header. |
| `logoText` | `string` | — | Text displayed next to the logo. |
| `navigationItems` | `ITNavigationItem[]` | — | Array of navigation items for the main sidebar menu. |
| `userMenu` | `{ userImage?: string; userName: string; userEmail: string; menuItems: Array<{ label: string; onClick: () => void; }>; }` | — | User menu configuration including avatar, name, email, and dropdown items. |
| `children` | `React.ReactNode` | — | Content rendered in the main area next to the sidebar. |
| `navItems` | `React.ReactNode` | — | Legacy navigation items. Use `navigationItems` instead. |
| `showSidebar` | `boolean` | — | Legacy flag to show the sidebar. |
| `showSidebarOnMobile` | `boolean` | — | Legacy flag to show the sidebar on mobile devices. |
| `sidebarItems` | `React.ReactNode` | — | Legacy sidebar items. Use `navigationItems` instead. |

`*` = obligatorio.

#### `ITPageHeader`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/page-header/page-header.tsx`
- **Qué es:** Page title bar with breadcrumbs, description, back button, and action buttons.

```tsx
```tsx
<ITPageHeader
  title="Users"
  description="Manage all system users"
  breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Users' }]}
  backAction={() => history.back()}
  actions={<ITButton label="Add User" />}
  icon={<FaUsers />}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `title` **\*** | `string` | — | Page title displayed as the main heading. |
| `description` | `string` | — | Optional description text shown below the title. |
| `breadcrumbs` | `ITBreadcrumbItem[]` | — | Array of breadcrumb items for navigation context. |
| `actions` | `React.ReactNode` | — | Action buttons or elements rendered on the right side. |
| `backAction` | `() => void` | — | Callback fired when the back button is clicked. |
| `icon` | `React.ReactNode` | — | Optional icon displayed next to the title. |
| `iconColor` | `string` | — | Custom color for the icon. Accepts any valid CSS color value. |
| `className` | `string` | — | Additional CSS classes for the container. |

`*` = obligatorio.

#### `ITSearchTable`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/searchTable/searchTable.tsx`
- **Qué es:** Server-side data table with global search, column sorting, inline editing, and pagination.

```tsx
```tsx
<ITSearchTable
  columns={[
    { key: "name", label: "Name", type: "string", sortable: true, editable: true },
    { key: "status", label: "Status", type: "string", filter: true },
  ]}
  data={rows}
  title="Users"
  pageIndex={0}
  totalCount={100}
  totalPages={10}
  hasPreviousPage={false}
  hasNextPage={true}
  onPageChange={(p) => fetchPage(p)}
  onSortChange={(s) => sortData(s)}
  onFilterChange={(f) => filterData(f)}
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `editingRow` | `number` | — | — |
| `searchTermInitial` | `string` | — | — |
| `onClearSearch` | `() => void` | — | — |
| `onEdit` | `(row: T, index: number) => void` | — | — |
| `onSave` | `(row: T, index: number) => void` | — | — |
| `onCancel` | `() => void` | — | — |
| `sortConfig` | `{ key: string; direction: "asc" \| "desc"; }` | — | — |
| `columns` **\*** | `SearchColumn<T>[]` | — | Column definitions: key, label, type, filter, sortable, editable, etc. |
| `containerClassName` | `string` | — | Additional CSS class for the outer container wrapper. |
| `searchInputPlaceholder` | `string` | — | Placeholder text for the global search input field. |
| `data` **\*** | `T[]` | — | Array of row data objects (server-side paginated). |
| `variant` | `TableVariants` | — | Table visual variant: "default" \| "striped" \| "bordered". |
| `className` | `string` | — | Additional CSS class applied to the `<table>` element. |
| `size` | `TableSize` | — | Table row size: "sm" \| "md" \| "lg". |
| `itemsPerPageOptions` | `number[]` | — | Available page-size options (e.g. [10, 20, 50, 100]). |
| `defaultItemsPerPage` | `number` | — | Initial/default number of rows per page. |
| `validationSchema` | `ObjectSchema<any, AnyObject, any, "">` | — | Yup validation schema for inline editing. |
| `title` | `string` | — | Title displayed in the table header bar (teal background). |
| `pageIndex` **\*** | `number` | — | Current page index (0-based, server-side). |
| `totalCount` **\*** | `number` | — | Total number of rows across all pages (server-side). |
| `totalPages` **\*** | `number` | — | Total number of available pages. |
| `hasPreviousPage` **\*** | `boolean` | — | Whether there is a previous page available. |
| `hasNextPage` **\*** | `boolean` | — | Whether there is a next page available. |
| `onPageChange` | `(page: number) => void` | — | Callback when the user navigates to a different page. Receives the new page index. |
| `onItemsPerPageChange` | `(itemsPerPage: number) => void` | — | Callback when the user changes the page-size. Receives the new items-per-page value. |
| `onSortChange` | `(sortConfig: { key: string; direction: "asc" \| "desc"; }) => void` | — | Callback when sorting changes. Receives { key, direction: "asc" \| "desc" }. |
| `onFilterChange` | `(filters: Record<string, string \| boolean \| number>) => void` | — | Callback when global search/filter text changes. Receives a key-value filters record. |

`*` = obligatorio.

#### `ITSidebar`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/sidebar/sidebar.tsx`
- **Qué es:** Vertical navigation sidebar with submenu expand/collapse, hover tooltips in collapsed mode, and glassmorphism styling. The collapsed rail expands automatically on pointer hover — there is no toggle button; the hover is the only way to expand and collapse it.

```tsx
```tsx
<ITSidebar
  navigationItems={[
    { id: "dashboard", label: "Dashboard", icon: <FaHome />, isActive: true },
    {
      id: "settings", label: "Settings", icon: <FaCog />,
      subitems: [
        { id: "profile", label: "Profile", action: () => navigate("/profile") },
        { id: "billing", label: "Billing", isActive: true },
      ],
    },
    { id: "inbox", label: "Inbox", icon: <FaEnvelope />, badge: 12 },
  ]}
  notification={{
    count: 5,
    icon: <FaBell />,
    label: "Notificaciones",
    onClick: () => navigate("/notifications"),
  }}
  isCollapsed
/>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `navigationItems` **\*** | `ITNavigationItem[]` | — | Navigation structure: top-level items with optional sub-items. |
| `isCollapsed` | `boolean` | — | Whether the sidebar is collapsed to icon-only mode. |
| `onToggleCollapse` | `() => void` | — | Callback that flips `isCollapsed`. `ITLayout` calls it from the top bar's menu button when `expandOnHover` is `false`; the sidebar itself calls it when a collapsed parent item is clicked, so its submenu can be shown. |
| `expandOnHover` | `boolean` | `true` | How the collapsed rail opens. `true`: it expands over the content while the pointer is on it (no button). `false`: it stays an icon-only rail — the item name shows in a tooltip on hover — and it only opens through `onToggleCollapse` (the top bar's menu button in `ITLayout`). |
| `visibleOnMobile` | `boolean` | — | Force sidebar visible on mobile breakpoints. |
| `onItemClick` | `(item: ITNavigationItem) => void` | — | Callback when a top-level navigation item is clicked. Receives the item. |
| `onSubItemClick` | `(subitem: ITNavigationSubItem) => void` | — | Callback when a sub-navigation item is clicked. Receives the sub-item. |
| `subitemConnector` | `"none" \| "dot" \| "\|"` | — | Visual connector style for sub-items: "dot" \| "\|" \| "none". Default: "dot". |
| `className` | `string` | — | Additional CSS classes on the sidebar `<aside>`. |
| `header` | `React.ReactNode` | — | Optional content rendered above the navigation list (e.g. a wordmark). Hidden while the sidebar is collapsed, so it only shows on hover. |
| `notification` | `ITSidebarNotification` | — | Optional notification entry pinned above the navigation (icon + label + `ITBadget` counter). Unlike {@link ITSidebarProps.header} it stays visible while collapsed, showing just the icon and the counter. |
| `brand` | `ITSidebarBrand` | — | Brand (logo + wordmark) pinned at the very top of the sidebar, in a 64px row that lines up with the top bar. Unlike {@link ITSidebarProps.header} the logo stays visible while collapsed. `ITLayout` fills it from `topBar.logo` / `topBar.logoText` when `sidebarFullHeight` is set. |

`*` = obligatorio.

#### `ITToast`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/toast/toast.tsx`
- **Qué es:** ITToast — floating notification with automatic dismiss and severity-based styling. Renders a positioned alert with an icon, message, and close button. Supports "success", "error", "warning", "info", "primary", and "danger" types. Auto-dismisses after the configured duration and calls `onClose` on completion.

```tsx
// Basic info toast
<ITToast message="Item saved" type="success" />
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `message` **\*** | `string` | — | Toast message text to display. |
| `type` | `string` | `"info"` | Severity type determining icon and background color. One of "success", "error", "warning", "info", "primary", or "danger". |
| `duration` | `number` | `1500` | Auto-dismiss duration in milliseconds. |
| `position` | `"top-right" \| "top-center" \| "top-left" \| "bottom-right" \| "bottom-center" \| "bottom-left"` | `"top-right"` | On-screen placement. One of "top-right", "top-center", "top-left", "bottom-right", "bottom-center", "bottom-left". |
| `onClose` | `() => void` | — | Callback invoked after the toast finishes its dismiss transition animation. |

`*` = obligatorio.

#### `ITTripleFilter`

- **Capa:** Organisms
- **Fuente:** `src/components/organisms/triple-filter/tripleFilter.tsx`

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `value` **\*** | `T` | — | Currently selected value. Must match one of the option values. |
| `onChange` **\*** | `(value: T) => void` | — | Called when the user selects a different option. Receives the new value. |
| `options` **\*** | `ITTripleFilterOption<T>[]` | — | Array of filter options to render (typically 2-4 items, e.g. All / Active / Inactive). |
| `color` | `"gray" \| "purple" \| "info" \| "success" \| "warning" \| "error" \| "primary" \| "secondary" \| "danger"` | `"primary"` | Color theme for the active indicator. One of "primary", "secondary", "success", "danger", "warning", "info", "purple", "error", "gray". |
| `className` | `string` | — | Additional CSS classes applied to the outermost container. |

`*` = obligatorio.

### Templates

#### `ITLayout`

- **Capa:** Templates
- **Fuente:** `src/components/templates/layout/layout.tsx`
- **Qué es:** Main application shell with sidebar, topbar, and content area. Provides a responsive layout with a collapsible desktop sidebar, a sliding mobile sidebar overlay, and a scrollable main content region.

```tsx
<ITLayout
  topBar={{ title: "Dashboard", userMenu: [...] }}
  sidebar={{ items: [...], activeKey: "overview" }}
>
  <p>Page content goes here</p>
</ITLayout>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `topBar` **\*** | `ITTopBarProps` | — | Top bar configuration and props |
| `sidebar` **\*** | `ITSidebarProps` | — | Sidebar configuration and props |
| `children` **\*** | `React.ReactNode` | — | Main content rendered in the center area |
| `className` | `string` | — | Additional CSS classes for the outermost wrapper |
| `contentClassName` | `string` | — | Additional CSS classes for the content container |
| `sidebarFullHeight` | `boolean` | `false` | App-shell arrangement. `false` (default): the top bar spans the full width and the sidebar sits below it. `true`: the sidebar spans the full viewport height and shows the brand (`topBar.logo` + `topBar.logoText`) at its top, while the top bar covers only the content column and drops the logo from the `lg` breakpoint up. Mobile is unchanged. |

`*` = obligatorio.

#### `ITPage`

- **Capa:** Templates
- **Fuente:** `src/components/templates/page/page.tsx`
- **Qué es:** Page template combining a page header and content area with built-in states for loading, error, and empty.

```tsx
```tsx
<ITPage
  title="Dashboard"
  description="Overview of your account"
  breadcrumbs={[{ label: 'Home' }, { label: 'Dashboard' }]}
  actions={<ITButton label="Refresh" />}
  loading={isLoading}
  error={errorMessage}
  onRetry={fetchData}
>
  <ITCard>Dashboard content</ITCard>
</ITPage>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `title` | `string` | — | Page title passed to the header. |
| `description` | `string` | — | Description text shown below the title. |
| `breadcrumbs` | `ITBreadcrumbItem[]` | — | Array of breadcrumb items for navigation context. |
| `actions` | `React.ReactNode` | — | Action buttons rendered in the header. |
| `backAction` | `() => void` | — | Callback fired when the back button is clicked. |
| `icon` | `React.ReactNode` | — | Optional icon displayed next to the title. |
| `iconColor` | `string` | — | Custom color for the icon. Accepts any valid CSS color value. |
| `loading` | `boolean` | — | Whether the page is in a loading state. Shows skeleton placeholders when true. |
| `error` | `string` | — | Error message to display. Shows an error state with retry button when provided. |
| `errorTitle` | `string` | — | Custom title for the error state. Default: i18n `common.error` ("Error"). |
| `errorActionLabel` | `string` | — | Label for the retry button in the error state. Default: i18n `common.retry` ("Reintentar"). |
| `onRetry` | `() => void` | — | Callback fired when the retry button is clicked in the error state. |
| `empty` | `boolean` | — | Whether the page is in an empty state. Shows a placeholder when true. |
| `emptyTitle` | `string` | — | Custom title for the empty state. Default: i18n `common.noData` ("Sin datos"). |
| `emptyDescription` | `string` | — | Custom description for the empty state. Default: i18n `common.empty` ("No hay información para mostrar"). |
| `emptyAction` | `React.ReactNode` | — | Custom action element for the empty state. |
| `className` | `string` | — | Additional CSS classes for the page wrapper. |
| `children` **\*** | `React.ReactNode` | — | Content rendered inside the page wrapper. |
| `maxWidth` | `"2xl" \| "3xl" \| "4xl" \| "5xl" \| "6xl" \| "7xl"` | — | Maximum width of the page content. Options: "2xl", "3xl", "4xl", "5xl", "6xl", "7xl". Default: "7xl". |
| `noPadding` | `boolean` | — | Whether to remove default padding from the page wrapper. Overrides `horizontalPadding`. |
| `horizontalPadding` | `string` | `"px-4 sm:px-6 lg:px-8"` | Tailwind classes for the page wrapper's horizontal padding. Pass `"px-0"` for edge-to-edge content, or a responsive scale like `"px-2 sm:px-4"`. Must be written as a literal: Tailwind scans source files, so a value assembled at runtime will not be generated into the stylesheet. |

`*` = obligatorio.

### Providers y otros

#### `ITI18nProvider`

- **Capa:** Providers y otros
- **Fuente:** `src/i18n/provider.tsx`
- **Qué es:** Provee locale y mensajes al árbol de componentes. Sin provider, los componentes usan el catálogo base en español. Con provider, cualquier prop de texto explícita de un componente sigue teniendo prioridad sobre el catálogo.

```tsx
```tsx
<ITThemeProvider>
  <ITI18nProvider locale="en">
    <App />
  </ITI18nProvider>
</ITThemeProvider>
```
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `locale` | `string` | `"es"` | Active locale. |
| `fallbackLocale` | `string` | `"es"` | Fallback locale for missing keys. |
| `messages` | `ITMessagesByLocale` | — | Custom messages merged over the built-in catalog, keyed by locale. |
| `children` **\*** | `React.ReactNode` | — | Application tree. |

`*` = obligatorio.

#### `ITThemeProvider`

- **Capa:** Providers y otros
- **Fuente:** `src/components/theme-provider/themeProvider.tsx`
- **Qué es:** Root theme context provider that injects CSS custom properties for all components, supports custom color palettes, dark/light mode, and an optional in-app theme designer FAB.

```tsx
<ITThemeProvider theme={{ primary: "#3b82f6", danger: "#ef4444" }}>
  <App />
</ITThemeProvider>
```

**Props**

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `theme` | `Partial<ITThemePalette>` | — | Partial palette overrides merged (deep merge) with the default theme. Supports primary, secondary, ternary, danger, success, info, alert, warning, layout, and table colors. Persisted to `localStorage` under `"it-theme-palette"` once the user edits it via the FAB/drawer. |
| `children` **\*** | `React.ReactNode` | — | The subtree that receives the theme context and CSS variables. Must wrap your entire app (or the portion that uses AXZY UI System components) once, near the root. |
| `showFab` | `boolean` | `true` | Whether to render the floating action button (bottom-right) that opens the live theme-designer drawer, letting end users tweak colors and persist their choice. Set to `false` to hide the FAB in production and only theme via the `theme` prop. |
| `density` | `number` | `1` | Global density/compactness factor. Values below 1 shrink the UI's base sizes, above 1 grow them (e.g. `0.8` = 80%: smaller fonts, paddings, gaps, spacing). Applied by scaling the root font-size so every `rem`-based token in Tailwind components compacts together, keeping the layout fluid (no empty margins, unlike CSS zoom). Clamped to `0.5`–`1.5`. |
| `radius` | `number` | `0 (no override, Tailwind defaults)` | Global border radius in pixels applied to the entire rounding scale (`rounded-sm/md/lg/xl/2xl/…`). `radius={2}` ⇒ 2px corners (near-square), `8` ⇒ 8px, `0` ⇒ completely square. Every `rounded-*` utility resolves to a `--radius-*` variable, so this reshapes inputs, buttons, cards, dialogs and tables system-wide with no per-component changes. |
| `shadow` | `number` | `2 (keeps current default when omitted)` | Global shadow strength level. `0` ⇒ no shadows, `1` ⇒ subtle, `2` ⇒ default current look, `3` ⇒ pronounced. Shadows are injected as `--shadow-*`/`.shadow-*` overrides so cards, dropdowns and dialogs follow the level. |
| `appearance` | `ITThemeAppearance` | `"soft"` | Visual language of the whole system. `"soft"` keeps the current look (floating cards, tinted shadows, glass sidebar/top bar). `"flat"` switches the app shell and surfaces to flat ones: hairline borders instead of shadows on `ITCard`, a plain `ITSidebar` (no glow, no accent bar, narrower), a plain `ITTopBar` (no shadow, initials avatar) and a compact `ITPageHeader` without the icon tile. It also s… |

`*` = obligatorio.

### Hooks

#### `useClickOutside`

- **Firma:** `(ref: React.RefObject<HTMLElement>, callback: () => void): void`
- **Fuente:** `src/hooks/useClickOutside.ts`

#### `useDebouncedSearch`

- **Firma:** `({ initialValue, debounceMs, onSearch, }: UseDebouncedSearchOptions): UseDebouncedSearchResult`
- **Fuente:** `src/hooks/useDebouncedSearch.ts`

#### `useEditableRow`

- **Firma:** `<T>({ row, columns, getNestedValue, validationSchema, }: UseEditableRowOptions<T>): UseEditableRowResult<T>`
- **Fuente:** `src/hooks/useEditableRow.ts`

#### `useFloatingPanel`

- **Firma:** `(anchorRef: import("/Users/axzy/DEV/AXZY/AXZY_UI_SYSTEM/node_modules/.pnpm/@types+react@19.0.8/node_modules/@types/react/index").RefObject<HTMLElement \| null>, isOpen: boolean, { estimatedHeight, offset, matchWidth, ali…`
- **Fuente:** `src/hooks/useFloatingPanel.ts`
- **Qué hace:** Computes a fixed position for a floating panel anchored to an element. Positions are relative to the viewport, so the panel must be rendered through a portal (e.g. into `document.body`) to escape ancestors with `overflow: hidden` or `transform`, which otherwise clip or re-anchor it. When there is not enough room below, the panel flips above and its bottom edge is pinned to the anchor's top, so it always stays adjacent regardless of its real height. Repositions on scroll, resize, and panel resize.

#### `useTableState`

- **Firma:** `({ defaultItemsPerPage, initialSort, }?: UseTableStateOptions): UseTableStateResult`
- **Fuente:** `src/hooks/useTableState.ts`

#### `useITTheme`

- **Firma:** `(): import("/Users/axzy/DEV/AXZY/AXZY_UI_SYSTEM/src/theme/theme-context").ITThemeContextType`
- **Fuente:** `src/theme/theme-context.ts`

#### `useITThemeSafe`

- **Firma:** `(): import("/Users/axzy/DEV/AXZY/AXZY_UI_SYSTEM/src/theme/theme-context").ITThemeContextType \| undefined`
- **Fuente:** `src/theme/theme-context.ts`
- **Qué hace:** Versión segura de useITTheme que retorna undefined si se usa fuera de ITThemeProvider (no lanza error).

#### `useITFlatAppearance`

- **Firma:** `(): boolean`
- **Fuente:** `src/theme/theme-context.ts`
- **Qué hace:** `true` cuando el provider pide el lenguaje visual plano (`appearance="flat"`). Fuera de un ITThemeProvider devuelve `false` (aspecto por defecto).

#### `useITTranslation`

- **Firma:** `(): ITI18nValue`
- **Fuente:** `src/i18n/useITTranslation.ts`
- **Qué hace:** Devuelve el traductor y los formateadores de la locale activa. Funciona aunque no exista `ITI18nProvider` (cae al catálogo base en español).

```tsx
```tsx
const { t, formatCurrency } = useITTranslation();
return <ITButton label={t("common.cancel")} onClick={onCancel} />;
```
```

### Otros exports (tipos y utilidades)

`Column`, `ColumnFilterMode`, `ColumnFilterValue`, `ColumnFilters`, `FieldConfig`, `FieldConfigV2`, `FileTypeEnum`, `ITAccordionItem`, `ITAccordionProps`, `ITAlertProps`, `ITAvatarProps`, `ITBadgetProps`, `ITBreadcrumbItem`, `ITBreadcrumbsProps`, `ITButtonProps`, `ITCalendarProps`, `ITCardProps`, `ITCheckboxProps`, `ITChipInputProps`, `ITChipProps`, `ITConfirmDialogProps`, `ITDataTableFetchParams`, `ITDataTableProps`, `ITDataTableResponse`, `ITDatePickerProps`, `ITDialogProps`, `ITDividerProps`, `ITDrawerProps`, `ITDropdownMenuItem`, `ITDropdownMenuProps`, `ITEmptyStateProps`, `ITFieldProps`, `ITFlexProps`, `ITFormBuilderProps`, `ITFormHeaderProps`, `ITGridProps`, `ITI18nProviderProps`, `ITI18nValue`, `ITImageProps`, `ITInputNumberProps`, `ITInputProps`, `ITLayoutProps`, `ITLineBarChartProps`, `ITLineBarDatum`, `ITLoaderProps`, `ITLocale`, `ITMaskedInputProps`, `ITMessages`, `ITMessagesByLocale`, `ITMultiSelectOption`, `ITMultiSelectProps`, `ITNavbarProps`, `ITNavigationItem`, `ITNavigationSubItem`, `ITNavigationSubItemEntry`, `ITNavigationSubItemGroup`, `ITPageHeaderProps`, `ITPageProps`, `ITPaginationProps`, `ITPopoverProps`, `ITProgressProps`, `ITRadioGroupProps`, `ITRadioOption`, `ITSearchSelectProps`, `ITSearchTableProps`, `ITSegmentedControlProps`, `ITSelectProps`, `ITSidebarBrand`, `ITSidebarNotification`, `ITSidebarProps`, `ITSkeletonProps`, `ITSlideToggleProps`, `ITSliderProps`, `ITStackProps`, `ITStatCardProps`, `ITStepperProps`, `ITTabItem`, `ITTableProps`, `ITTabsProps`, `ITTextProps`, `ITTextareaProps`, `ITThemeAppearance`, `ITThemeConfig`, `ITThemePalette`, `ITThemeProviderProps`, `ITTimePickerProps`, `ITToastProps`, `ITTripleFilterOption`, `ITTripleFilterProps`, `ITWysiwygProps`, `TableColors`, `TableDensity`, `TableDesign`, `TableDesignProps`, `TableDesignSlot`, `UploadStatus`, `UseTableStateOptions`, `UseTableStateResult`, `createValidationSchema`, `enMessages`, `esMessages`, `getContrastTextColor`, `isLightColor`, `resolveCssColor`


