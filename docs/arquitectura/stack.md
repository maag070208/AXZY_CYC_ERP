# Stack tecnológico

Tecnologías del SGE, alineadas al **estándar PTNV** y al **Axzy UI System**
(ver [D-001/D-007/D-008](../../DECISIONES.md)).

## Backend (`api/`)

| Capa | Tecnología |
|---|---|
| Runtime | **Node.js LTS + TypeScript 5** |
| Framework | **Express 4** |
| ORM / BD | **Prisma 5 + PostgreSQL 16** |
| Validación | **Zod 3** |
| OpenAPI | `@asteasolutions/zod-to-openapi` + `swagger-ui-express` |
| Autenticación | `jsonwebtoken` (access + refresh rotado) |
| Hash de contraseñas | **bcryptjs** |
| Seguridad | `helmet`, `cors`, rate limiting |
| Subida de archivos | `multer` (memoryStorage) |
| Almacenamiento | **AWS S3** (`@aws-sdk/client-s3`) |
| Correo | `resend` + `nodemailer` (SMTP), patrón outbox (`email_logs`) |
| Tiempo real | **Ably** (`ably`) |
| Excel | `xlsx` |
| Logging | `winston` |
| Dev runner | `nodemon` + `ts-node`; build `tsc` + `tsc-alias` |
| Pruebas | **Playwright** (contrato E2E + unit) |
| Paquetes | **pnpm** |

## Frontend (`web/`)

| Capa | Tecnología |
|---|---|
| Base | **React 19 + Vite 6 + TypeScript** |
| Estado | **Redux Toolkit 2** (auth, toast, notificaciones) |
| Router | **React Router 7** (HashRouter) |
| HTTP | **Axios** (cliente único con refresh single-flight) |
| UI | **`@axzydev/axzy_ui_system`** + **Tailwind CSS v4** |
| i18n | `i18next` + `react-i18next` (`es`/`en`) |
| Validación | `@shared/validation` (validadores puros) |
| PDF | `@react-pdf/renderer` + `file-saver` |
| Gráficas/otros | `lottie-react`, `react-icons`, `qrcode` |
| Desktop | Electron + electron-builder |
| Pruebas | **Playwright** (navegador + insecure-context) |
| Arquitectura | **Feature-Sliced Design** (ESLint boundaries) |

## Por qué este stack

- **Probado en producción** en el sistema PTNV: mismos patrones, mismos comandos, mismo equipo.
- **Express + Prisma + Zod**: capas claras, validación tipada de extremo a extremo, OpenAPI generado.
- **FSD + Axzy UI**: pantallas de datos densos (tablas server-side, formularios, dashboards) con componentes ya auditados.
- **Playwright**: pruebas de contrato contra la API real y de navegador contra la app real.

## Detalle por tema

- Estructura de carpetas: [`estructura-repositorio.md`](estructura-repositorio.md).
- Vista de componentes y flujos: [`arquitectura-general.md`](arquitectura-general.md).
- Módulo de API y capas: [`api-modular.md`](api-modular.md).
- Web FSD: [`web-fsd.md`](web-fsd.md).
- UI kit: [`axzy-ui-system.md`](axzy-ui-system.md).
- Despliegue: [`despliegue.md`](despliegue.md).

## Compatibilidad

- Node LTS; pnpm; TypeScript estricto.
- Lint (ESLint) y typecheck en cada paquete; CI antes de merge.
- Migraciones inmutables una vez aplicadas en producción.
