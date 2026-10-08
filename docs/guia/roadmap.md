# Roadmap de construcción

Regla de oro: **un módulo a la vez, en el orden indicado**. No se avanza sin que
el módulo anterior funcione y tenga pruebas.

## 1. Fases y dependencias

```
M01 Análisis y prototipo
  └─> M02 Autenticación, roles y bitácora
        ├─> M03 Alumnos ──┬─> M05 Bajas y reingresos
        │                  └─> M06 Kardex y expediente
        ├─> M04 Profesores ─┐
        ├─> M11 Administración y catálogos
        └─> M07 Cursos, grupos e inscripciones
              ├─> M08 Exámenes y calificaciones
              ├─> M18 Asistencia y justificantes (extra)
              └─> M14 Banco de reactivos
                    └─> M15 Configuración de exámenes
                          └─> M16 Aplicación al alumno
                                └─> M17 Calificación automática al kardex
M09 Colegiaturas y pagos  (depende de M03 y M07)
M10 Reportes y tablero básico (depende de M03, M07, M08, M09)
M12 Pruebas, seguridad y despliegue (transversal, cierra cada fase)
M13 Gestión y capacitación (previa a lanzamiento)
M19 Notificaciones (depende de M09 y M15)
M20 Migración de históricos (puede iniciar en paralelo a M09)
M21 Reportes y tablero ejecutivo (depende de M10 y M20)
```

## 2. Orden de ejecución sugerido

| Orden | Módulo | Fase | Hito |
|---|---|---|---|
| 1 | M01 | Descubrimiento | Alcance aprobado por escrito |
| 2 | M02 | Núcleo | Login + roles + bitácora funcionando |
| 3 | M11 | Administración | Catálogos base disponibles |
| 4 | M03 | Personas | Alta y búsqueda de alumnos |
| 5 | M04 | Personas | Alta de profesores con invitación |
| 6 | M05 | Personas | Bajas y reingresos |
| 7 | M07 | Académico | Cursos, grupos e inscripciones con reglas |
| 8 | M06 | Académico | Expediente documental |
| 9 | M08 | Académico | Captura de calificaciones y kardex |
| 10 | M09 | Finanzas | Colegiaturas, cargos y pagos |
| 11 | M10 | Finanzas | Reportes y tablero básico |
| 12 | M14 | Examen en línea | Banco de reactivos |
| 13 | M15 | Examen en línea | Configuración y publicación de exámenes |
| 14 | M16 | Examen en línea | Aplicación al alumno |
| 15 | M17 | Examen en línea | Calificación automática al kardex |
| 16 | M18 | Extras | Asistencia y justificantes |
| 17 | M19 | Extras | Notificaciones multicanal |
| 18 | M20 | Extras | Migración de históricos |
| 19 | M21 | Extras | Tablero ejecutivo avanzado |
| 20 | M12 | Calidad | Pruebas, OWASP, despliegue |
| 21 | M13 | Gestión | Manuales y capacitación |

> M12 es transversal: sus prácticas (pruebas, validación, seguridad) se aplican
> desde el primer módulo, aunque su revisión formal cierre el proyecto.

## 3. Definición de «terminado» por módulo

Un módulo se considera terminado cuando:

- [ ] Migración y modelo Prisma (con índices y convenciones del estándar).
- [ ] Módulo API (`routes/ · controllers/ · services/ · models/{dto,entity}/`) con
      validación Zod, `requiresPermission`/alcance y bitácora por `AuditPort`.
- [ ] Pantallas web (FSD: entity → feature → page) con el Axzy UI System, i18n y validación.
- [ ] Specs Playwright del módulo (unit + contrato/navegador) pasando.
- [ ] README del módulo completo según la [plantilla](../plantillas/plantilla-modulo.md).
- [ ] Criterios de aceptación del módulo cumplidos.
- [ ] Decisiones ambiguas registradas en [`../../DECISIONES.md`](../../DECISIONES.md).

## 4. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Datos históricos sucios | Alto | M20 con `dry-run` y conciliación por muestreo |
| Reglas de negocio ambiguas (aprobación, recargos) | Medio | Registrar en `DECISIONES.md` y confirmar con el cliente |
| Empalmes/cupo mal validados | Alto | Pruebas dedicadas en M07 |
| Fugas de archivos de expediente | Alto | Archivos fuera de public, acceso autorizado |
| Crecimiento de reportes sin índices | Medio | Vistas materializadas e índices en M21 |
