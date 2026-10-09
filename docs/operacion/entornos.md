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
| `PORT` | Puerto del API (p. ej. `4001`) |
| `JWT_SECRET` | Secreto para firmar tokens |

## 3. Variables de la aplicación

| Variable | Default | Descripción |
|---|---|---|
| `NODE_ENV` | `development` | Entorno |
| `TZ` / `APP_TIMEZONE` | `America/Mexico_City` | Zona horaria de presentación |
| `WEB_ORIGIN` | — | Origen permitido por CORS |
| `JWT_EXPIRES_IN` | `7d` | Vida del access token |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Vida del refresh token |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | — | Admin inicial |
| `UPLOAD_MAX_BYTES` | `52428800` | Tamaño máximo de subida (M06 lo restringe a 5 MB) |
| `ABLY_API_KEY` | — | Tiempo real (falla en runtime si falta) |

## 4. Archivos / S3

| Variable | Descripción |
|---|---|
| `STORAGE_DRIVER` | `local` (volumen) o `s3` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credenciales S3 (o Access Key/Secret de R2) |
| `AWS_REGION` | Default `us-east-2`; en R2 usar `auto` |
| `AWS_BUCKET_NAME` | Bucket de archivos |
| `S3_ENDPOINT` | Opcional: endpoint compatible (Cloudflare R2/MinIO). Vacío = AWS |
| `S3_FORCE_PATH_STYLE` | Path-style; por defecto `true` cuando hay `S3_ENDPOINT` |

**Cloudflare R2** (recomendado para demo/deploy): crear un bucket, un token de
R2 con permiso *Object Read & Write* (da **Access Key ID** + **Secret Access
Key**) y configurar:

```
STORAGE_DRIVER=s3
AWS_ACCESS_KEY_ID=<R2 Access Key ID>
AWS_SECRET_ACCESS_KEY=<R2 Secret Access Key>
AWS_BUCKET_NAME=cyc-expedientes
AWS_REGION=auto
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
```

El bucket es **privado**; la API entrega los archivos por endpoints con permiso y
alcance (nunca URLs públicas).

## 5. Correo (outbox)

| Variable | Descripción |
|---|---|
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Proveedor principal |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Alternativa SMTP |
| `EMAIL_DRY_RUN` | No envía, solo registra |
| `EMAIL_QUEUE_POLL_MS` / `EMAIL_QUEUE_MAX_ATTEMPTS` | Worker de la cola |
| `NOTIFICATION_EMAILS` | Destinatarios legacy (fallback de `sys_config`) |
| `ENABLE_SEND_EMAIL` | Gate en `sys_config` |

## 6. SMS / WhatsApp (M19, por definir)

| Variable | Descripción |
|---|---|
| `SMS_PROVIDER` / `SMS_API_KEY` | Proveedor SMS (Twilio u otro) |
| `WHATSAPP_PROVIDER` / `WHATSAPP_API_KEY` | Proveedor WhatsApp |

## 7. Web (`web/.env`)

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL de la API (dev: `http://localhost:4001/api/v1`) |
| `WEB_API_URL` | Runtime de la imagen nginx → `/config.js` (`__APP_CONFIG__.API_URL`) |
| `VITE_GOOGLE_MAPS_API_KEY` | Mapas (con fallback OSM) |

## 8. Reglas

- **Nunca** versionar valores reales; solo `.env.example`.
- Rotar cualquier credencial que haya estado en un `.env` commiteado.
- Documentar aquí toda variable nueva al agregarla.
- En producción, inyectar por gestor de secretos o `env_file` protegido.
