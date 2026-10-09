# M04 — Profesores (altas)

| Campo | Valor |
|---|---|
| **Código** | M04 |
| **Versión** | 1.0 |
| **Estado** | Terminado (F2, 2026-10-09) |
| **Fase** | Personas |
| **Depende de** | M02 (usuarios, roles y bitácora) |
| **Habilita a** | M07 (asignación de grupos), M08 (captura de calificaciones), M18 (asistencia) |
| **Permisos** | `teachers.view`, `teachers.create`, `teachers.edit` |

## Implementación (F2, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/teachers` y `web/src/{entities,features}/teacher`, página `/teachers`.

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST | `/api/v1/teachers/query` | `teachers.view` | OWN = su propio perfil |
| POST | `/api/v1/teachers` | `teachers.create` | Profesor + `User` PROFESOR + invitación (72 h) en una transacción |
| GET · PATCH | `/api/v1/teachers/:id` | `teachers.view` · `teachers.edit` | La edición sincroniza nombre/correo/teléfono de la cuenta |
| POST | `/api/v1/teachers/:id/deactivate` · `/reactivate` | `teachers.edit` (ALL) | Desactiva/reactiva también la cuenta y cierra sesiones |
| POST | `/api/v1/teachers/:id/resend-invitation` | `teachers.edit` | Invalida la anterior; 409 si ya definió contraseña |

Diferencias con el borrador: el correo duplicado responde `409 TEACHER_EMAIL_TAKEN` (también si es el correo de otra cuenta); la invitación es un token de restablecimiento de un uso y se envía tras el commit (sin outbox hasta M19). Ver [D-025](../../../DECISIONES.md).

> **Cómo leer este documento:** la sección «Implementación» de arriba describe lo
> construido y **manda** sobre el diseño original de las secciones siguientes.
> Los nombres de campos, enums, rutas y códigos ya están en inglés
> ([D-046](../../../DECISIONES.md), [D-049](../../../DECISIONES.md)).

## 1. Objetivo

Dar de alta al **profesor** y crear de forma automática su **cuenta de usuario con
rol `TEACHER`**, enviándole una invitación para definir su contraseña, para que
pueda acceder a sus grupos en cuanto se le asignen.

## 2. Alcance

**Incluye**
- Alta del profesor (datos personales, contacto, especialidad, estatus).
- Creación transaccional del `User` asociado con rol `TEACHER`.
- Envío de **invitación** para definir contraseña (correo directo tras el commit; [D-025](../../../DECISIONES.md)).
- Búsqueda server-side y edición; vinculación/desvinculación de la cuenta.
- Activación/desactivación (baja lógica del profesor y de su cuenta).

**No incluye (en este módulo)**
- Autenticación, roles y bitácora (M02; se consume).
- Asignación de grupos y horarios (M07).
- Envío multicanal real (M19); aquí solo se encola la invitación.

## 3. Modelo de datos (Prisma)

Convenciones del estándar (UUID, `createdAt`/`updatedAt`, `active`, `@@map`);
ver [D-003](../../../DECISIONES.md) y el
[diccionario de datos](../../modelo-datos/diccionario-datos.md). La cuenta se
modela con `User` (M02) y se vincula por `userId` único.

```prisma
enum TeacherStatus {
  ACTIVE
  INACTIVE
}

model Teacher {
  id         String        @id @default(uuid())
  firstNames String        @map("first_names")
  surnames   String
  email      String        @unique
  phone      String?
  specialty  String?
  status     TeacherStatus @default(ACTIVE)
  userId     String?       @unique @map("user_id")
  createdAt  DateTime      @default(now()) @map("created_at")
  updatedAt  DateTime      @updatedAt @map("updated_at")

  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  groups Group[]

  @@index([status])
  @@index([surnames, firstNames])
  @@map("teachers")
}
```

**Índices:** `teachers.email` y `teachers.userId` únicos; `teachers.status`;
`teachers(surnames, firstNames)`.
**Relaciones:** `Teacher N—1 User` (opcional, único). Al crear el profesor, si no
tiene cuenta, el servicio crea el `User` y lo enlaza en la misma transacción.

## 4. Reglas de negocio

1. El **correo** del profesor es único → `409 TEACHER_EMAIL_TAKEN` (también si ya es el correo de otra cuenta).
2. Al crear un profesor **se crea su `User`** con rol `TEACHER` y estado
   `mustChangePassword = true` (cuenta pendiente de definir contraseña).
3. Se envía una **invitación** por correo (envío directo tras el commit, en el idioma de la petición) para definir la
   contraseña; la invitación se encola y no bloquea la respuesta del alta.
4. El alta de profesor + usuario + encolado de invitación ocurre en **una
   transacción**; si algo falla, no queda profesor sin cuenta ni cuenta huérfana.
5. Un profesor **no puede duplicar** cuenta (`userId` único por profesor).
6. La baja lógica (`status = INACTIVE`) desactiva también su `User`
   (`active = false`), impidiendo el login.
7. El profesor solo ve **sus** grupos y alumnos (`AREA`/`OWN`, aplicado en M07,
   M08 y M18).
8. `specialty` y `phone` son opcionales; `firstNames`, `surnames` y `email`
   son obligatorios.
9. Reenviar invitación es una acción explícita y auditada; no crea otra cuenta.

## 5. API

Módulo bajo `api/src/modules/teachers/` (`routes/ · controllers/ · services/ ·
models/{dto,entity}/`), con `requiresPermission` y wiring DIP de `AuditPort` y
`NotificationPort`.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| POST | `/api/v1/teachers/query` | Listado server-side | `teachers.view` |
| POST | `/api/v1/teachers` | Alta de profesor (crea `User` + invitación) | `teachers.create` |
| GET | `/api/v1/teachers/:id` | Detalle | `teachers.view` |
| PATCH | `/api/v1/teachers/:id` | Edición | `teachers.edit` |
| POST | `/api/v1/teachers/:id/resend-invitation` | Reenvía la invitación | `teachers.edit` |

**Alta** (`POST /teachers`)
```json
{
  "firstNames": "Ana",
  "surnames": "Ramírez Soto",
  "email": "ana.ramirez@example.com",
  "phone": "5512345678",
  "specialty": "Matemáticas"
}
```
Respuesta: el `Teacher` creado con `userId` de su cuenta y un indicador de que la
invitación quedó en camino (`invitationQueued`). Errores: `TEACHER_EMAIL_TAKEN`,
`VALIDATION_ERROR`, `REQUIRED_FIELD`, `INVALID_EMAIL`.

**Listado** (`POST /teachers/query`): contrato `{ page, limit, filters, sort }` →
`{ data, total, … }`, con filtros por nombre, email, especialidad y estatus
(ver [`../../api/convenciones.md`](../../api/convenciones.md)).

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `teacher` | `entities/teacher` | API (`tableRequest`, `create`, `update`) + tipos |
| `teacher-create` | `features/teacher/create` | Alta + envío de invitación |
| `teacher-edit` | `features/teacher/edit` | Edición y estado |
| `teacher-search` | `features/teacher/search` | Filtros del listado |
| `/teachers` | `pages/teachers` | `ITPage` + `ITDataTable` |
| `/teachers/new`, `/teachers/:id/edit` | `pages/teachers` | `ITFormBuilder` |

Pantallas con `ITPage`, `ITDataTable`, `ITFormBuilder`, `ITDialog` (confirmación
de reenvío de invitación), `PanelCard` (datos / cuenta) y `KpiTile` (activos).
Columnas con filtro y orden; «Exportar» opcional reutiliza los filtros vigentes.
i18n con namespace **`teachers`**.

## 7. Permisos y alcance

| Permiso | ADMIN | CONTROL_ESCOLAR | PROFESOR | ALUMNO |
|---|---|---|---|---|
| `teachers.view` | ALL | ALL | OWN (su propio perfil) | · |
| `teachers.create` | ALL | · | · | · |
| `teachers.edit` | ALL | `teachers.edit` | OWN (propio perfil) | · |

Alcances `NONE < OWN < AREA < ALL`; el scoping se aplica en la consulta. El alta
y la baja de cuentas se apoyan en los permisos de M02 (`users.*`). Ver
[`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

- **Zod** en `models/dto`: `firstNames`/`surnames` requeridos (`REQUIRED_FIELD`);
  `email` válido y único (`INVALID_EMAIL`/`TEACHER_EMAIL_TAKEN`); `phone`
  (`INVALID_FORMAT`); `specialty` opcional.
- Web con `@shared/validation` (`validateEmail`, `validatePhone`,
  `validateRequired`) que devuelve `string | null`.
- Mensajes como códigos traducibles; `ZodError` → `400 VALIDATION_ERROR`.

## 9. Bitácora

Acciones vía `AuditPort` con `previousState`/`newState`:

- `TEACHER_CREATED` (incluye `userId` de la cuenta creada),
- `TEACHER_UPDATED`,
- `TEACHER_DEACTIVATED` / `TEACHER_REACTIVATED`,
- `TEACHER_INVITATION_SENT` / `TEACHER_INVITATION_RESENT`.

La creación del `User` se registra, además, como `USER_CREATED` desde M02. Nunca
se registran contraseñas ni tokens de invitación. Ver
[`../../seguridad/bitacora.md`](../../seguridad/bitacora.md).

## 10. Pruebas (Playwright)

- Unitarias (`api/tests/unit`): generación de `username` único, estado inicial de
  la cuenta (`mustChangePassword`), regla de baja que desactiva la cuenta.
- Contrato (`api/tests/e2e`): alta de profesor crea `User` con rol `TEACHER` y
  envía la invitación; `TEACHER_EMAIL_TAKEN` por email; edición; contrato de
  `/teachers/query`; permisos (401/403); bitácora verificada.
- Navegador (`web/tests/e2e`): alta de profesor con aviso de invitación y listado;
  gate por permiso; `insecure-context` sin truenos.
- Spec(s) del módulo: `api/tests/e2e/teachers.spec.ts`,
  `web/tests/e2e/teachers.spec.ts`.

## 11. Criterios de aceptación

- [x] Migración y modelo Prisma (`teachers`) con índices y únicos.
- [x] Módulo API `teachers` (routes/controller/service/dto/entity) con permisos,
      transacción (profesor + usuario + invitación) y bitácora.
- [x] Pantallas web (listado, alta, edición) con UI kit e i18n `teachers`.
- [x] Specs del módulo pasando.
- [x] Este README completo.

## 12. Decisiones abiertas

- **Resuelto ([D-025](../../../DECISIONES.md)):** el `username` se deriva del correo (numerado si choca) y la
  invitación es un token de restablecimiento de un solo uso (72 h).
- ¿Se permite profesor sin cuenta (solo presencial) en algún caso?

Ver [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Diccionario de datos — M04](../../modelo-datos/diccionario-datos.md)
- [M02 — Autenticación, roles y bitácora](../M02-autenticacion-roles-bitacora/README.md)
- [Autenticación](../../api/autenticacion.md)
- [Convenciones de API](../../api/convenciones.md)
- [Catálogo de errores](../../api/errores.md)
- [Roles y permisos](../../seguridad/roles-permisos.md)
- [Bitácora](../../seguridad/bitacora.md)
- [Web FSD](../../arquitectura/web-fsd.md)
- [Axzy UI System](../../arquitectura/axzy-ui-system.md)
- [Registro de decisiones](../../../DECISIONES.md)
