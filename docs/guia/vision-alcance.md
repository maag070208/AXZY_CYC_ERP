# Visión y alcance

## 1. Problema

Las instituciones educativas suelen operar con hojas de cálculo dispersas y
sistemas aislados para cada área (control escolar, finanzas, docencia). Esto
provoca:

- Expedientes incompletos y difíciles de auditar.
- Inscripciones y cambios de grupo sin control de cupo ni empalmes.
- Calificaciones capturadas en papel y kardex armados a mano.
- Adeudos y pagos sin conciliación confiable.
- Reportes directivos que se arman manualmente y llegan tarde.

## 2. Objetivo

Construir un **Sistema de Gestión Escolar (SGE)** integral, web y responsivo, en
español, que centralice la operación académica, administrativa y financiera con
trazabilidad (bitácora) y control de acceso por rol.

## 3. Objetivos específicos

1. Administrar identity y accesos (`User`, `Role`, `Permission`, `AuditLog`).
2. Dar de alta alumnos y profesores con validación de datos (incl. CURP) y expediente.
3. Gestionar bajas y reingresos conservando historial.
4. Administrar cursos, ciclos, grupos e inscripciones con reglas de negocio.
5. Capturar exámenes/calificaciones y calcular el kardex.
6. Cobrar colegiaturas y registrar pagos parciales con recibos.
7. Operar exámenes en línea con calificación automática.
8. Controlar asistencia y justificantes.
9. Notificar por correo/SMS/WhatsApp.
10. Migrar datos históricos de forma repetible e idempotente.
11. Ofrecer reportes operativos y un tablero ejecutivo.

## 4. Alcance funcional (módulos)

| Fase | Módulos | Resultado |
|---|---|---|
| Descubrimiento | M01 | Alcance y prototipo aprobados |
| Núcleo | M02 | Accesos, roles y bitácora |
| Personas | M03, M04, M05 | Alumnos, profesores, bajas/reingresos |
| Académico | M06, M07, M08 | Expediente, grupos/inscripciones, calificaciones |
| Finanzas y administración | M09, M10, M11 | Pagos, reportes básicos, catálogos |
| Calidad | M12, M13 | Pruebas/seguridad/despliegue, capacitación |
| Examen en línea | M14–M17 | Banco de reactivos, exámenes, aplicación, calificación |
| Extras | M18–M21 | Asistencia, notificaciones, migración, tablero ejecutivo |

Detalle en [`roadmap.md`](roadmap.md) y en [`../modulos/README.md`](../modulos/README.md).

## 5. Usuarios y roles

| Rol | Necesidad principal |
|---|---|
| `admin` | Configurar el sistema, gestionar usuarios y ver todo |
| `control_escolar` | Altas/bajas, expediente, inscripciones, cobranza |
| `profesor` | Sus grupos: calificaciones, asistencia, exámenes |
| `alumno` | (si se habilita) consultar calificaciones, pagos, exámenes en línea |

Ver [`../seguridad/roles-permisos.md`](../seguridad/roles-permisos.md).

## 6. Fuera de alcance

- **CFDI / facturación electrónica.**
- **Pagos en línea** (el pago es manual y se registra en el sistema).
- **Servidor / hosting** (la institución decide dónde desplegar).

Cualquier otro límite se registra en [`../../DECISIONES.md`](../../DECISIONES.md).

## 7. Supuestos

- Existe conectividad a internet en el uso diario; el sistema es web.
- La institución provee los datos históricos en Excel/CSV o base anterior.
- Hay al menos un administrador con acceso a la infraestructura.
- Las credenciales y secretos viven en `.env`, nunca en el repositorio.

## 8. Métricas de éxito

- Expediente completo (documentos + kardex) consultable para el 100% de alumnos activos.
- Cero inscripciones que violen cupo u horario.
- Kardex actualizado automáticamente al cerrar grupo.
- Estado de cuenta y recibo disponibles sin trabajo manual.
- Bitácora cubriendo el 100% de operaciones de escritura.

## 9. Estándares de implementación

El proyecto reutiliza la arquitectura y convenciones ya probadas en el sistema
**PTNV** y el **Axzy UI System** de la casa. En resumen:

- API **Express + TypeScript + Prisma + Zod**, módulos en `src/core` + `src/modules`.
- Web **React + Vite + Redux Toolkit + Feature-Sliced Design** con el UI kit propio.
- **RBAC dinámico + ABAC** con alcances `NONE/OWN/AREA/ALL`, excepciones y políticas.
- Listados **server-side** (`POST …/query`), bitácora por `AuditPort`, idempotencia.
- Pruebas **Playwright** (contrato + unitarias), solo el spec del cambio.

El detalle vive en [`convenciones.md`](convenciones.md), [`../arquitectura/`](../arquitectura/)
y [`../../DECISIONES.md`](../../DECISIONES.md).
