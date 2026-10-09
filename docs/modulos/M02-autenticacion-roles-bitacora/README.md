# M02 — Autenticación, roles y bitácora

| Campo | Valor |
|---|---|
| **Código** | M02 |
| **Versión** | 1.0 |
| **Estado** | Terminado (F1, 2026-10-09) |
| **Fase** | Núcleo |
| **Depende de** | M01 (alcance y flujos aprobados) |
| **Habilita a** | M03, M04, M07, M11 y, en cadena, todos los módulos (es la base de acceso y auditoría) |
| **Permisos** | `users.view`, `users.create`, `users.edit`, `users.delete`, `users.permissions`, `roles.manage`, `audit.view`, `config.view`, `config.manage` |

## 1. Objetivo

Dar al SGE su **identidad, control de acceso y trazabilidad**: autenticar usuarios,
autorizarlos con RBAC/ABAC por alcance, administrar roles/permisos/políticas y
registrar cada operación de escritura y cada acceso denegado en la bitácora.

## 2. Alcance

**Incluye**
- Login por `username` o `email` + contraseña (bcryptjs) y emisión de JWT.
- Refresh token rotado de un solo uso y logout.
- Recuperación de contraseña por token de un solo uso (correo vía M19/outbox).
- `GET /auth/me` con roles y mapa `{ permiso: alcance }`.
- CRUD de usuarios, asignación multi-rol y excepciones por persona.
- Consola de acceso: roles, matriz rol×permiso, catálogo de permisos y políticas ABAC.
- Bitácora consultable y automática (`audit_logs`).
- Middleware `authenticate` (relee BD) y `requiresPermission` (fail-closed).

**No incluye (en este módulo)**
- Datos de negocio de alumnos/profesores (M03/M04), que solo consumen usuarios/roles.
- Envío real de correo SMS/WhatsApp (M19); aquí solo se encola.
- Configuración general/catálogos base (M11).

## 3. Modelo de datos (Prisma)

Convenciones: `id String @id @default(uuid())`, `createdAt`/`updatedAt`,
`active` y borrado lógico por dominio (ver [D-003](../../../DECISIONES.md) y el
[diccionario de datos](../../modelo-datos/diccionario-datos.md)). Los catálogos de
seguridad usan **clave natural `key`**.

```prisma
/// Alcance de un permiso: NONE < OWN < AREA < ALL.
enum Scope {
  NONE
  OWN
  AREA
  ALL
}

model User {
  id                 String    @id @default(uuid())
  username           String    @unique
  email              String    @unique
  passwordHash       String    @map("password_hash")
  name               String
  phone              String?
  active             Boolean   @default(true)
  lastLoginAt        DateTime? @map("last_login_at")
  deactivatedAt      DateTime? @map("deactivated_at")
  deactivationReason String?   @map("deactivation_reason")
  failedAttempts     Int       @default(0) @map("failed_attempts")
  lockedUntil        DateTime? @map("locked_until")
  mustChangePassword Boolean   @default(false) @map("must_change_password")
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  roles         UserRole[]
  permissions   UserPermission[]
  refreshTokens RefreshToken[]
  resetTokens   PasswordResetToken[]
  auditLogs     AuditLog[]
  student       Student?
  teacher       Teacher?
  movements     StudentMovement[]
  validatedDocs Document[]           @relation("DocumentValidator")
  uploadedDocs  Document[]           @relation("DocumentUploader")

  @@index([active])
  @@map("users")
}

model Role {
  key       String   @id
  name      String
  module    String?
  staff     Boolean  @default(false)
  system    Boolean  @default(false)
  active    Boolean  @default(true)
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  permissions RolePermission[]
  users       UserRole[]
  policies    PolicyRole[]

  @@map("roles")
}

model Permission {
  key       String   @id
  module    String
  name      String
  scopes    Scope[]  @default([NONE, OWN, AREA, ALL])
  sensitive Boolean  @default(false)
  active    Boolean  @default(true)
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  roles          RolePermission[]
  userExceptions UserPermission[]

  @@index([module])
  @@map("permissions")
}

model RolePermission {
  id            String   @id @default(uuid())
  roleKey       String   @map("role_key")
  permissionKey String   @map("permission_key")
  scope         Scope    @default(NONE)
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  role       Role       @relation(fields: [roleKey], references: [key], onDelete: Cascade)
  permission Permission @relation(fields: [permissionKey], references: [key], onDelete: Cascade)

  @@unique([roleKey, permissionKey])
  @@map("role_permissions")
}

/// Multi-rol: un usuario puede tener varios roles (la unión toma el alcance mayor).
model UserRole {
  userId  String @map("user_id")
  roleKey String @map("role_key")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleKey], references: [key], onDelete: Cascade)

  @@id([userId, roleKey])
  @@index([roleKey])
  @@map("user_roles")
}

/// Excepción de permiso por persona: reemplaza lo que dice su rol.
model UserPermission {
  id            String    @id @default(uuid())
  userId        String    @map("user_id")
  permissionKey String    @map("permission_key")
  scope         Scope
  reason        String?
  expiresAt     DateTime? @map("expires_at")
  grantedById   String?   @map("granted_by_id")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionKey], references: [key], onDelete: Cascade)

  @@unique([userId, permissionKey])
  @@map("user_permissions")
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String    @map("user_id")
  tokenHash String    @unique @map("token_hash")
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_tokens")
}

model PasswordResetToken {
  id        String    @id @default(uuid())
  userId    String    @map("user_id")
  tokenHash String    @unique @map("token_hash")
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("password_reset_tokens")
}

model AuditLog {
  id            String   @id @default(uuid())
  action        String
  entityType    String   @map("entity_type")
  entityId      String?  @map("entity_id")
  userId        String?  @map("user_id")
  userName      String?  @map("user_name")
  previousState Json?    @map("previous_state")
  newState      Json?    @map("new_state")
  metadata      Json?
  createdAt     DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([action])
  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

> **Implementado (diferencias con el borrador de arriba):** el lockout vive en
> `users.failedAttempts/lockedUntil` (no hay tabla `login_attempts`: los intentos
> quedan en bitácora como `AUTH_LOGIN_FAILED`/`AUTH_ACCOUNT_LOCKED`);
> `user_roles` usa PK compuesta `(userId, roleKey)`; las relaciones de seguridad
> borran en cascada; se agregan `policies`, `policy_conditions` y `policy_roles`
> ([D-018](../../../DECISIONES.md)). Fuente: `api/prisma/schema.prisma`.

**Índices:** `users.username`/`users.email` únicos; `audit_logs` por `action`, `(entityType, entityId)`, `userId` y
`createdAt`; `refresh_tokens.userId`.
**Relaciones:** `User 1—N UserRole/RolePermission` vía `UserRole` y
`UserPermission`; `Role 1—N RolePermission`; `Permission 1—N RolePermission`;
`AuditLog N—1 User` (nulo para acciones del sistema/worker).

## 4. Reglas de negocio

1. El login acepta `username` **o** `email` + `password` (bcryptjs); credenciales
   inválidas → `401 INVALID_CREDENTIALS` sin revelar cuál campo falló.
2. Tras **5 intentos fallidos** consecutivos (configurable) la cuenta se bloquea
   temporalmente → `429 ACCOUNT_LOCKED`; un login exitoso limpia el contador.
3. La contraseña mínima es **configurable** (default 10); se valida al crear,
   restablecer y cambiar contraseña.
4. `authenticate` **relee la BD** en cada petición y exige usuario `active`;
   inactivo → `401 INVALID_SESSION` / `ACCOUNT_DEACTIVATED`.
5. Cada endpoint declara `requiresPermission("recurso.accion")`; un 403 se audita
   como `ACCESS_DENIED`.
6. **Fail-closed:** si el catálogo/matriz no carga, todo permiso es `NONE`.
7. El refresh token es **de un solo uso y rotado**: al usarse se emite uno nuevo y
   el anterior queda revocado; reusar uno revocado invalida la sesión.
8. `forgot-password` responde `200` siempre (no revela si el usuario existe);
   `reset-password` exige token vigente, no usado, y luego invalida las sesiones.
9. Toda escritura (usuarios, roles, permisos, políticas) pasa por el `AuditPort`
   con `previousState`/`newState`.
10. La unión de roles toma el **alcance mayor** (`maxScope`); una excepción
    vigente (`user_permissions`) gana sobre el rol.
11. **Anti-lockout:** ningún cambio puede dejar el sistema sin un rol activo con
    `roles.manage`.
12. Nadie puede alterar sus propios permisos → `409 CANNOT_CHANGE_OWN_PERMISSIONS`.
13. Un `User` desactivado no puede autenticarse ni refrescar; su baja se registra
    con `deactivatedAt`/`deactivationReason` (nunca borrado físico).

## 5. API

Módulos bajo `api/src/modules/`: `auth/`, `users/`, `audit/` y `permissions/`
(`routes/ · controllers/ · services/ · models/{dto,entity}/`), cableados por DIP
en `api.router.ts` (ver [`../../arquitectura/api-modular.md`](../../arquitectura/api-modular.md)).

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Inicia sesión (username o email) | Público |
| POST | `/api/v1/auth/refresh` | Rota el refresh y emite nuevo access | Refresh token |
| GET | `/api/v1/auth/me` | Usuario, roles, mapa de permisos, idioma y `mustChangePassword` | Autenticado |
| POST | `/api/v1/auth/logout` | Revoca el refresh enviado (o todos) | Autenticado |
| POST | `/api/v1/auth/change-password` | Cambio propio; revoca sesiones y emite tokens | Autenticado |
| POST | `/api/v1/auth/forgot-password` | Solicita recuperación (siempre 200) | Público |
| POST | `/api/v1/auth/reset-password` | Restablece con token de un uso | Público |
| POST | `/api/v1/users/query` | Listado server-side (filtros `username`, `name`, `email`, `role`, `active`) | `users.view` |
| GET | `/api/v1/users` · `/users/:id` | Lista y detalle | `users.view` |
| POST | `/api/v1/users` | Alta (multi-rol, contraseña temporal) | `users.create` |
| PATCH | `/api/v1/users/:id` | Edición (datos y roles) | `users.edit` |
| DELETE | `/api/v1/users/:id` | Baja lógica con motivo; cierra sesiones | `users.delete` |
| POST | `/api/v1/users/:id/reactivate` | Reactiva una cuenta dada de baja | `users.delete` |
| POST | `/api/v1/users/:id/unlock` | Quita el bloqueo por intentos | `users.edit` |
| POST | `/api/v1/users/:id/reset-password` | Contraseña temporal (obliga a cambiarla) | `users.edit` |
| GET | `/api/v1/users/:id/permissions` | Rol, excepción y efectivo por permiso | `users.permissions` |
| PUT | `/api/v1/users/:id/permissions` | Roles y/o una excepción por persona | `users.permissions` |
| DELETE | `/api/v1/users/:id/permissions/:permission` | Quita una excepción | `users.permissions` |
| POST | `/api/v1/audit/query` · GET `/audit` · GET `/audit/:id` | Bitácora | `audit.view` |
| GET | `/api/v1/permissions/catalog` · `/permissions/roles` | Catálogo activo y roles con conteo | Autenticado |
| GET | `/api/v1/permissions/ADMIN` | Roles, catálogo completo y matriz | `roles.manage` |
| POST · PATCH · DELETE | `/api/v1/permissions/roles[/:key]` | Roles dinámicos (duplicar con `copyFrom`) | `roles.manage` |
| POST · PATCH | `/api/v1/permissions/catalog[/:key]` | Catálogo de permisos | `roles.manage` |
| PUT | `/api/v1/permissions/matrix` | Matriz rol×permiso×alcance (anti-lockout) | `roles.manage` |
| GET | `/api/v1/permissions/policies/actions` | Acciones que admiten políticas y sus campos | `roles.manage` |
| GET · POST · PATCH · DELETE | `/api/v1/permissions/policies[/:id]` | Políticas ABAC | `roles.manage` |
| POST | `/api/v1/permissions/reload` | Recarga caches (multi-instancia) | `roles.manage` |

Contrato completo en Swagger (`/docs`).

Las rutas públicas (`login`, `refresh`, `forgot-password`, `reset-password`) se
declaran **antes** de `router.use(authenticate)`.

**Login** (`POST /auth/login`)
```json
{ "username": "usuario", "password": "…" }
```
```json
{
  "token": "…",
  "refreshToken": "…",
  "user": {
    "id": "…", "username": "…", "name": "…",
    "role": "ADMIN", "roles": ["ADMIN"],
    "permissions": { "students.view": "ALL", "grades.capture": "AREA" }
  }
}
```

**`GET /auth/me`** devuelve solo los permisos ≠ `NONE`:
```json
{
  "user": { "id": "…", "name": "…" },
  "roles": ["TEACHER"],
  "permissions": { "grades.capture": "OWN" },
  "language": "es"
}
```

**Matriz** (`PUT /permissions/matrix`): `{ "roleKey": "SCHOOL_CONTROL",
"permissionKey": "students.create", "scope": "ALL" }`.

Errores según el [catálogo](../../api/errores.md): `TOKEN_MISSING`,
`INVALID_TOKEN`, `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `ACCOUNT_DEACTIVATED`,
`RESET_TOKEN_INVALID`, `INSUFFICIENT_PERMISSIONS`, `POLICY_DENIED`,
`CANNOT_CHANGE_OWN_PERMISSIONS`, `DUPLICATE_RECORD`, `VALIDATION_ERROR`.

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `user` | `entities/user` | Slice de sesión, `usePermission`/`useCan`, `authApi`/`usersApi` |
| `permission` | `entities/permission` | `APP_SCREENS`, `permissionApi` (roles, matriz, políticas), `useRoles` |
| `audit` | `entities/audit` | `auditApi` + tipos |
| `login` · `forgot-password` · `reset-password` · `change-password` | `features/auth/*` | Acceso y recuperación |
| `users-list` · `user-form` · `user-actions` · `user-permissions` | `features/user/*` | Tabla, alta/edición multi-rol, baja/reactivación/temporal, excepciones |
| `roles-manager` · `matrix-editor` · `policies-manager` | `features/permission/*` | Consola de acceso |
| `audit-list` | `features/audit/*` | Tabla + detalle antes/después |
| `/login`, `/forgot-password`, `/reset-password` | `pages/auth` | Públicas (`AuthLayout`) |
| `/change-password` | `pages/account` | Obligatoria con contraseña temporal |
| `/users` | `pages/users` | `ITPage` + `ITDataTable` + `ITDialog` |
| `/roles` | `pages/roles` | `ITTabs`: Roles · Matriz · Políticas |
| `/audit` | `pages/audit` | `ITDataTable` con rango de fechas |

Pantallas con `ITPage` + `ITDataTable`/`ITFormBuilder`, `ITDialog`,
`ITSearchSelect` (roles), `PanelCard` y `KpiTile` (resumen de actividad). Gate por
`<RequiresPermission>` y `usePermission`. i18n con namespaces **`auth`**,
**`users`**, **`roles`** y **`audit`**
(`shared/i18n/locales/{es,en}/<ns>.json`).

## 7. Permisos y alcance

| Permiso | ADMIN | SCHOOL_CONTROL | TEACHER | STUDENT |
|---|---|---|---|---|
| `users.*` | ALL | · | · | · |
| `roles.manage` | ALL | · | · | · |
| `audit.view` | ALL | · | · | · |
| `config.view` / `config.manage` | ALL | `config.view` | · | · |

Alcances `NONE < OWN < AREA < ALL`; el scoping se aplica en la consulta (`AND`),
nunca en el cliente. Políticas ABAC (p. ej. separación de funciones) se evalúan
después del RBAC. Detalle en
[`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md).

## 8. Validaciones

- API con **Zod** en `models/dto`; whitelist estricta → `VALIDATION_ERROR` con
  `details` por campo.
- `username`/`email` únicos (`DUPLICATE_RECORD`); `email` con `INVALID_EMAIL`.
- Contraseña: mínimo configurable (`PASSWORD_TOO_SHORT`), confirma `password` =
  `passwordConfirm`.
- Login/forgot-password con rate limiting; `identifier` requerido.
- Web con `@shared/validation` (`validateEmail`, `validateRequired`, …) que
  devuelve `string | null`; validación en el hook del formulario.
- Mensajes como códigos traducibles (`core/i18n/messages/{es,en}`).

## 9. Bitácora

Acciones registradas vía `AuditPort` con `previousState`/`newState`
(ver [`../../seguridad/bitacora.md`](../../seguridad/bitacora.md)):

- Autenticación: `AUTH_LOGIN`, `AUTH_LOGIN_FAILED`, `AUTH_LOGOUT`,
  `AUTH_ACCOUNT_LOCKED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`.
- Usuarios: `USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`,
  `USER_REACTIVATED`, `USER_ROLE_ADDED`, `USER_ROLE_REMOVED`.
- Control de acceso: `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED`,
  `ROLE_PERMISSIONS_UPDATED`, `PERMISSION_CREATED`, `PERMISSION_UPDATED`,
  `POLICY_CREATED`, `POLICY_UPDATED`, `POLICY_DELETED`,
  `PERMISSION_EXCEPTION_SET`, `PERMISSION_EXCEPTION_REMOVED`, `ACCESS_DENIED`.

**Nunca** se registran contraseñas, hashes, tokens de sesión ni de recuperación.

## 10. Pruebas (Playwright)

- Unitarias (`api/tests/unit`): política de contraseña, contador/lockout,
  `maxScope` (unión de roles), `expires_at` de excepciones, verificación de
  rotación de refresh.
- Contrato (`api/tests/e2e`): login feliz y fallido, lockout tras 5 intentos,
  `/auth/me`, refresh rotado, forgot/reset, CRUD de usuarios y `/users/query`,
  `audit/query` con `audit.view`, y pruebas de autorización por endpoint
  (autorizado → 200/201; sin permiso → 403 `INSUFFICIENT_PERMISSIONS`/`POLICY_DENIED`;
  fuera de alcance → lista filtrada; sin token → 401).
- Navegador (`web/tests/e2e`): flujo de login → guard → logout; gate de menú por
  permiso; consola `/roles`; `insecure-context` sin truenos.
- Verificación de bitácora en cada escritura (login/bloqueo y cambios de acceso).
- Spec(s) del módulo: `api/tests/e2e/auth.spec.ts`, `api/tests/e2e/users.spec.ts`,
  `api/tests/e2e/permissions.spec.ts`; `api/tests/unit/policies.spec.ts`;
  `web/tests/e2e/auth.spec.ts`, `web/tests/e2e/users.spec.ts`,
  `web/tests/e2e/roles.spec.ts`, `web/tests/e2e/password-recovery.spec.ts`.

## 11. Criterios de aceptación

- [x] Migración y modelos Prisma (`init` + `f1_policies_catalogs`).
- [x] Módulos API `auth`/`users`/`audit`/`permissions` con permisos, políticas y bitácora.
- [x] Middlewares `authenticate` (relee BD) y `requiresPermission` (fail-closed).
- [x] Pantallas web (login, recuperación, cambio de contraseña, usuarios, consola de roles, bitácora) con UI kit.
- [x] Specs del módulo pasando (contrato API, unitarias y navegador).
- [x] Este README completo.

## 12. Decisiones abiertas

- Resueltas en F1: semántica de políticas ([D-018](../../../DECISIONES.md)),
  contraseña temporal y reactivación ([D-019](../../../DECISIONES.md)), enlace de
  recuperación ([D-020](../../../DECISIONES.md)).
- Acceso de alumnos al portal (A-007).
- Proveedor de notificaciones para recuperación de contraseña (A-001).
- Longitud mínima definitiva de contraseña (aquí default 10; política final en M11).

Ver [`DECISIONES.md`](../../../DECISIONES.md).

## 13. Referencias

- [Autenticación (API)](../../api/autenticacion.md)
- [Roles y permisos](../../seguridad/roles-permisos.md)
- [Bitácora](../../seguridad/bitacora.md)
- [Convenciones de API](../../api/convenciones.md)
- [Catálogo de errores](../../api/errores.md)
- [API modular](../../arquitectura/api-modular.md)
- [Web FSD](../../arquitectura/web-fsd.md)
- [Diccionario de datos](../../modelo-datos/diccionario-datos.md)
- [Registro de decisiones](../../../DECISIONES.md)
