# Entornos y variables de configuración

Configuración por `.env` (estándar PTNV). `core/config/env.config.ts` **aborta el
arranque** si faltan las variables requeridas.

## 1. Ambientes

| Ambiente | Propósito | Datos |
|---|---|---|
| `development` | Desarrollo local | Seed/fixtures |
| `test` | Pruebas Playwright | Base local, aislada por prefijo `E2E` |
| `production` | Operación real | Datos reales, respaldos activos |

## 2. Variables requeridas al arranque

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL (Prisma) |
| `PORT` | Puerto del API (`4001` en local y en el compose). En Railway **no** se define: la plataforma lo inyecta |
| `JWT_SECRET` | Secreto para firmar tokens |

## 3. Variables de la aplicación

| Variable | Default | Descripción |
|---|---|---|
| `NODE_ENV` | `development` | Entorno |
| `TZ` / `APP_TIMEZONE` | `America/Mexico_City` | Zona horaria de presentación |
| `WEB_ORIGIN` | — | Origen(es) permitido(s) por CORS: lista por comas y comodines (`https://*.dominio`) |
| `JWT_EXPIRES_IN` | `7d` | Vida del access token |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Vida del refresh token |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | — | Admin inicial (se crea si `users` está vacía) |
| `MAX_LOGIN_ATTEMPTS` / `LOGIN_LOCK_MINUTES` | `5` / `15` | Bloqueo temporal por intentos fallidos |
| `PASSWORD_MIN_LENGTH` | `10` | Longitud mínima de contraseña |
| `APP_URL` | — | URL pública de la web: arma los enlaces de recuperación e invitación (`${APP_URL}/#/reset-password`) |
| `UPLOAD_MAX_BYTES` | `52428800` | Tamaño máximo de subida (M06 lo restringe a 5 MB) |
| `ABLY_API_KEY` | — | Tiempo real (opcional: sin clave, los avisos internos se entregan sin *push*) |

## 4. Archivos / S3

| Variable | Descripción |
|---|---|
| `STORAGE_DRIVER` | `local` (volumen) o `s3`. Sin valor: S3 si hay credenciales; si no, local fuera de producción |
| `STORAGE_LOCAL_DIR` | Directorio privado del driver `local` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credenciales S3 |
| `AWS_REGION` | Default `us-east-2` |
| `AWS_BUCKET_NAME` | Bucket de archivos |
| `S3_ENDPOINT` | Opcional: endpoint S3-compatible alterno (MinIO…). Vacío = AWS |
| `S3_FORCE_PATH_STYLE` | Path-style; por defecto `true` cuando hay `S3_ENDPOINT` |

Con `STORAGE_DRIVER=s3` se usa AWS S3. Para otro proveedor compatible con S3 se
define `S3_ENDPOINT`. El bucket es **privado**; la API entrega los archivos por
endpoints con permiso y alcance (nunca URLs públicas).

## 5. Correo (outbox)

| Variable | Descripción |
|---|---|
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Proveedor principal |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Alternativa SMTP |
| `SMTP_FROM` / `SMTP_SECURE` / `SMTP_CONNECTION_TIMEOUT` | Remitente, TLS y tiempo de espera del SMTP |
| `EMAIL_DRY_RUN` | No envía, solo registra (envío simulado) |

Sin `RESEND_*` ni `SMTP_*` el correo se **simula** (queda en el outbox como
`dryRun`). Los reintentos y el número máximo de intentos son del outbox de M19
(`notifications.max_attempts`), no variables de entorno.

## 6. SMS / WhatsApp (M19, por definir: hoy no se leen)

Ambos canales están **simulados** hasta elegir proveedor ([A-001](../../DECISIONES.md));
las variables siguientes son la propuesta y el código aún no las consume.

| Variable | Descripción |
|---|---|
| `SMS_PROVIDER` / `SMS_API_KEY` | Proveedor SMS (Twilio u otro) |
| `WHATSAPP_PROVIDER` / `WHATSAPP_API_KEY` | Proveedor WhatsApp |

## 7. Web (`web/.env`)

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL de la API (dev: `http://localhost:4001/api/v1`) |
| `WEB_API_URL` | Runtime de la imagen nginx → `/config.js` (`__APP_CONFIG__.API_URL`) |

## 8. Reglas

- **Nunca** versionar valores reales; solo `.env.example`.
- Rotar cualquier credencial que haya estado en un `.env` commiteado.
- Documentar aquí toda variable nueva al agregarla.
- En producción, inyectar por gestor de secretos o `env_file` protegido.
