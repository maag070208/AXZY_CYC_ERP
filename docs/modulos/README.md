# Módulos

Índice de los 21 módulos del SGE. Cada módulo tiene su propio `README.md` con
objetivo, alcance, entidades, reglas de negocio, endpoints, pantallas, permisos,
validaciones, bitácora, casos de prueba, criterios de aceptación y decisiones
abiertas, siguiendo la
[plantilla de módulo](../plantillas/plantilla-modulo.md).

> El orden de construcción es el del [roadmap](../guia/roadmap.md). No se avanza
> sin que el módulo anterior funcione y tenga pruebas.

## Descubrimiento

| Código | Módulo | Objetivo | Estado |
|---|---|---|---|
| M01 | [Análisis y prototipo](M01-analisis-prototipo/README.md) | Requerimientos, ERD, mapa de pantallas y prototipo navegable | Planeado |

## Núcleo

| Código | Módulo | Objetivo | Estado |
|---|---|---|---|
| M02 | [Autenticación, roles y bitácora](M02-autenticacion-roles-bitacora/README.md) | Login, RBAC y auditoría | Terminado (F1) |
| M11 | [Administración y catálogos](M11-administracion-catalogos/README.md) | Configuración y catálogos base | Terminado (F1) |

## Personas

| Código | Módulo | Objetivo | Estado |
|---|---|---|---|
| M03 | [Alumnos](M03-alumnos/README.md) | Altas y búsqueda de alumnos | Terminado (F2) |
| M04 | [Profesores](M04-profesores/README.md) | Altas de profesores y su cuenta | Terminado (F2) |
| M05 | [Bajas y reingresos](M05-bajas-reingresos/README.md) | Movimientos conservando historial | Terminado (F2) |

## Expediente y academia

| Código | Módulo | Objetivo | Estado |
|---|---|---|---|
| M06 | [Kardex y expediente documental](M06-kardex-expediente/README.md) | Documentos y kardex por alumno | Terminado (F2) |
| M07 | [Cursos, grupos e inscripciones](M07-cursos-grupos-inscripciones/README.md) | Oferta académica e inscripciones con reglas | Terminado (F3) |
| M08 | [Exámenes y calificaciones](M08-examenes-calificaciones/README.md) | Captura de calificaciones y cálculo final | Terminado (F3) |

## Finanzas y administración

| Código | Módulo | Objetivo | Estado |
|---|---|---|---|
| M09 | [Colegiaturas y pagos](M09-colegiaturas-pagos/README.md) | Cargos, pagos y estado de cuenta | Terminado (F4) |
| M10 | [Reportes y tablero básico](M10-reportes-tablero/README.md) | Reportes operativos y tablero | Terminado (F4) |

## Calidad y examen en línea

| Código | Módulo | Objetivo | Estado |
|---|---|---|---|
| M12 | [Pruebas, seguridad y despliegue](M12-pruebas-seguridad-despliegue/README.md) | Calidad y puesta en producción | Planeado |
| M13 | [Gestión y capacitación](M13-gestion-capacitacion/README.md) | Manuales y capacitación | Planeado |
| M14 | [Banco de reactivos](M14-banco-reactivos/README.md) | Preguntas e importación | Planeado |
| M15 | [Configuración de exámenes](M15-examenes-configuracion/README.md) | Crear y publicar exámenes en línea | Planeado |
| M16 | [Aplicación al alumno](M16-aplicacion-alumno/README.md) | Aplicar exámenes y guardar respuestas | Planeado |
| M17 | [Calificación automática al kardex](M17-calificacion-kardex/README.md) | Calificar y escribir al kardex | Planeado |

## Extras

| Código | Módulo | Objetivo | Estado |
|---|---|---|---|
| M18 | [Asistencia y justificantes](M18-asistencia-justificantes/README.md) | Control de asistencia | Planeado |
| M19 | [Notificaciones](M19-notificaciones/README.md) | Correo, SMS y WhatsApp | Planeado |
| M20 | [Migración de datos históricos](M20-migracion-historica/README.md) | Importación repetible e idempotente | Planeado |
| M21 | [Reportes y tablero ejecutivo](M21-reportes-ejecutivos/README.md) | Indicadores avanzados | Planeado |
