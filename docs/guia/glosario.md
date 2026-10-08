# Glosario

Términos del dominio escolar y del sistema (estándar PTNV + Axzy UI System).
Mantener orden alfabético.

| Término | Definición |
|---|---|
| **ABAC** | Control de acceso basado en atributos/contexto (tabla `policies`); actúa después del RBAC. |
| **Acreditado** | Estatus de una inscripción cuando el alumno alcanza la calificación mínima del curso. |
| **Alcance (scope)** | Nivel de acceso de un permiso: `NONE < OWN < AREA < ALL`. |
| **Alumno (Student)** | Persona inscrita o con historial; se identifica por `matricula` y `curp`. |
| **AREA** | Alcance sobre el ámbito del usuario (p. ej. el profesor sobre sus grupos). |
| **Assessment** | Actividad evaluable de un grupo (parcial, final, tarea, otro) con ponderación. |
| **AuditLog** | Bitácora de escrituras y accesos denegados; se escribe vía `AuditPort`. |
| **AuditPort** | Puerto (DIP) con `createLog(input, tx?)` que los módulos usan para auditar. |
| **Axzy UI System** | Librería de componentes `IT*` (`@axzydev/axzy_ui_system`) usada por toda la web. |
| **Baja** | Movimiento que desactiva al alumno sin borrar su historial. |
| **Ciclo escolar (Term)** | Periodo lectivo con fecha de inicio y fin (p. ej. 2025-2026). |
| **Cargo (Charge)** | Monto a cobrar a un alumno por un concepto y ciclo. |
| **Cutover** | `migrate deploy` + seed forzado: reemplaza los datos por los fixtures. |
| **CURP** | Clave Única de Registro de Población (México); formato validado. |
| **Cupo** | Número máximo de alumnos de un grupo. |
| **Empalme de horario** | Traslape de horarios de dos grupos del mismo alumno; se prohíbe. |
| **Enrollment (Inscripción)** | Vínculo entre alumno y grupo con estatus y fecha. |
| **Estado de cuenta** | Resumen de cargos y pagos de un alumno. |
| **Excepción (user_permissions)** | Permiso extra otorgado a una persona, con vigencia opcional. |
| **FSD (Feature-Sliced Design)** | Arquitectura de la web: `app · shared · entities · features · widgets · pages`. |
| **Grupo (Group)** | Conjunto de alumnos que cursan un curso con un profesor, horario y aula. |
| **Guardian (Tutor)** | Persona responsable de un alumno; puede ser responsable de pago. |
| **Idempotency-Key** | Cabecera que hace repetible una escritura no idempotente sin duplicar. |
| **ITDataTable** | Componente del UI kit para listados server-side (contrato `POST …/query`). |
| **Kardex** | Vista calculada con el historial de cursos, calificaciones y acreditación. |
| **Matrícula** | Identificador del alumno con formato `AAAA-NNNN`. |
| **Morosidad** | Porcentaje/monto de adeudos vencidos. |
| **NONE / OWN / AREA / ALL** | Alcances posibles de un permiso. |
| **Outbox** | Patrón de correo: se encola (`email_logs PENDING`) y un worker drena con reintentos. |
| **OWN** | Alcance sobre los propios registros (p. ej. el alumno sobre su kardex). |
| **Parcial** | Evaluación intermedia de un curso. |
| **Pago parcial** | Abono que no cubre el total; el cargo queda `parcial`. |
| **Ponderación** | Peso porcentual de un assessment en la calificación final (suma 100%). |
| **Reingreso** | Reactivación de un alumno dado de baja, conservando su matrícula. |
| **RBAC** | Control de acceso por rol (`roles`, `role_permissions`, `user_roles`). |
| **scopeOf / withinScope** | Resolutor y aplicación del alcance por registro en los servicios. |
| **Soft delete** | Baja lógica por dominio (`active`, `deletedAt`, `cancelledAt`); no `DELETE` físico. |
| **SGE** | Sistema de Gestión Escolar (este proyecto). |
| **Term** | Ver «Ciclo escolar». |
| **UUID** | Identificador único universal (v4), clave primaria por defecto. |
