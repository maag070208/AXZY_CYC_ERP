# Web con Feature-Sliced Design

Patrón del frontend (igual que PTNV): React 19 + Vite + Redux Toolkit + React
Router 7, con capas **FSD** y límites forzados por ESLint.

## 1. Capas y reglas de dependencia

| Capa | Carpeta | Rol | Puede importar de |
|---|---|---|---|
| `app` | `src/app/` | bootstrap, store, router, guards, toast, tema | todas |
| `shared` | `src/shared/` | API cliente, UI propia, lib, i18n, validación | solo `shared` |
| `entities` | `src/entities/<d>/` | API + modelo + slice por dominio | `entities`, `shared` |
| `features` | `src/features/<d>/<caso>/` | caso de uso (`model/use*.ts` + `ui/`) | `app` (solo tipos `RootState`/`AppDispatch`), `entities`, `shared` |
| `widgets` | `src/widgets/<x>/` | composición compleja (PDFs, paneles) | `app`, `features`, `entities`, `shared` |
| `pages` | `src/pages/` | rutas | todas |

`eslint-plugin-boundaries` con `default: disallow` hace cumplir lo anterior.
Entry point real: **`src/app/main.tsx`** (no `src/main.tsx`).

## 2. Patrón de un entity

```
entities/student/
├── api/studentApi.ts        # usa @shared/api/client y tableRequest
├── model/
│   ├── types.ts
│   ├── student.slice.ts     # (si necesita estado global)
│   └── useStudent.ts        # hooks de datos
└── index.ts                 # barrel: única API pública
```

```ts
// entities/student/api/studentApi.ts
import { api } from "@shared/api/client";
import { tableRequest } from "@shared/api/table";

export const studentApi = {
  table: (params) => tableRequest<Student>(`/students/query`, params),
  create: (data) => api.post<Student>(`/students`, data),
};
```

Estado global Redux **solo** para lo transversal (`auth`, `toast`, `notifications`).
El resto usa API + hooks locales por feature.

## 3. Cliente Axios y sesión

`@shared/api/client` es el único cliente. Base URL en cascada:
`window.__APP_CONFIG__?.API_URL` → `import.meta.env.VITE_API_URL` → `/api/v1`.

- **Request:** inyecta `Bearer` desde el store vía `@shared/api/session` y `Accept-Language`.
- **Response 401:** refresh **single-flight** (`/auth/refresh`), reintenta una vez;
  si falla o el usuario fue dado de baja (`ACCOUNT_DEACTIVATED`), auto-logout.
- Errores normalizados a `ApiError { status, code, details }`.

`app/store.ts` cablea los hooks de sesión:
```ts
setSessionHooks(
  () => store.getState().auth.token,
  () => store.dispatch(logout()),
  () => store.getState().auth.refreshToken,
  (tokens) => store.dispatch(setTokens(tokens)),
);
```

## 4. Autenticación y guards

- **HashRouter**; todas las rutas tras `PrivateRoutes` (excepto las públicas:
  `/login`, `/forgot-password` y `/reset-password`).
- `PrivateRoutes` envuelve en `ITLayout`, carga `/auth/me`, construye el menú
  desde `APP_SCREENS` y los permisos del usuario, y conecta notificaciones Ably.
- `RequiresPermission` gate por ruta; `usePermission(permission)` devuelve el
  alcance (`NONE/OWN/AREA/ALL`).

## 5. Tablas server-side

`tableRequest`/`tableQuery` (`@shared/api/table`) envían
`{ page, limit, filters, sort }` y serializan fechas a rango ISO **con zona
local**. `makeClientTableFetch` (`@shared/api/clientTable`) tiene la misma
semántica para listas completas y la reutilizan los exports PDF/CSV.

## 6. i18n y validación

- `i18next` con namespaces por dominio (`shared/i18n/locales/{es,en}/<ns>.json`),
  idioma por defecto `es`, persistido en `localStorage`. **Llaves en inglés** y
  tipadas (`i18n.d.ts`): una llave estática inexistente no compila. Para llaves
  armadas en runtime (`status.${row.status}`) se usa `dyn()`; los valores de enum
  y los nombres de campo son las llaves (`ENROLLED`, `studentNumber`).
- `@shared/validation` expone validadores puros (`validateCurp`, `validateEmail`,
  `validatePhone`, …) que devuelven `string | null`; cada hook de formulario
  define `validateField`/`validate`.

## 7. UI

Todo con el **Axzy UI System** (ver [`axzy-ui-system.md`](axzy-ui-system.md)):
`ITLayout` + `ITPage` como chasis, `PanelCard` para secciones, `KpiTile` para
indicadores, `ITDataTable` para listados. Se usa `!` de Tailwind para sobreescribir
utilidades del kit.

### Migas de pan

Toda página pasa `breadcrumbs` a `ITPage` (mismo patrón que PTNV): **Inicio ›
sección › detalle**. El hook `useBreadcrumbs` (`@shared/lib/useBreadcrumbs`)
pone «Inicio» y arma el resto; las etiquetas de sección salen de `common:nav.*`.

```tsx
const crumbs = useBreadcrumbs();
<ITPage breadcrumbs={crumbs({ label: t("common:nav.students"), to: "/students" }, { label: student?.fullName })} />
```

La miga sin `to` es la página actual; una miga sin etiqueta (dato cargando) se
omite. El intento de examen en curso no muestra migas.

## 8. PDFs y escritorio

- PDFs con `@react-pdf/renderer` en `widgets/*-pdf` (membrete `PdfLetterhead`,
  pie `PdfFooter`), descarga con `file-saver`.
- El empaquetado de escritorio (Electron) está previsto y aún no tiene código
  en el repo; la web ya resuelve la API por `window.__APP_CONFIG__`.

## 9. Contexto no seguro

El cliente entra por `http://IP:8080` (no `localhost`), donde
`crypto.randomUUID` no existe. Usar `newId()` (`@shared/lib/newId`, basado en
`crypto.getRandomValues`) y `<input type="file">`.

## 10. Alias

`@app`, `@shared`, `@entities`, `@features`, `@widgets`, `@pages` (definidos en
`vite.config.ts` y `tsconfig.app.json`).
