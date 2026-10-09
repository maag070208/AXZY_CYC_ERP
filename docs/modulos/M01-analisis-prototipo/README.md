# M01 — Análisis y prototipo

| Campo | Valor |
|---|---|
| **Código** | M01 |
| **Versión** | 0.1 |
| **Estado** | Planeado |
| **Fase** | Descubrimiento |
| **Depende de** | — (es el punto de partida del proyecto) |
| **Habilita a** | M02, M03, M04, M07, M09, M10 y, en cadena, al resto del [roadmap](../../guia/roadmap.md) |
| **Permisos** | No aplica (trabajo de análisis previo a la implementación) |

## 1. Objetivo

Cerrar con el cliente **qué** se va a construir y **cómo se ve**, antes de escribir
código: requerimientos, modelo entidad-relación, mapa de pantallas y un prototipo
navegable que permita validar los flujos reales de la institución.

## 2. Alcance

**Incluye**
- Documento de requerimientos (funcionales y no funcionales) del SGE.
- Diagrama entidad-relación de alto nivel (todas las áreas del sistema).
- Mapa de pantallas: navegación, roles que ven cada pantalla y acciones por pantalla.
- Prototipo navegable de los flujos críticos (login, alta de alumno, inscripción,
  calificaciones, cobro, examen en línea, reportes).
- Sesión de validación con el cliente y registro de acuerdos/alcance.

**No incluye (en este módulo)**
- Código de producción (API, web, migraciones): eso es M02 en adelante.
- Diseño final de UI ni integración con el Axzy UI System (el prototipo es de baja fidelidad).
- Datos reales; el prototipo usa datos de ejemplo.

## 3. Modelo de datos (Prisma)

**No aplica.** M01 no crea modelos, migraciones ni tablas: es un entregable de
análisis. El **diagrama entidad-relación** producido aquí es la base que después
se detalla en [`../../modelo-datos/entidad-relacion.md`](../../modelo-datos/entidad-relacion.md)
y [`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md).
Las convenciones de persistencia (UUID, `createdAt`/`updatedAt`, `active`/borrado
lógico por dominio, `@@map`) están en
[`../../guia/convenciones.md`](../../guia/convenciones.md) y en
[D-003](../../../DECISIONES.md).

**Índices:** No aplica.
**Relaciones:** No aplica (se describen a nivel conceptual en el ERD).

## 4. Reglas de negocio

1. Todo requerimiento funcional tiene **origen** (área/rol solicitante), **prioridad**
   y **criterio de aceptación** verificable.
2. Cada módulo del [roadmap](../../guia/roadmap.md) (M02–M21) aparece al menos una
   vez en el ERD, el mapa de pantallas o el documento de requerimientos.
3. El ERD cubre todas las entidades del spec original y respeta el estándar de la
   casa (claves, catálogos, bitácora, RBAC).
4. El mapa de pantallas es **único**: cada pantalla declara la ruta, la capa FSD
   prevista (`entities`/`features`/`pages`) y el permiso `recurso.accion` que la gobierna.
5. El prototipo navegable cubre, como mínimo, un flujo completo por rol
   (`ADMIN`, `SCHOOL_CONTROL`, `TEACHER`, `STUDENT`).
6. Todo lo no resuelto por el cliente se registra como decisión abierta en
   [`DECISIONES.md`](../../../DECISIONES.md), no se asume.
7. **El alcance se aprueba por escrito**; sin esa firma M01 no se considera terminado.

## 5. API

**No aplica.** M01 no define endpoints. Las convenciones que regirán la API
(Express modular, `/api/v1`, Zod, errores planos, tablas server-side `POST …/query`)
se fijan en [`../../api/convenciones.md`](../../api/convenciones.md),
[`../../arquitectura/api-modular.md`](../../arquitectura/api-modular.md) y
[D-001/D-002/D-004/D-010](../../../DECISIONES.md).

## 6. Web

**No aplica** como pantalla de producción. El **prototipo navegable** es de baja
fidelidad y no usa el Axzy UI System; sirve para acordar flujos. El mapa de
pantallas sí anticipa la capa FSD (`entities` → `features` → `pages`) y el kit
(`ITPage`, `ITDataTable`, `ITFormBuilder`, `ITDialog`, `PanelCard`, `KpiTile`)
descritos en [`../../arquitectura/web-fsd.md`](../../arquitectura/web-fsd.md) y
[`../../arquitectura/axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).

## 7. Permisos y alcance

**No aplica** (no hay endpoints ni pantallas productivas). El mapa de pantallas sí
define, de forma preliminar, qué permiso `recurso.accion` y qué alcance
(`NONE/OWN/AREA/ALL`) necesita cada rol; el catálogo definitivo vive en
[`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

Validaciones propias del entregable de análisis (revisión manual, no Zod):

- Cobertura: todo módulo del roadmap aparece al menos una vez.
- Consistencia: nombres de entidades y pantallas coinciden con el
  [glosario](../../guia/glosario.md).
- Trazabilidad: cada requerimiento mapea a un módulo y a un criterio de aceptación.
- Claridad: el prototipo reproduce el vocabulario del cliente (matrícula, tutor,
  colegiatura, kardex, etc.).

## 9. Bitácora

**No aplica.** M01 no tiene operaciones persistidas ni `AuditPort`. La bitácora
(`audit_logs`) se implementa en [M02](../M02-autenticacion-roles-bitacora/README.md);
ver [`../../seguridad/bitacora.md`](../../seguridad/bitacora.md).

## 10. Pruebas (Playwright)

**No aplica** prueba automatizada: no hay código que ejercitar. La verificación de
M01 es la **revisión de entregables**:

- Unitarias (`api/tests/unit`): No aplica.
- Contrato (`api/tests/e2e`): No aplica.
- Navegador (`web/tests/e2e`): No aplica.
- Spec(s) del módulo: No aplica.
- Verificación manual: walkthrough del prototipo por flujo y firma de acta de aprobación.

## 11. Criterios de aceptación

- [ ] Documento de requerimientos revisado con el cliente.
- [ ] Diagrama entidad-relación acordado y consistente con el diccionario de datos.
- [ ] Mapa de pantallas con ruta, capa FSD y permiso por pantalla.
- [ ] Prototipo navegable de los flujos críticos por rol.
- [ ] **El cliente aprueba flujos y alcance por escrito.**
- [ ] Decisiones abiertas registradas en [`DECISIONES.md`](../../../DECISIONES.md).
- [ ] Este README completo.

## 12. Decisiones abiertas

- Acceso de alumnos al portal: ¿entran o el uso es solo presencial? (A-007).
- Alcance de notificaciones (correo/SMS/WhatsApp) y proveedor (A-001).
- Regla de aprobación y recargos por mora (A-002, A-003).
- Almacenamiento de expedientes: S3 o local (A-004).
- Anti-fraude en examen en línea (A-005) y umbral de inasistencia (A-006).

Ver la tabla completa en [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Visión y alcance](../../guia/vision-alcance.md)
- [Roadmap](../../guia/roadmap.md)
- [Glosario](../../guia/glosario.md)
- [Entidad-relación](../../modelo-datos/entidad-relacion.md)
- [Diccionario de datos](../../modelo-datos/diccionario-datos.md)
- [Arquitectura general](../../arquitectura/arquitectura-general.md)
- [Convenciones](../../guia/convenciones.md)
- [Registro de decisiones](../../../DECISIONES.md)
