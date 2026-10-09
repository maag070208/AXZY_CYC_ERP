# AXZY CYC ERP — Sistema de Gestión Escolar (SGE)

Monorepo del **Sistema de Gestión Escolar**. La implementación sigue los
**estándares de la casa (PTNV)** y el **Axzy UI System**.

> **Estado:** documentación completa (M01–M21). **F0, F1, F2 y F3 terminadas:**
> M02 (acceso, roles, políticas ABAC, bitácora, recuperación de contraseña),
> M11 (configuración y catálogos), M03 (alumnos), M04 (profesores), M05
> (bajas/reingresos), M06 (expediente y kardex), M07 (cursos, grupos e
> inscripciones) y M08 (exámenes y calificaciones) en `api/` y `web/`, con pruebas
> unitarias, de contrato y de navegador en CI. Sigue F4 (M09–M10). Se construye módulo a módulo siguiendo el
> [roadmap](docs/guia/roadmap.md) y las [convenciones](docs/guia/convenciones.md).

---

## ¿Qué es este proyecto?

Un sistema para administrar una institución educativa de punta a punta: altas y
bajas de alumnos, expediente documental y kardex, cursos/grupos e inscripciones,
calificaciones, colegiaturas y pagos, exámenes en línea, asistencia,
notificaciones, migración de históricos y reportes ejecutivos.

## Stack (estándar de la casa)

| Capa | Tecnología |
|---|---|
| API | **Express 4 + TypeScript + Prisma + PostgreSQL + Zod** |
| Web | **React 19 + Vite + Redux Toolkit + React Router (FSD)** |
| UI | **`@axzydev/axzy_ui_system`** + Tailwind CSS v4 |
| Auth | JWT (access + refresh rotado) + bcryptjs |
| Autorización | **RBAC dinámico + alcances + excepciones + ABAC** |
| Archivos | AWS S3 (`multer` memoryStorage) |
| Colas / realtime | BullMQ/Redis + Ably |
| Pruebas | **Playwright** (contrato E2E + unitarias) |
| Despliegue | Docker (api + web) + nginx |

Detalle en [`docs/arquitectura/stack.md`](docs/arquitectura/stack.md).

## Empezar a leer

| Si buscas... | Ve a |
|---|---|
| El mapa completo de la documentación | [`docs/README.md`](docs/README.md) |
| Entender el alcance y la visión | [`docs/guia/vision-alcance.md`](docs/guia/vision-alcance.md) |
| Cómo se organiza el trabajo | [`docs/guia/roadmap.md`](docs/guia/roadmap.md) · [`plan por fases`](docs/guia/plan-implementacion.md) |
| Los estándares de la casa | [`docs/guia/convenciones.md`](docs/guia/convenciones.md) |
| Arquitectura y stack | [`docs/arquitectura/`](docs/arquitectura/) |
| API modular / Web FSD / UI kit | [`api-modular.md`](docs/arquitectura/api-modular.md) · [`web-fsd.md`](docs/arquitectura/web-fsd.md) · [`axzy-ui-system.md`](docs/arquitectura/axzy-ui-system.md) |
| Modelo de datos y ERD | [`docs/modelo-datos/`](docs/modelo-datos/) |
| Un módulo concreto (M01–M21) | [`docs/modulos/`](docs/modulos/README.md) |
| Seguridad y control de acceso | [`docs/seguridad/`](docs/seguridad/) |
| Decisiones tomadas y abiertas | [`DECISIONES.md`](DECISIONES.md) |

## Principios del proyecto

1. **Estándar de la casa.** Se reutiliza la arquitectura y convenciones de PTNV; en web, el Axzy UI System.
2. **Un módulo a la vez.** No se avanza sin que el anterior funcione y tenga pruebas.
3. **Trazabilidad.** Toda escritura pasa por el `AuditPort`.
4. **Seguridad primero.** Zod + permisos/alcance + políticas; secretos solo en `.env`.
5. **Pruebas solo del cambio.** Playwright; nunca la suite completa por inercia.
6. **Documentación viva.** Toda ambigüedad se registra en [`DECISIONES.md`](DECISIONES.md).

## Estructura

```
.
├── README.md
├── DECISIONES.md
├── CONTRIBUTING.md
├── package.json                  # scripts de orquestación del monorepo
├── docker-compose.yml            # postgres + api + web
├── .env.example                  # variables del compose
├── api/                          # paquete: Express + Prisma (Dockerfile propio)
├── web/                          # paquete: React + FSD + Axzy UI (Dockerfile propio)
└── docs/
    ├── README.md
    ├── guia/           # visión, glosario, convenciones, roadmap
    ├── arquitectura/   # general, stack, estructura, api-modular, web-fsd, axzy-ui, despliegue
    ├── modelo-datos/   # ERD + diccionario
    ├── api/            # convenciones, autenticación, errores
    ├── seguridad/      # RBAC+ABAC, bitácora, OWASP
    ├── operacion/      # entornos, respaldos, migración
    ├── modulos/        # README por módulo (M01–M21)
    ├── pruebas/        # estrategia (Playwright)
    ├── capacitacion/   # manuales
    └── plantillas/     # plantilla de módulo
```

## Arranque rápido (Docker)

```bash
cp .env.example .env      # ajusta secretos
docker compose up --build -d
# web → http://localhost:8080   ·   api → http://localhost:4001/api/v1/health
```

Cada proyecto tiene su `Dockerfile` (`api/Dockerfile`, `web/Dockerfile`) y la
raíz los orquesta con `docker-compose.yml`. El API aplica `prisma migrate deploy`
al arrancar; el seed es manual.

## Cómo contribuir

Consulta [`CONTRIBUTING.md`](CONTRIBUTING.md): usa la
[plantilla de módulo](docs/plantillas/plantilla-modulo.md), respeta las
[convenciones](docs/guia/convenciones.md) y registra toda ambigüedad en
`DECISIONES.md`.
