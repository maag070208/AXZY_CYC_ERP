# Índice de documentación

Mapa maestro de la documentación del Sistema de Gestión Escolar (SGE). Refleja el
**estándar PTNV** y el **Axzy UI System**.

> ¿Primera vez aquí? Lee [`guia/vision-alcance.md`](guia/vision-alcance.md) y
> [`guia/roadmap.md`](guia/roadmap.md), en ese orden.

---

## 1. Guía general

| Documento | Qué contiene |
|---|---|
| [`guia/vision-alcance.md`](guia/vision-alcance.md) | Problema, objetivos, alcance y fuera de alcance |
| [`guia/glosario.md`](guia/glosario.md) | Términos del dominio escolar y del sistema |
| [`guia/convenciones.md`](guia/convenciones.md) | **Estándares de la casa** (API, BD, web, UI, pruebas) |
| [`guia/roadmap.md`](guia/roadmap.md) | Orden de construcción por fases y dependencias |
| [`guia/plan-implementacion.md`](guia/plan-implementacion.md) | Plan por fases: iteraciones, hitos de aceptación, riesgos y flujos transversales |

## 2. Arquitectura

| Documento | Qué contiene |
|---|---|
| [`arquitectura/arquitectura-general.md`](arquitectura/arquitectura-general.md) | Vista de componentes y flujos |
| [`arquitectura/stack.md`](arquitectura/stack.md) | Tecnologías y justificación |
| [`arquitectura/estructura-repositorio.md`](arquitectura/estructura-repositorio.md) | Organización de `api/` y `web/` |
| [`arquitectura/api-modular.md`](arquitectura/api-modular.md) | Patrón de módulo Express (routes/controllers/services/dto) |
| [`arquitectura/web-fsd.md`](arquitectura/web-fsd.md) | Feature-Sliced Design y cliente Axios |
| [`arquitectura/axzy-ui-system.md`](arquitectura/axzy-ui-system.md) | UI kit, ITDataTable, theming, patrón de página |
| [`arquitectura/despliegue.md`](arquitectura/despliegue.md) | Docker, nginx, CI/CD |

## 3. Modelo de datos

| Documento | Qué contiene |
|---|---|
| [`modelo-datos/entidad-relacion.md`](modelo-datos/entidad-relacion.md) | Diagrama entidad-relación (Mermaid) |
| [`modelo-datos/diccionario-datos.md`](modelo-datos/diccionario-datos.md) | Tablas, campos y enums (generado desde `schema.prisma`) |

## 4. API

| Documento | Qué contiene |
|---|---|
| [`api/convenciones.md`](api/convenciones.md) | REST, tablas server-side, idempotencia |
| [`api/autenticacion.md`](api/autenticacion.md) | Login, refresh rotado, `/auth/me` |
| [`api/errores.md`](api/errores.md) | Envelope plano y catálogo de códigos |

## 5. Seguridad

| Documento | Qué contiene |
|---|---|
| [`seguridad/seguridad-owasp.md`](seguridad/seguridad-owasp.md) | OWASP Top 10 y hardening |
| [`seguridad/roles-permisos.md`](seguridad/roles-permisos.md) | RBAC dinámico + ABAC + alcances + matriz |
| [`seguridad/bitacora.md`](seguridad/bitacora.md) | `audit_logs` y `AuditPort` |

## 6. Módulos (M01–M22)

Índice detallado en [`modulos/README.md`](modulos/README.md). Cada módulo tiene su
`README.md` con objetivo, modelo Prisma, reglas, API, web (FSD), permisos,
bitácora, pruebas y criterios de aceptación.

| Fase | Módulos |
|---|---|
| Descubrimiento | [M01](modulos/M01-analisis-prototipo/README.md) |
| Núcleo | [M02](modulos/M02-autenticacion-roles-bitacora/README.md) · [M11](modulos/M11-administracion-catalogos/README.md) |
| Personas | [M03](modulos/M03-alumnos/README.md) · [M04](modulos/M04-profesores/README.md) · [M05](modulos/M05-bajas-reingresos/README.md) |
| Expediente y academia | [M06](modulos/M06-kardex-expediente/README.md) · [M07](modulos/M07-cursos-grupos-inscripciones/README.md) · [M08](modulos/M08-examenes-calificaciones/README.md) |
| Finanzas | [M09](modulos/M09-colegiaturas-pagos/README.md) · [M10](modulos/M10-reportes-tablero/README.md) |
| Calidad y examen en línea | [M12](modulos/M12-pruebas-seguridad-despliegue/README.md) · [M13](modulos/M13-gestion-capacitacion/README.md) · [M14](modulos/M14-banco-reactivos/README.md) · [M15](modulos/M15-examenes-configuracion/README.md) · [M16](modulos/M16-aplicacion-alumno/README.md) · [M17](modulos/M17-calificacion-kardex/README.md) |
| Extras | [M18](modulos/M18-asistencia-justificantes/README.md) · [M19](modulos/M19-notificaciones/README.md) · [M20](modulos/M20-migracion-historica/README.md) · [M21](modulos/M21-reportes-ejecutivos/README.md) · [M22](modulos/M22-programas-planes-pago/README.md) |

## 7. Operación

| Documento | Qué contiene |
|---|---|
| [`operacion/entornos.md`](operacion/entornos.md) | Variables de entorno (estándar PTNV) |
| [`operacion/despliegue.md`](operacion/despliegue.md) | Publicación en Railway (API + Postgres) y Hostinger (web) |
| [`operacion/respaldos.md`](operacion/respaldos.md) | Respaldos, `restore`, `seed:from-backup`, `cutover` |
| [`operacion/migracion-datos.md`](operacion/migracion-datos.md) | Proceso de importación histórica (M20) |

## 8. Pruebas y capacitación

| Documento | Qué contiene |
|---|---|
| [`pruebas/estrategia-pruebas.md`](pruebas/estrategia-pruebas.md) | Playwright: unit + contrato, aislamiento, cobertura |
| [`capacitacion/manuales.md`](capacitacion/manuales.md) | Plan de manuales por rol y capacitación |

## 9. Plantillas y decisiones

| Documento | Qué contiene |
|---|---|
| [`plantillas/plantilla-modulo.md`](plantillas/plantilla-modulo.md) | Estructura obligatoria de un README de módulo |
| [`../DECISIONES.md`](../DECISIONES.md) | Registro de decisiones |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Cómo contribuir |
