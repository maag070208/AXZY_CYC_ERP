# Suite E2E de la web (Playwright)

Pruebas de navegador **reales**: Chromium abre la app servida por Vite, opera los
formularios como una persona y todo pega contra la API de verdad en
`localhost:4001`, que escribe en Postgres de verdad. No hay mocks de red.

Cubre **M02** (acceso, usuarios, consola de roles, recuperación) y **M11**
(configuración y catálogos):

| Archivo | Pantalla | Flujo |
|---|---|---|
| `auth.spec.ts` | `/login` | Acceso válido/inválido, guard de rutas, persistencia de sesión, logout (revoca el refresh), renovación de un access vencido, rutas por permiso |
| `insecure-context.spec.ts` | todas | Sin `crypto.randomUUID` (cliente por `http://IP:8080`) |
| `users.spec.ts` | `/users`, `/change-password` | Alta multi-rol, edición, baja con motivo, reactivación, primer acceso con contraseña temporal |
| `roles.spec.ts` | `/roles` | Rol nuevo (copiando permisos), matriz con anti-lockout, política DENY aplicada por la API |
| `password-recovery.spec.ts` | `/forgot-password`, `/reset-password` | Solicitud sin revelar cuentas, enlace inválido, restablecer y token de un uso |
| `students.spec.ts` | `/students` | Alta con tutor y matrícula, CURP inválida, homónimo, búsqueda, edición, baja/reingreso con historial |
| `teachers.spec.ts` | `/teachers` | Alta con invitación, primer acceso con la invitación, edición, baja/reactivación |
| `documents.spec.ts` | `/students/:id` | Expediente (subida, validación, rechazo, baja, tipo inválido) y kardex en PDF |
| `m07-cursos-grupos-inscripciones.spec.ts` | `/courses`, `/groups`, `/groups/:id` | Alta de curso y grupo con horario (empalme en pantalla), inscripción por búsqueda, cupo lleno, cambio de grupo, baja, historial del alumno, vista del profesor |
| `m08-examenes-calificaciones.spec.ts` | `/groups/:id` (Calificaciones) | Instrumentos al 100 %, captura con validación de rango, proyección de la final, cierre y final en el kardex |
| `m09-colegiaturas-pagos.spec.ts` | `/finance`, `/students/:id` (Estado de cuenta) | Concepto, cargo con descuento, cobro parcial con validación y recibo PDF, liquidación, cancelación con motivo, estado de cuenta PDF |
| `m10-reportes-tablero.spec.ts` | `/`, `/reports` | Tablero con KPIs y gráficas, consulta y exportación xlsx/pdf, rango inválido, vista del profesor sin montos |
| `m14-m17-examenes-en-linea.spec.ts` | `/questions`, `/exams/:id`, `/my-exams`, `/exam/:attemptId` | Reactivo por forma y CSV con vista previa; examen configurado, armado y publicado; el alumno presenta con temporizador, autoguardado, reanudación y envío; el profesor revisa la abierta y la calificación llega al libro |
| `m11-administracion-catalogos.spec.ts` | `/settings`, `/catalogs` | Parámetros persistentes, CRUD de motivo de baja, duplicado, solo lectura por rol |

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
`test:e2e:provision` / `test:e2e:clean` (ver `support/global-setup.ts` y
`support/global-teardown.ts`).

**HashRouter.** Todas las rutas de la app cuelgan de `#`; el helper `route()`
en `support/env.ts` arma la URL.

**Aislamiento y limpieza.** La suite no toca datos reales: todo lo que crea
lleva el prefijo `e2e_`/`E2E` y lo borra el teardown de `api/`; los parámetros
generales que cambia se restauran al terminar. Los tokens de recuperación los
emite `api/` (`test:e2e:reset-token`).

**Serie, no paralelo.** `workers: 1` a propósito: los tests comparten la base.

## Variables de entorno

Salen del mismo `web/.env` que consume la app.

| Variable | Default | Para qué |
|---|---|---|
| `E2E_WEB_URL` | `http://localhost:5173` | Apuntar a otra instancia de la app |
| `E2E_API_URL` | `VITE_API_URL` | Apuntar a otra API |
| `E2E_PASSWORD` | `e2e-Test-2026!` | Contraseña de los usuarios de prueba |
| `E2E_CHROMIUM_PATH` | — | Ejecutable de Chromium ya instalado (sin `playwright install`) |
| `E2E_VIDEO` | — | `off` para no grabar video (sin ffmpeg de Playwright) |

La sesión de la app vive en `localStorage["cyc_auth_v1"]` (`E2E.storageKey`).
