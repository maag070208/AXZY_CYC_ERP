# M12 — Pruebas, seguridad y despliegue

| Campo | Valor |
|---|---|
| **Código** | M12 |
| **Versión** | 0.1 |
| **Estado** | Terminado (F9a, 2026-10-09) |
| **Fase** | Calidad |
| **Depende de** | Todos los módulos; cierra cada fase |
| **Habilita a** | Puesta en producción y M13 (Gestión y capacitación) |
| **Permisos** | No aplica (módulo transversal de proceso) |

## Implementación (F9a, 2026-10-09)

**Estado: terminado** en lo que es código y configuración. Ver [D-051](../../../DECISIONES.md).

| Entregable | Dónde |
|---|---|
| Límite de peticiones por IP (`429 RATE_LIMITED`) | `api/src/core/middlewares/rate-limit.middleware.ts`, aplicado en `auth.routes.ts`; `TRUST_PROXY` en `app.ts` |
| Cabeceras de seguridad | `helmet` en la API; `web/nginx.conf` para el SPA |
| Barrido 401/403 de toda la API, envelope y endpoints públicos | `api/tests/e2e/m12-seguridad.spec.ts` (generado del OpenAPI) |
| Respaldo y restauración | `pnpm --dir api backup` / `restore` (`api/prisma/{backup,restore,pg-tools}.ts`) y servicio `backup` en `docker-compose.yml` |
| Cobertura ≥ 70 % en reglas de negocio | `pnpm --dir api test:coverage` (`api/.c8rc.json`); hoy 81.8 % de líneas |
| Auditoría de dependencias | `pnpm audit --prod --audit-level high` en ambos jobs de CI |
| Datos de ejemplo | `pnpm --dir api seed:demo` / `seed:mock` |

Diferencias con el borrador: el control de acceso se prueba con un barrido
generado del OpenAPI en lugar de un `access-control.spec.ts` escrito a mano; el
CORS **sí** admite comodines de subdominio (`https://*.dominio`), probados en
`cors.spec.ts`; no hay `seed.spec.ts` (el seed solo hace *insert-missing* y lo
ejercita CI en base vacía).

**Queda fuera del código:** HTTPS y dominio (los pone el hosting), copiar los
respaldos fuera del servidor, la firma del checklist OWASP con el cliente y un
*pentest* externo.

## 1. Objetivo

Definir y verificar la calidad, la seguridad y la puesta en producción del SGE:
pruebas automatizadas con cobertura mínima, endurecimiento OWASP, empaquetado y
despliegue reproducible, y respaldos confiables. No aporta funcionalidad de
negocio: es el marco que valida a los demás módulos.

## 2. Alcance

**Incluye**
- Pruebas unitarias de reglas de negocio y pruebas de API por módulo
  (cobertura mínima **70 %** en servicios).
- Revisión **OWASP Top 10**: inyección SQL, XSS, CSRF, control de acceso y carga
  de archivos.
- **Rate limiting** en login y endpoints públicos.
- **HTTPS** obligatorio, cabeceras de seguridad y **CORS restringido**.
- `docker-compose` para desarrollo y producción; imágenes multi-stage y nginx.
- **Respaldos automáticos diarios** de la base de datos y utilidades de restauración.
- **Script de semillas** con datos de ejemplo (para demos, pruebas y capacitación).

**No incluye (en este módulo)**
- Reglas de negocio o pantallas de un módulo funcional (cada MXX las entrega).
- La implementación del motor RBAC/ABAC (M02) ni de la bitácora (M02): M12 los
  **audita**.
- La operación diaria de la institución (M13 la documenta y capacita).

## 3. Modelo de datos (Prisma)

**No aplica.** M12 no define entidades de negocio ni migraciones propias. Lo
único que toca la base de datos es:

- Los **fixtures/seed** (`api/prisma/seed.ts` + `api/prisma/seed-data/*.json`),
  que pueblan las tablas ya definidas por los demás módulos con datos de ejemplo.
- Los scripts de **provision/clean** de pruebas, que crean y borran datos con
  prefijo `E2E` sin tocar datos reales.

Restricciones que M12 garantiza sobre el esquema existente (ver
[`diccionario-datos.md`](../../modelo-datos/diccionario-datos.md)): `id uuid`,
`createdAt`/`updatedAt`, borrado lógico por dominio, `@@map` snake_case plural y
enums `UPPER_SNAKE`. El seed es **idempotente** y de solo lectura en bases con
usuarios; solo escribe en base vacía o vía `cutover` (ver
[`respaldos.md`](../../operacion/respaldos.md)).

## 4. Reglas de negocio

1. Cobertura **≥ 70 %** en la lógica de `services`/reglas de negocio.
2. Existe **una prueba por cada regla de negocio numerada** en el README del módulo.
3. Cada endpoint tiene pruebas de **autorización** (401 sin token, 403 sin permiso)
   además del camino feliz y los errores de validación.
4. Se aplican los controles del **OWASP Top 10 2021** (ver
   [`seguridad-owasp.md`](../../seguridad/seguridad-owasp.md)).
5. **Rate limiting** activo en `login` y endpoints públicos; tras 5 intentos
   fallidos se bloquea temporalmente (`ACCOUNT_LOCKED`, 429).
6. Transporte **HTTPS obligatorio** en producción, con `helmet`, HSTS, CSP,
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy`.
7. **CORS** restringido a los orígenes de `WEB_ORIGIN` (lista y comodines de subdominio; nunca `*` en producción).
8. Las imágenes se construyen **multi-stage** y se publican **solo `linux/amd64`**;
   `nginx` sirve la web y hace proxy `/api`.
9. **Respaldo diario** de PostgreSQL (`pg_dump -Fc`) en horario de baja actividad y
   antes de migraciones o importaciones masivas (M20).
10. El **seed no corre al arrancar** el contenedor (ver
    [D-017](../../../DECISIONES.md)); las migraciones se aplican con
    `prisma migrate deploy`.
11. Las pruebas corren aisladas por prefijo `E2E` con `assertSafeDatabase()`: nunca
    contra base remota sin `E2E_ALLOW_REMOTE_DB=1` ni con `NODE_ENV=production`.

## 5. API

**No aplica** un módulo de negocio en `api/src/modules/<x>/`. M12 posee la
infraestructura transversal y **verifica** la de los demás módulos:

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| GET | `/api/v1/health` | Liveness (sin BD) | Público |
| GET | `/api/v1/health/ready` | Readiness (`SELECT 1`; 503 si falla) | Público |
| — | `test:e2e:provision` | Crea fixtures `E2E` (script, no HTTP) | Solo pruebas |
| — | `test:e2e:clean` | Limpia por prefijo `E2E` respetando FKs | Solo pruebas |

Controles que M12 exige a cada módulo (ver [`api-modular.md`](../../arquitectura/api-modular.md)):
validación Zod con whitelist, envelope de error plano
([`errores.md`](../../api/errores.md)), `Idempotency-Key` en escrituras no
idempotentes y `AuditPort` en toda escritura. El `errorMiddleware` nunca expone
SQL, stack traces ni nombres internos.

## 6. Web

**No aplica** pantallas de negocio ni nuevas capas FSD. M12 verifica:

- Cumplimiento del **Axzy UI System** (CSS por capas, `ITThemeProvider` con
  `showFab={false}` en producción, sin colores hardcodeados). Ver
  [`axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).
- El spec de navegador **`insecure-context.spec.ts`**: borra
  `crypto.randomUUID` antes de cargar para reproducir `http://IP:8080` y confirma
  que ninguna pantalla truena (uso de `newId()`).
- Que las rutas estén tras `PrivateRoutes` y protegidas por
  `<RequiresPermission>`/`usePermission`.

## 7. Permisos y alcance

**No aplica.** M12 no define permisos `recurso.accion` ni alcances. Su trabajo es
verificar que **cada** módulo aplique `authenticate` + `requiresPermission`, el
scoping por registro en el servicio (`scopeOf`/`withinScope`) y RBAC/ABAC
**fail-closed** (ver [`roles-permisos.md`](../../seguridad/roles-permisos.md)).
Prueba obligatoria por recurso sensible: autorizado → 200/201; sin permiso → 403
(`INSUFFICIENT_PERMISSIONS`/`POLICY_DENIED`); fuera de alcance → 403 o lista
filtrada; sin token/expirado → 401.

## 8. Validaciones

**No aplica** validaciones propias. M12 audita que todos los módulos:

- Usen **Zod** con whitelist estricta en `models/dto` y `Schema.parse` en el controller.
- Devuelvan códigos de negocio traducibles (`VALIDATION_ERROR`, `INVALID_FILTER`,
  `INVALID_RANGE`, `REQUIRED_FIELD`, …) del catálogo de
  [`errores.md`](../../api/errores.md).
- Validen archivos por contenido y tamaño (`FILE_TYPE_NOT_ALLOWED`,
  `FILE_TOO_LARGE`).

## 9. Bitácora

**No aplica** acciones propias de bitácora (M12 no escribe datos de negocio). M12
verifica que toda escritura de los módulos pase por el **`AuditPort`** con
`previousState`/`newState` y que cada 403 quede como `ACCESS_DENIED`, conforme a
[`bitacora.md`](../../seguridad/bitacora.md). Las pruebas de contrato comprueban
la bitácora en las escrituras críticas (altas, pagos, calificaciones, publicación
de exámenes).

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`, `web/tests/unit`): reglas puras de cada módulo
  (CURP/matrícula, cupo, empalme, ponderaciones, folios, mora, filtros de tabla,
  permisos). Umbral de cobertura **70 %** en servicios.
- **Contrato API E2E** (`api/tests/e2e`): endpoints reales contra
  `localhost:PORT`; validación, permisos (401/403), contrato de tabla
  (`POST /…/query`), idempotencia y bitácora. Fixtures `ctxAdmin`, `teacher`,
  `student`, `ctxAnonymous` por login real; **no** fijan `Content-Type` a nivel
  de contexto (rompe `multipart/form-data`).
- **Navegador Web E2E** (`web/tests/e2e`): flujos por pantalla contra app + API
  reales, incluido `insecure-context.spec.ts`.
- **Aislamiento**: prefijo `E2E` + `newRunId()` por corrida; `workers: 1`;
  `globalSetup`/`globalTeardown`; la API es dueña de la BD
  (`test:e2e:provision`/`test:e2e:clean`).
- **Regla de trabajo**: se corre **solo el spec del cambio**
  (`npx playwright test tests/e2e/<spec>.spec.ts`); nunca la suite completa.
- **Specs del módulo**:
  - `api/tests/e2e/security.spec.ts` — rate limiting, headers/CORS esperados y
    envelope de errores.
  - `api/tests/e2e/access-control.spec.ts` — barrido 401/403 por recurso.
  - `api/tests/e2e/seed.spec.ts` — idempotencia y aislamiento del seed.
  - `web/tests/e2e/insecure-context.spec.ts` — contexto no seguro.

Ver [`estrategia-pruebas.md`](../../pruebas/estrategia-pruebas.md).

## 11. Criterios de aceptación

- [x] Cobertura ≥ 70 % medida en la lógica de servicios/reglas.
- [x] Una prueba por regla de negocio de cada README de módulo.
- [x] Pruebas de autorización (401/403) por endpoint sensible.
- [x] Checklist OWASP Top 10 revisado ([`seguridad-owasp.md`](../../seguridad/seguridad-owasp.md)); **falta la firma del cliente**.
- [x] Rate limiting verificado en login y endpoints públicos.
- [x] Cabeceras de seguridad y CORS restringido configurados (HTTPS lo aporta el hosting).
- [x] `docker-compose` de desarrollo y producción funcionando; imágenes
      `linux/amd64` publicadas.
- [x] Respaldo diario programado y **restauración probada** en ambiente aislado.
- [x] Seed idempotente corriendo solo en base vacía / `cutover`.
- [x] Este README completo.

## 12. Decisiones abiertas

- Herramienta de respaldo (cron + `pg_dump` vs. pgBackRest/gestor del proveedor).
- Destino y cifrado de los respaldos fuera del servidor de producción.
- Frecuencia y alcance del **pentest** externo y de los escaneos de dependencias.
- Umbral de cobertura por módulo (¿70 % global o por servicio?).
- Monitoreo/alertas (SIEM, uptime, errores) y su integración con M19.
- Política de retención de logs y bitácora a largo plazo.

Registrar en [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Estrategia de pruebas](../../pruebas/estrategia-pruebas.md)
- [Seguridad y OWASP Top 10](../../seguridad/seguridad-owasp.md)
- [Roles y permisos](../../seguridad/roles-permisos.md)
- [Bitácora](../../seguridad/bitacora.md)
- [Despliegue](../../arquitectura/despliegue.md)
- [Respaldos y restauración](../../operacion/respaldos.md)
- [Entornos y variables](../../operacion/entornos.md)
- [API modular](../../arquitectura/api-modular.md) · [Web FSD](../../arquitectura/web-fsd.md) · [Axzy UI System](../../arquitectura/axzy-ui-system.md)
- [Diccionario de datos](../../modelo-datos/diccionario-datos.md)
- [Roadmap](../../guia/roadmap.md) · [Índice de módulos](../README.md)
