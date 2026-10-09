# Roles y permisos (RBAC + ABAC)

Control de acceso del SGE, con el mismo motor que PTNV: **RBAC dinámico** +
**alcances** + **excepciones por persona** + **políticas ABAC**. Todo vive en
base de datos con cache en memoria y **fail-closed** (ver [D-009](../../DECISIONES.md)).

## 1. Modelo

| Tabla | Contenido |
|---|---|
| `permissions` | Catálogo (`key` = `modulo.accion`, `module`, `name`, `scopes[]`, `sensitive`, `active`, `sortOrder`) |
| `roles` | Roles dinámicos (`key`, `name`, `module`, `staff`, `system`, `active`, `sortOrder`) |
| `role_permissions` | Matriz rol → permiso → **alcance** (ausencia = `NONE`) |
| `user_roles` | Multi-rol (`[userId, role]`) |
| `user_permissions` | Excepciones por persona (`scope`, `reason`, `expiresAt`, `grantedById`) |
| `policies` + `policy_conditions` + `policy_roles` | Políticas ABAC |

## 2. Alcances

`NONE < OWN < AREA < ALL`. La unión de roles toma el **alcance mayor**
(`maxScope`): los roles suman, nunca restan. Una excepción vigente gana sobre el rol.

| Alcance | Significado en el SGE |
|---|---|
| `NONE` | Sin acceso |
| `OWN` | Solo sus propios registros (p. ej. el alumno ve su kardex/pagos) |
| `AREA` | Su ámbito (p. ej. el profesor solo sus grupos y sus alumnos) |
| `ALL` | Todos los registros del recurso |

## 3. Roles base (sembrados)

| Rol (`key`) | Descripción |
|---|---|
| `ADMIN` | Acceso total; usuarios, roles, políticas, bitácora, configuración |
| `CONTROL_ESCOLAR` | Operación académico-administrativa: altas, expediente, inscripciones, cobranza, reportes |
| `PROFESOR` | Sus grupos: calificaciones (OWN/AREA), asistencia, banco de reactivos y exámenes |
| `ALUMNO` | Consulta de su información y presentación de exámenes (si se habilita) |

Los roles son **dinámicos**: el admin puede crear más desde la consola `/roles`.
Los roles `system` están protegidos de borrado/renombrado.

## 4. Catálogo de permisos (por módulo)

`modulo.accion`; el alcance por defecto se ajusta en la matriz.

| Módulo | Permisos |
|---|---|
| `users` | `users.view`, `users.create`, `users.edit`, `users.delete`, `users.permissions` |
| `roles` | `roles.manage` (consola de acceso: roles, matriz, políticas, catálogo) |
| `audit` | `audit.view` |
| `config` | `config.view`, `config.manage` |
| `levels` | `levels.view`, `levels.manage` (catálogo M11) |
| `students` | `students.view`, `students.create`, `students.edit`, `students.delete`, `students.export` |
| `students` | `students.movements` (bajas/reingresos; ALL u OWN) |
| `teachers` | `teachers.view`, `teachers.create`, `teachers.edit` |
| `documents` | `documents.view`, `documents.upload`, `documents.validate`, `documents.delete` |
| `kardex` | `kardex.view`, `kardex.export` |
| `courses` | `courses.view`, `courses.manage` |
| `terms` | `terms.view`, `terms.manage` |
| `groups` | `groups.view`, `groups.manage` |
| `enrollments` | `enrollments.view`, `enrollments.create`, `enrollments.edit`, `enrollments.delete` |
| `assessments` | `assessments.view`, `assessments.manage` |
| `grades` | `grades.view`, `grades.capture`, `grades.export` |
| `fees` | `fee_concepts.manage` |
| `charges` | `charges.view`, `charges.create`, `charges.generate`, `charges.cancel` |
| `payments` | `payments.register`, `payments.cancel` |
| `reports` | `reports.view`, `reports.export` |
| `questions` | `questions.view`, `questions.create`, `questions.edit`, `questions.import` |
| `exams` | `exams.view`, `exams.manage`, `exams.publish` |
| `attempts` | `attempts.view`, `attempts.review`, `attempts.take` |
| `attendance` | `attendance.view`, `attendance.manage`, `attendance.justify` |
| `notifications` | `notifications.view`, `notifications.manage` |
| `migration` | `migration.execute` |

## 5. Matriz resumida rol × recurso

**C** crear, **R** leer, **U** editar, **D** baja/cancelar, **X** exportar, `·` sin acceso.

| Recurso | ADMIN | CONTROL_ESCOLAR | PROFESOR | ALUMNO |
|---|---|---|---|---|
| users / roles / config | CRUD | · (config R) | · | · |
| audit | R X | · | · | · |
| students | CRUD X | CRUD X | R (AREA) | R (OWN) |
| teachers | CRUD | R | R (OWN) | · |
| movements | CRUD | CRUD | · | R (OWN) |
| documents | CRUD + validate | CRUD + validate | R (AREA) | R (OWN) |
| kardex | R X | R X | R (AREA) | R (OWN) |
| courses / terms | CRUD | R | R (cursos AREA; ciclos ALL) | · |
| groups | CRUD | CRUD | R (AREA) | R (OWN) |
| enrollments | CRUD | CRUD | R (AREA) | R (OWN) |
| assessments / grades | CRUD + cierre | R X | CRUD + captura + cierre (AREA) X | R (OWN) |

> **AREA académico (F3):** el ámbito del profesor son **sus grupos** (`groups.teacher_id`
> → `teachers.user_id`), registrado por M07 como resolvedor `groups`; los alumnos con
> inscripción vigente en esos grupos forman el `AREA` de `students` (expediente y kardex).
> Fuera de su ámbito, las lecturas responden 404 y las escrituras 403. Ver D-028.
| fees / charges / payments | CRUD | CRUD | · | R (OWN: estado de cuenta) |
| reports | R X | R X | R (AREA, sin montos) X | · |
| questions / exams | CRUD | R | CRUD (AREA) | · |
| attempts | R | R | R (AREA) + review | take (OWN) |
| attendance | CRUD | R | CRUD (AREA) | R (OWN) |
| notifications | CRUD | R | · | · |
| migration | execute | · | · | · |

## 6. Políticas ABAC (contexto)

Reglas que actúan **después** de que el RBAC autorizó. Se administran en la
consola `/roles` → Políticas (`/permissions/policies`). Ejemplo: prohibir que
quien creó una orden de pago la apruebe (separación de funciones), o impedir que
se dé de baja a una cuenta ADMIN. Ver [D-018](../../DECISIONES.md).

- **Frontera de seguridad:** solo hay políticas para las acciones registradas en
  `api/src/core/policies/actions.ts`, y sus condiciones solo leen los campos que
  cada acción declara (`POLICY_ACTION_UNKNOWN` / `POLICY_FIELD_UNKNOWN`).
- **Evaluación:** se toman las políticas activas de la acción cuyo rol aplica al
  actor (sin roles = todos), en orden de `priority` **ascendente** (empate por
  `key`); la **primera** cuyas condiciones se cumplen **todas** decide con su
  efecto (`ALLOW`/`DENY`). Sin coincidencia → se permite.
- **Condiciones:** `campo operador valor`. Operadores `eq`, `neq`, `in`,
  `not_in`, `contains`, `not_contains`, `gt`, `gte`, `lt`, `lte`, `exists`. Un
  arreglo "está en" una lista si alguno de sus elementos lo está. `valor` es
  JSON y admite `"@user.id"`, `"@user.username"` y `"@user.roles"`.
- **Denegación:** `403 POLICY_DENIED` y `ACCESS_DENIED` en bitácora con la clave
  de la política.

| Acción | Campos | Dónde se aplica |
|---|---|---|
| `users.create` | `roles` | Alta de cuenta |
| `users.update` | `target.id`, `target.roles`, `roles` | Edición de cuenta |
| `users.deactivate` | `target.id`, `target.roles` | Baja lógica |
| `users.reset_password` | `target.id`, `target.roles` | Contraseña temporal |
| `users.permissions.set` | `target.id`, `target.roles`, `roles`, `permission`, `scope` | Roles/excepciones por persona |
| `roles.matrix.update` | `roleKey`, `permissionKey`, `scope` | Cada celda de la matriz |
| `settings.update` | `key` | Cada parámetro general (M11) |

Los módulos siguientes registran sus acciones (p. ej. `payments.approve` con
`amount` y `createdById` en M09).

> **Políticas ABAC de cobranza (F4):** `charges.create` expone `monto`, `descuento`,
> `porcentajeDescuento`, `conceptTipo` y `masivo` (p. ej. «nadie descuenta más del 50 %»);
> `payments.cancel` expone `monto`, `metodo` y `diasDesdeRegistro` (p. ej. «solo ADMIN
> cancela pagos de más de 3 días»). `payments.cancel` es un permiso sensible.

## 7. Implementación

- Rutas: `requiresPermission("students.create")`; para lecturas compartidas,
  `requiresAnyPermission([...])`.
- Los servicios aplican **scoping** por registro (`scopeOf`/`withinScope`), no el cliente.
- El catálogo, la matriz y las políticas se cargan de la BD con cache y se
  recargan tras cada escritura; si la carga falla, todo es `NONE`.
- Guard **anti-lockout**: ningún cambio puede dejar el sistema sin un rol activo
  con `roles.manage`.
- Auditoría de control de acceso: `ACCESS_DENIED`, `ROLE_*`, `PERMISSION_*`,
  `POLICY_*`, `USER_ROLE_*`, `PERMISSION_EXCEPTION_*`.

## 8. Web

- `usePermission(permission)` → alcance; `useCan(permission)` → booleano;
  `<RequiresPermission>` gate por ruta.
- Menú desde `APP_SCREENS` (`entities/permission/model/screens.ts`), fuente única
  pantalla→permiso, compartida con la vista «Qué ve cada rol».
- La consola **`/roles`** (solo `roles.manage`) administra roles, matriz,
  acceso por persona, políticas, catálogo y actividad.

## 9. Pruebas de control de acceso

Por recurso sensible: autorizado → 200/201; sin permiso → 403
(`INSUFFICIENT_PERMISSIONS`/`POLICY_DENIED`); fuera de alcance → 403 o lista
filtrada; sin token/expirado → 401.
