# Suite E2E de la web (Playwright)

Pruebas de navegador **reales**: Chromium abre la app servida por Vite, opera los
formularios como una persona y todo pega contra la API de verdad en
`localhost:4001`, que escribe en Postgres de verdad. No hay mocks de red.

Cubre el módulo **M02** (autenticación, sesión, permisos y usuarios):

| Archivo | Pantalla | Flujo |
|---|---|---|
| `auth.spec.ts` | `/login` | Acceso válido/ inválido, guard de rutas, persistencia de sesión |
| `insecure-context.spec.ts` | todas | Sin `crypto.randomUUID` (cliente por `http://IP:8080`) |

## Cómo correrlas

```bash
cd web
npm run test:e2e
```

Playwright levanta lo que falte —la API (`../api`) y Vite— y reutiliza lo que ya
esté corriendo. Postgres tiene que estar arriba (`docker compose up -d postgres`
desde la raíz).

```bash
npm run test:e2e -- auth.spec.ts      # un solo flujo
npm run test:e2e -- -g "rutas"        # por nombre
npm run test:e2e:headed               # viendo el navegador
npm run test:e2e:ui                   # modo interactivo
npm run test:e2e:report               # abrir el último reporte HTML
```

## Cómo están armadas

**Se prueba la pantalla; el escenario se siembra por API.** Los usuarios de
prueba (`e2e_admin`, `e2e_control`, `e2e_profesor`) los provisiona el paquete
`api/`, que es el dueño de la base; aquí solo se invocan sus scripts
`test:e2e:provision` / `test:e2e:clean` (ver `support/global-teardown.ts`).

**HashRouter.** Todas las rutas de la app cuelgan de `#`; el helper `route()`
en `support/env.ts` arma la URL.

**Aislamiento y limpieza.** La suite no toca datos reales: todo lo que crea
lleva el prefijo `E2E` y lo borra el teardown de `api/`.

**Serie, no paralelo.** `workers: 1` a propósito: los tests comparten la base.

## Variables de entorno

Salen del mismo `web/.env` que consume la app.

| Variable | Default | Para qué |
|---|---|---|
| `E2E_WEB_URL` | `http://localhost:5173` | Apuntar a otra instancia de la app |
| `E2E_API_URL` | `VITE_API_URL` | Apuntar a otra API |
| `E2E_PASSWORD` | `e2e-Test-2026!` | Contraseña de los usuarios de prueba |

La sesión de la app vive en `localStorage["cyc_auth_v1"]` (`E2E.storageKey`).
