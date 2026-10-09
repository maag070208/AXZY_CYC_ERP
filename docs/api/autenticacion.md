# Autenticación

Esquema **JWT Bearer** con access token + **refresh rotado**, hash con
**bcryptjs** y autorización resuelta en el servidor (ver
[D-005](../../DECISIONES.md)).

## 1. Endpoints

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Inicia sesión | Público |
| POST | `/api/v1/auth/refresh` | Rota el refresh y emite nuevo access | Refresh token |
| GET | `/api/v1/auth/me` | Usuario, roles y mapa de permisos | Autenticado |
| POST | `/api/v1/auth/logout` | Revoca el refresh enviado (o todos) | Autenticado |
| POST | `/api/v1/auth/change-password` | Cambio propio; revoca sesiones y emite tokens nuevos | Autenticado |
| POST | `/api/v1/auth/forgot-password` | Solicita recuperación | Público |
| POST | `/api/v1/auth/reset-password` | Restablece con token de un uso | Público |

## 2. Login

**Request**
```json
{ "username": "usuario", "password": "…" }
```

**Response 200**
```json
{
  "token": "…",
  "refreshToken": "…",
  "user": {
    "id": "…", "username": "…", "name": "…",
    "role": "ADMIN", "roles": ["ADMIN", "SCHOOL_CONTROL"],
    "permissions": { "students.view": "ALL", "grades.capture": "AREA" }
  }
}
```

Reglas:
- Bloqueo temporal tras **5 intentos fallidos** (`MAX_LOGIN_ATTEMPTS`; dura `LOGIN_LOCK_MINUTES`) → `429 ACCOUNT_LOCKED`.
- Un login exitoso actualiza el último acceso y se registra en bitácora.
- Nunca se devuelve ni registra la contraseña.
- Cuenta desactivada → `401 ACCOUNT_DEACTIVATED` (la web lo muestra y hace logout).

## 3. `GET /auth/me`

Devuelve los datos de la persona, `roles` y `permissions` como **mapa
`{ permiso: alcance }`**, donde el alcance ∈ `NONE | OWN | AREA | ALL` y **solo
se incluyen los permisos ≠ NONE**:
```json
{
  "user": { "id": "…", "name": "…", "role": "TEACHER" },
  "roles": ["TEACHER"],
  "permissions": { "grades.capture": "OWN", "attendance.view": "OWN" },
  "language": "es"
}
```
La web guarda este mapa y arma el menú (`APP_SCREENS`) y los gates
(`RequiresPermission`) con él.

## 4. Refresh

- El refresh token es **de un solo uso y rotado**: al usarse se emite uno nuevo y
  el anterior se invalida (`JWT_REFRESH_EXPIRES_IN`, default 30d).
- El access vence con `JWT_EXPIRES_IN` (default 7d).
- La web hace **refresh single-flight** en el interceptor 401 y reintenta una vez.

## 5. Middleware `authenticate`

1. Lee `Authorization: Bearer <jwt>` (`401 TOKEN_MISSING` / `INVALID_AUTHORIZATION_HEADER` / `INVALID_TOKEN`).
2. Rechaza refresh tokens como access (`isRefreshToken`).
3. **Relee la BD** y exige usuario `active` (`401 INVALID_SESSION` si no).
4. Adjunta `roles` (multi-rol, `user_roles`) y las **excepciones** vigentes
   (`user_permissions`) a `req.user`.

> El JWT solo identifica; cada petición resuelve permisos frescos (fail-closed).

## 6. Recuperación de contraseña

1. `POST /auth/forgot-password` con `{ "username" }` (responde 200 siempre, no revela existencia).
2. Se genera token de un solo uso (vence en 1 hora) y se envía por correo en el
   idioma de la petición; el enlace apunta a `${APP_URL}/#/reset-password?token=…`
   ([D-020](../../DECISIONES.md)).
3. `POST /auth/reset-password` con `{ token, password }`; se valida (no usado/no expirado), se actualiza el hash y se invalidan las sesiones.

## 7. Contraseñas

- Longitud mínima configurable con `PASSWORD_MIN_LENGTH` (default 10).
- Las cuentas creadas por un administrador nacen con `mustChangePassword`
  ([D-019](../../DECISIONES.md)).
- Hash con **bcryptjs** (10 rounds); nunca reversible.
- Al restablecer, invalidar refresh tokens del usuario.

## 8. Seguridad adicional

- Bloqueo temporal por cuenta tras intentos fallidos (`MAX_LOGIN_ATTEMPTS`, `LOGIN_LOCK_MINUTES`).
- *Rate limiting* por IP → `429 RATE_LIMITED` con `Retry-After`: en `/auth/login`
  cuentan solo los intentos fallidos (`RATE_LIMIT_LOGIN_MAX`); en
  `/auth/forgot-password` y `/auth/reset-password`, todas las peticiones
  (`RATE_LIMIT_PUBLIC_MAX`). Ventana `RATE_LIMIT_WINDOW_MINUTES` (15 min).
- Cada 403 de `requiresPermission` se audita como `ACCESS_DENIED`.
- HTTPS obligatorio; cookies `Secure`/`SameSite` si se usan.
