# M13 — Gestión y capacitación

| Campo | Valor |
|---|---|
| **Código** | M13 |
| **Versión** | 0.1 |
| **Estado** | Planeado |
| **Fase** | Gestión |
| **Depende de** | M12 (calidad y despliegue) y todos los módulos funcionales |
| **Habilita a** | Lanzamiento y operación con usuarios reales |
| **Permisos** | No aplica (módulo transversal de proceso) |

## 1. Objetivo

Dejar lista a la institución para usar el SGE: manuales de usuario por rol, guía
rápida de operación, material de capacitación con datos de ejemplo y una lista de
pendientes posterior al lanzamiento. No es software: es el cierre de gestión del
proyecto.

## 2. Alcance

**Incluye**
- **Manual de usuario por rol** (PDF o Markdown con capturas).
- **Guía rápida de operación** (tareas frecuentes).
- **Sesión de capacitación** por rol, con guion, ejercicios y datos de ejemplo.
- **Lista de pendientes post-lanzamiento** y acta de capacitación.

**No incluye (en este módulo)**
- Desarrollo o corrección de funcionalidad: si un flujo falla, se reporta y se
  atiende en su módulo.
- El script de semillas y la infraestructura de despliegue/respaldo (M12).
- Soporte de primer nivel posterior al lanzamiento (se define el canal y el
  responsable, pero no se opera aquí).

Detalle de contenido en [`manuales.md`](../../capacitacion/manuales.md).

## 3. Modelo de datos (Prisma)

**No aplica.** M13 no define entidades, migraciones ni consultas. Consume datos de
ejemplo generados por el **script de semillas de M12** para las sesiones de
capacitación y las capturas de los manuales.

## 4. Reglas de negocio

1. Existe **un manual por rol** (`admin`, `control_escolar`, `profesor`, y
   `alumno` si se habilita el portal).
2. Cada manual incluye capturas de pantalla, pasos numerados y los **mensajes de
   error comunes con qué hacer**.
3. La guía rápida cubre las tareas frecuentes: alta de alumno (con CURP y tutor),
   inscripción a grupo (cupo y horario), captura de calificaciones y cierre,
   registro de pago y recibo, baja/reingreso y configuración/publicación de
   examen en línea.
4. La capacitación es **por rol**, con guion y ejercicios sobre los datos de
   ejemplo de M12.
5. Existe un **canal de soporte** documentado y una ruta de escalamiento.
6. Cada manual y guía indica **versión y fecha** de última actualización.
7. Todo entregable se cierra con **acta de capacitación** y lista de pendientes
   post-lanzamiento con responsable.

## 5. API

**No aplica.** M13 no expone endpoints ni módulo en `api/src/modules/`. Cualquier
funcionalidad que un manual necesite ya existe en su módulo correspondiente.

## 6. Web

**No aplica.** M13 no crea capas FSD, entidades ni pantallas. Los manuales
**documentan** las pantallas ya construidas con el Axzy UI System
(`ITPage`, `ITDataTable`, `ITFormBuilder`, `ITDialog`, `ITSearchSelect`,
`ITDropfile`, `PanelCard`, `KpiTile`).

## 7. Permisos y alcance

**No aplica.** M13 no introduce permisos `recurso.accion` ni scoping. La
documentación se organiza según los roles base y la matriz ya definida en
[`roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

**No aplica** validación con Zod. La revisión es **editorial**: ortografía,
enlaces vigentes, capturas actualizadas y coherencia con el flujo real de cada
pantalla.

## 9. Bitácora

**No aplica.** M13 no ejecuta escrituras de negocio, por lo que no registra
acciones vía `AuditPort`. La bitácora se usa únicamente como **fuente** para
documentar en los manuales cómo consultar la actividad del sistema (permiso
`audit.view`, M02).

## 10. Pruebas (Playwright)

**No aplica** la suite Playwright: no hay código que ejecutar. La verificación es
manual y se registra con:

- Lista de control de entregables (§5 de [`manuales.md`](../../capacitacion/manuales.md)).
- Revisión cruzada de cada manual contra la pantalla real usando los datos de
  ejemplo de M12.
- **Acta de capacitación** firmada por los asistentes por rol.

## 11. Criterios de aceptación

- [ ] Manual por rol (PDF o Markdown con capturas) entregado y revisado.
- [ ] Guía rápida de operación entregada.
- [ ] Material de capacitación y datos de ejemplo listos (seed de M12).
- [ ] Sesión de capacitación impartida por rol, con acta.
- [ ] Lista de pendientes post-lanzamiento con responsables y fechas.
- [ ] Canal de soporte y escalamiento documentados.
- [ ] Este README completo.

## 12. Decisiones abiertas

- Formato final de los manuales (PDF con capturas vs. Markdown navegable).
- ¿Se habilita el portal del alumno en el lanzamiento inicial?
- Periodicidad de actualización de manuales y quién los mantiene.
- Herramienta del canal de soporte (correo, mesa de ayuda, chat).
- Alcance de la capacitación a tutores/padres, si aplica.

Registrar en [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Manuales y capacitación (M13)](../../capacitacion/manuales.md)
- [Roles y permisos](../../seguridad/roles-permisos.md)
- [Bitácora](../../seguridad/bitacora.md)
- [Despliegue](../../arquitectura/despliegue.md) · [Respaldos](../../operacion/respaldos.md)
- [Estrategia de pruebas](../../pruebas/estrategia-pruebas.md) (seed de M12)
- [Roadmap](../../guia/roadmap.md) · [Índice de módulos](../README.md)
