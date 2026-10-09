# Despliegue (Railway + Hostinger)

Publicación del SGE de CYC en tres piezas:

| Pieza | Dónde | Imagen / artefacto |
|---|---|---|
| API + Postgres | **Railway** | `axzydev/axzy_cyc_api` (o build del `Dockerfile` de `api/`) |
| Web (SPA) | **Hostinger** | estáticos de `web/dist` |
| Almacenamiento | AWS S3 (`AWS_*`) o disco local | ver [entornos.md](entornos.md) §4 |

La web es un SPA con **HashRouter**, así que en un hosting estático basta con
subir `dist/` (no hacen falta rewrites). Al quedar en dominios distintos, el
navegador llama al API **cross-origin**: hay que fijar `WEB_ORIGIN` en Railway.

---

## 1. API + base de datos en Railway

### 1.1 Servicios
1. En Railway, **New Project → Deploy from GitHub repo** y elige `AXZY_CYC_ERP`.
2. En el servicio de la API: **Settings → Source → Root Directory** = `api`.
   Railway detecta `api/Dockerfile` (y `api/railway.json` para el healthcheck).
3. **New → Database → Add PostgreSQL** (queda como servicio `Postgres`).

### 1.2 Variables del servicio API
En **Variables** del servicio API:

```dotenv
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<aleatorio largo>
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
MAX_LOGIN_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
PASSWORD_MIN_LENGTH=10
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=<fuerte>
WEB_ORIGIN=https://<tu-dominio-hostinger>
APP_URL=https://<tu-dominio-hostinger>
STORAGE_DRIVER=local
# Integraciones (opcionales)
ABLY_API_KEY=<ably>
RESEND_API_KEY=<resend>
RESEND_FROM_EMAIL=<remitente>
AWS_ACCESS_KEY_ID=<aws>
AWS_SECRET_ACCESS_KEY=<aws>
AWS_BUCKET_NAME=<bucket>
AWS_REGION=us-east-2
```

Notas:
- **No** definas `PORT`: Railway lo inyecta y la API lo respeta.
- El contenedor corre `prisma migrate deploy` al arrancar (el `CMD` del Dockerfile).
- El **admin inicial** se crea en el primer arranque si la tabla `users` está vacía.
- `WEB_ORIGIN` es el origen permitido por CORS; debe ser exactamente la URL de la web
  (`https://…`, sin barra final). Con la web en otro dominio es **obligatorio**.

### 1.3 Dominio público
**Settings → Networking → Generate Domain** → obtienes algo como
`https://axzy-cyc-api-production.up.railway.app`. Ese es el `API_URL` de la web.

### 1.4 Almacenamiento
Railway tiene disco **efímero**: con `STORAGE_DRIVER=local` los expedientes se
pierden en cada redeploy. Para producción usa **S3** (`STORAGE_DRIVER=s3` +
`AWS_*`); para un demo corto, `local` va bien.

---

## 2. Web en Hostinger

### 2.1 Compilar apuntando al API de Railway
```bash
cd web
VITE_API_URL=https://<api>.up.railway.app/api/v1 pnpm build
# genera web/dist/
```

### 2.2 Subir
Sube **el contenido de `web/dist/`** a `public_html/` (hPanel → Administrador de
archivos, o por FTP/SFTP). Al usar HashRouter, no se necesitan reglas de rewrite.

### 2.3 (Opcional) URL del API en runtime
En vez de recompilar por ambiente, puedes dejar un `config.js` junto a
`index.html`; tiene prioridad sobre lo compilado:
```bash
printf 'window.__APP_CONFIG__ = { API_URL: "%s" };\n' "https://<api>.up.railway.app/api/v1" > public_html/config.js
```
El `index.html` ya carga `/config.js`. Si no existe, usa el `VITE_API_URL` del build.

### 2.4 SSL
Activa el certificado (Let's Encrypt) para el dominio en Hostinger. La web debe
servirse por **https** (si no, el navegador bloquea las llamadas al API por *mixed content*).

---

## 3. Publicar las imágenes (opcional)

Los workflows `.github/workflows/docker-publish-*.yml` publican en Docker Hub:

- `axzydev/axzy_cyc_api:latest`
- `axzydev/axzy_cyc_web:latest`

Secrets del repo: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`. En Railway puedes
elegir **Deploy from Docker Image** (`axzydev/axzy_cyc_api:latest`) en lugar del
build desde GitHub.

## 4. Checklist
- [ ] Railway: servicio API (root `api`) + Postgres.
- [ ] Variables del API (incluida `WEB_ORIGIN` de Hostinger).
- [ ] Dominio generado en Railway y probado `…/api/v1/health/ready`.
- [ ] Web compilada con `VITE_API_URL` del API y subida a `public_html`.
- [ ] SSL activo en Hostinger.
- [ ] Login del admin y cambio de contraseña.
