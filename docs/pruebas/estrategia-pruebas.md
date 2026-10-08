# Estrategia de pruebas

Estándar PTNV: **Playwright** en ambos paquetes, con pruebas de contrato (E2E)
contra servicios reales y unitarias de lógica pura. Ver [D-011](../../DECISIONES.md).

## 1. Regla de trabajo (importante)

- Después de cada ajuste se corre **únicamente el spec** que cubre ese cambio:
  `npx playwright test tests/e2e/<spec>.spec.ts` (en `api/` o `web/`).
- **Nunca** la suite completa ni `npm test` de todo; el dueño la corre cuando lo
  pide.
- Si el cambio no tiene spec, se dice y se ofrece escribirlo.
- Verificaciones largas (builds de Docker, barridos) solo si se piden.

## 2. Tipos de prueba

| Tipo | Ubicación | Qué cubre |
|---|---|---|
| **Unitaria** | `api/tests/unit`, `web/tests/unit` | Reglas puras (validación CURP/matrícula, ponderaciones, cupo, empalme, cálculo de kardex, folios, mora, filtros de tabla, permisos) |
| **Contrato (API E2E)** | `api/tests/e2e` | Endpoints reales contra `localhost:PORT`: validación, permisos (401/403), contrato de tabla, idempotencia, bitácora |
| **Navegador (Web E2E)** | `web/tests/e2e` | Flujos por pantalla contra app + API reales; incluye `insecure-context` |

## 3. Infraestructura

- `playwright.config.ts` con `globalSetup`/`globalTeardown`, `workers: 1`
  (serie, por consecutivos y transacciones) y `webServer` con `reuseExistingServer`.
- **Aislamiento:** prefijo `E2E` en claves/nombres + `newRunId()` por corrida; el
  teardown limpia por ese prefijo respetando el orden de FKs. Los datos reales no
  se tocan.
- `assertSafeDatabase()` se niega a correr contra base no local (salvo
  `E2E_ALLOW_REMOTE_DB=1`) y nunca con `NODE_ENV=production`.
- La **API es dueña de la BD**: expone `test:e2e:provision` y `test:e2e:clean`, que
  la suite web reutiliza.
- Fixtures de API: contexts autenticados (`ctxAdmin`, `ctxProfesor`, `ctxAlumno`,
  `ctxAnonymous`) por login real; **no** fijan `Content-Type` a nivel de contexto
  (rompe `multipart/form-data`).

## 4. Cobertura por módulo (checklist)

- [ ] Una prueba por regla de negocio numerada del README del módulo.
- [ ] Camino feliz + errores de validación + permisos (401/403) por endpoint.
- [ ] Bitácora verificada en escrituras.
- [ ] Casos límite (duplicados, rangos, cupo lleno, empalme, expiración).
- [ ] Cobertura ≥ 70% en la lógica de servicios/reglas.

## 5. Reglas críticas con prueba obligatoria (CYC)

| Módulo | Regla |
|---|---|
| M03 | CURP válida; duplicado por CURP; matrícula `AAAA-NNNN`; tutor si menor |
| M05 | Baja cancela inscripciones; reingreso conserva matrícula; motivo obligatorio |
| M06 | Tipo/tamaño de archivo; documento faltante; validación/rechazo |
| M07 | Cupo; doble inscripción; empalme de horario; alumno en baja |
| M08 | Ponderaciones suman 100; rango de calificación; cálculo final; bitácora de cambios |
| M09 | Pago parcial; folio consecutivo; cancelación con motivo; recargo |
| M16 | Acceso solo a inscrito; ventana de fechas; intentos; expiración en servidor |
| M17 | Calificación automática; pendientes de revisión; escritura al kardex |
| M02 | Lockout tras 5 intentos; RBAC/ABAC; `ACCESS_DENIED`; refresh rotado |

## 6. Aislamiento y datos de ejemplo

- Script de semillas con datos de ejemplo (M12) para demos y capacitación.
- En web, `insecure-context.spec.ts` borra `crypto.randomUUID` antes de cargar
  para reproducir `http://IP:8080` y verifica que ninguna pantalla truene.

## 7. CI

- Por PR: lint + typecheck + specs afectados; merge bloqueado si fallan.
- Job de migraciones corre `prisma migrate deploy` sobre base vacía para detectar
  migraciones rotas.
- Cobertura monitoreada (umbral 70% en servicios/reglas).
