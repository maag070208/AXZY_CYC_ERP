# Plan de implementación por fases

Plan para construir **todo** el sistema (M01–M21) sobre el monorepo
`AXZY_CYC_ERP`, respetando el [roadmap](roadmap.md), los
[estándares](convenciones.md) y la [definición de terminado](roadmap.md#3-definición-de-terminado-por-módulo).

> Este documento es la vista de **gestión** (fases, entregables, fechas, riesgos).
> El orden técnico y las dependencias finas viven en el [roadmap](roadmap.md).

## 0. Supuestos del plan

| Supuesto | Valor |
|---|---|
| Iteración (sprint) | 2 semanas |
| Equipo núcleo | 1 backend, 1 frontend, 1 QA/fullstack (parcial), 1 líder/PM-diseño (parcial) |
| QA y seguridad | Transversal, en cada fase (no solo al final) |
| Cliente | Disponible para validar al cierre de cada fase (puerta de aceptación) |
| Ambientes | Dev local (Docker) + un ambiente de staging + producción |
| Estimaciones | Rangos; ajustar según equipo real y decisiones abiertas (`A-001…A-008`) |

**Notación de capacidad:** cada módulo CRUD simple ≈ 1 sprint; los módulos con
reglas complejas (M07, M08, M09, M16) ≈ 1.5–2 sprints.

## 1. Resumen de fases

| Fase | Nombre | Módulos | Iteraciones | Semanas (~) | Depende de |
|---|---|---|---|---|---|
| **F0** | Fundaciones e infraestructura | (M02 base) | 1 | 2 | — |
| **F1** | Núcleo de acceso y catálogos | M02, M11 | 2 | 4 | F0 |
| **F2** | Personas y expediente | M03, M04, M05, M06 | 3 | 6 | F1 |
| **F3** | Gestión académica | M07, M08 | 3 | 6 | F2 |
| **F4** | Finanzas y reportes base | M09, M10 | 2 | 4 | F3 |
| **F5** | Examen en línea | M14, M15, M16, M17 | 3 | 6 | F3 (M08) |
| **F6** | Asistencia y notificaciones | M18, M19 | 2 | 4 | F3, F4 |
| **F7** | Migración de históricos | M20 | 2 | 4 | F2 (solapa F3–F5) |
| **F8** | Analítica ejecutiva | M21 | 1–2 | 2–4 | F4, F7 |
| **F9** | Endurecimiento, despliegue y capacitación | M12, M13 | 2 | 4 | Todas |

- **Secuencial:** ≈ 42 semanas.
- **Con paralelismo** (M20 solapada, QA/seguridad/docs continuas, F5 y F6
  parcialmente en paralelo): **≈ 30–36 semanas** hasta producción.
- **M01 (análisis y prototipo)** ya está cubierto por `docs/` (visión, ERD, mapa
  de módulos). Solo falta la **firma de alcance** del cliente.

## 2. Estado actual

| Módulo | Estado | Nota |
|---|---|---|
| M01 | Documentado | Falta aprobación del cliente por escrito |
| M02 | Andamiaje | `api/` y `web/` con login/sesión/RBAC/bitácora; falta migración inicial, seed y pruebas en verde |
| M03–M21 | Documentado | Sin código |
| Infra | Inicial | Monorepo + `docker-compose` + Dockerfiles por proyecto |

## 3. Detalle por fase

### F0 — Fundaciones e infraestructura (1 iteración)
**Objetivo:** dejar el monorepo operativo de punta a punta y desplegable.

- Migración inicial de Prisma (`prisma migrate dev`) + seed de roles/permisos/admin.
- CI por paquete: `lint` + `typecheck` + specs afectados; job de migraciones sobre base vacía.
- Ambientes: dev (compose), staging, producción; `.env` por ambiente y secretos.
- Healthchecks, logs (winston), Swagger (`/docs`), i18n base.
- Cerrar el andamiaje de M02 y validar **login → `/auth/me` → logout** en local y Docker.

**Criterios de salida:** `docker compose up --build` levanta web+api+db; login funciona; CI en verde.

---

### F1 — Núcleo de acceso y catálogos (2 iteraciones)
**Módulos:** M02 (completo), M11.

- M02: usuarios CRUD, multi-rol, excepciones, consola de acceso (roles, matriz,
  políticas ABAC), bitácora consultable, recuperación de contraseña, lockout.
- M11: `settings` y catálogos (ciclos/niveles/motivos de baja/tipos de documento),
  parámetros generales (calificación mínima, umbral de asistencia, datos de escuela).
- Web: consola `/roles`, `/users`, `/catalogs`, `/settings`.

**Criterios de salida:** RBAC+ABAC operativos y probados (401/403); toda escritura
en bitácora; catálogos administrables; specs del módulo en verde.

---

### F2 — Personas y expediente (3 iteraciones)
**Módulos:** M03, M04, M05, M06.

- M03: altas/búsqueda de alumnos, validación CURP, matrícula `AAAA-NNNN`, tutores.
- M04: profesores + creación de su `User` (rol PROFESOR) e invitación.
- M05: bajas/reingresos con historial y motivo obligatorio.
- M06: expediente documental (S3, PDF/JPG/PNG ≤ 5 MB) y kardex (vista).
- Web: fichas de alumno/profesor, movimientos, expediente.

**Criterios de salida:** alta completa de alumno con tutor y documentos; baja
cancela inscripciones; kardex consultable; specs en verde.

---

### F3 — Gestión académica (3 iteraciones)
**Módulos:** M07, M08.

- M07: cursos, ciclos, grupos e inscripciones con reglas (cupo, doble inscripción,
  empalme, alumno en baja) y transacciones serializables.
- M08: assessments, captura de calificaciones, ponderaciones (suma 100%), cálculo
  final y cierre de grupo → kardex y estatus de inscripción.
- Web: oferta académica, inscripción, libro de calificaciones.

**Criterios de salida:** no se puede violar cupo/horario; el cierre de grupo
actualiza kardex; toda modificación de calificación en bitácora; specs en verde.

---

### F4 — Finanzas y reportes base (2 iteraciones)
**Módulos:** M09, M10.

- M09: conceptos, cargos, generación masiva (Idempotency-Key), pagos parciales,
  folio consecutivo, cancelación con motivo, estado de cuenta PDF.
- M10: reportes operativos (activos/baja, inscripciones, pagos, adeudos) y tablero
  básico; exportación `json|xlsx|pdf`; alcance por rol.

**Criterios de salida:** estado de cuenta y recibo correctos; folios irrepetibles;
tablero con KPIs; specs en verde.

---

### F5 — Examen en línea (3 iteraciones)
**Módulos:** M14, M15, M16, M17.

- M14: banco de reactivos + importación CSV (preview/confirm).
- M15: configuración y publicación de exámenes (aleatorización, ventanas, intentos).
- M16: aplicación al alumno (tiempo en servidor, autosave, expiración).
- M17: calificación automática, revisión manual de abiertas, escritura al kardex.
- Web: constructor de examen, pantalla del alumno, revisión del profesor.

**Criterios de salida:** examen end-to-end con calificación al kardex; tiempo
controlado en servidor; specs en verde.

---

### F6 — Asistencia y notificaciones (2 iteraciones)
**Módulos:** M18, M19.

- M18: sesiones, pase de lista, justificantes (archivo), % de asistencia y alerta
  por umbral.
- M19: plantillas, outbox con reintentos, proveedores (correo/Resend+SMTP; SMS/WA),
  preferencias/baja, disparadores; tiempo real (Ably).
- Web: pase de lista, plantillas y bandeja de notificaciones.

**Criterios de salida:** justificación aprobada cambia la falta; notificaciones
encoladas/enviadas con reintentos; specs en verde.

---

### F7 — Migración de históricos (2 iteraciones, solapada)
**Módulo:** M20.

- Documentar fuentes, mapeo origen→destino, script con `dry-run`, limpieza,
  importación por lotes idempotente, conciliación y acta de aceptación.
- Se puede iniciar en paralelo desde F2 (cuando existan alumnos/cursos) y cerrar
  tras F4 (pagos) y F3 (calificaciones).

**Criterios de salida:** reejecutar no duplica; totales conciliados por muestreo.

---

### F8 — Analítica ejecutiva (1–2 iteraciones)
**Módulo:** M21.

- Indicadores (deserción, morosidad, ingresos vs. proyección, rendimiento,
  ocupación, tendencia) con filtros por ciclo/nivel/curso/grupo.
- Vistas materializadas/índices; gráficas comparativas; exportación PDF/Excel.

**Criterios de salida:** tablero ejecutivo con datos conciliados; consultas dentro
de presupuesto de rendimiento; specs en verde.

---

### F9 — Endurecimiento, despliegue y capacitación (2 iteraciones)
**Módulos:** M12, M13.

- M12: revisión OWASP, rate limiting, cabeceras, CORS, respaldos automáticos,
  `docker-compose` de producción, script de semillas.
- M13: manuales por rol, guía rápida, capacitación, pendientes post-lanzamiento.
- Despliegue a producción y plan de continuidad.

**Criterios de salida:** checklist de despliegue completo; respaldo/restauración
probados; capacitación realizada; acta de aceptación.

## 4. Hitos de aceptación (con el cliente)

| Hito | Al cierre de | Se valida |
|---|---|---|
| H0 — Alcance | M01 | Flujos y alcance por escrito |
| H1 — Accesos | F1 | Login, roles, catálogos, bitácora |
| H2 — Alumnos | F2 | Alta/baja/reingreso, expediente |
| H3 — Academia | F3 | Inscripciones y calificaciones |
| H4 — Finanzas | F4 | Cargos, pagos y estado de cuenta |
| H5 — Exámenes | F5 | Examen en línea end-to-end |
| H6 — Operación | F6 | Asistencia y notificaciones |
| H7 — Datos | F7 | Migración conciliada |
| H8 — Dirección | F8 | Tablero ejecutivo |
| H9 — Lanzamiento | F9 | Seguridad, respaldos, capacitación |

## 5. Flujos transversales (corren en todas las fases)

| Flujo | Actividades |
|---|---|
| **Calidad (QA)** | Specs Playwright por módulo (unit + contrato/navegador), cobertura ≥ 70% en servicios, regresión de specs afectados, pruebas de seguridad |
| **Seguridad** | Validación Zod, RBAC/ABAC, auditoría, OWASP, rate limiting, revisión de cargas de archivos |
| **Datos** | Migraciones versionadas, migración de históricos (M20), respaldos y restauración probada |
| **DevOps** | CI/CD, imágenes por proyecto, healthchecks, entornos y secretos |
| **Documentación** | README por módulo, `DECISIONES.md` al día, OpenAPI, manuales (M13) |
| **Producto** | Refinamiento, decisiones `A-###`, puertas de aceptación por fase |

## 6. Riesgos y mitigaciones (complementa el roadmap)

| Riesgo | Fase | Impacto | Mitigación |
|---|---|---|---|
| Migración inicial de Prisma pendiente | F0 | Alto | Generarla antes de cualquier deploy; job de migraciones en CI |
| Decisiones abiertas (SMS/WA, recargos, aprobación) | F1/F4/F5 | Medio | Cerrarlas en el refinamiento de cada fase; registrar en `DECISIONES.md` |
| Reglas de cupo/empalme mal probadas | F3 | Alto | Specs dedicadas + transacciones serializables |
| Datos históricos sucios | F7 | Alto | `dry-run` + conciliación por muestreo |
| Fugas de expedientes | F2 | Alto | S3 privado + descarga autorizada |
| Rendimiento de reportes | F8 | Medio | Vistas materializadas e índices |
| Dependencia del cliente para validar | Todas | Medio | Puertas de aceptación agendadas al cierre de cada fase |

## 7. Cómo se mide el avance

- **Por módulo:** checklist de [definición de terminado](roadmap.md#3-definición-de-terminado-por-módulo).
- **Por fase:** criterios de salida cumplidos + specs en verde + hito aceptado.
- **Global:** módulos en `Terminado` / 21, y fases cerradas / 10.
