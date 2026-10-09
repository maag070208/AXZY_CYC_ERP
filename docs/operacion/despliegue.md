# Despliegue y publicación (demo)

Cómo publicar el SGE de CYC con **Cloudflare** delante del stack de Docker.
El empaquetado es un monorepo con tres servicios (`postgres`, `api`, `web`) y la
web (nginx) hace de **origen único**: sirve el SPA y hace proxy de `/api/` al API.
Gracias a eso, publicar **una sola URL** basta y no hay problemas de CORS.

## 1. Imágenes (Docker Hub)

Los workflows `.github/workflows/docker-publish-*.yml` publican:

- `axzydev/axzy_cyc_api:latest`
- `axzydev/axzy_cyc_web:latest`

Secretos del repo: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

## 2. Publicar con Cloudflare Tunnel (recomendado)

Requiere un host que corra `docker compose` (tu equipo para una demo, o un VPS/VM
para que quede encendido). **No hace falta abrir puertos ni IP pública.**

```bash
# 1) Configura el .env (mínimo: JWT_SECRET, INITIAL_ADMIN_PASSWORD)
# 2) Levanta todo + el túnel
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build

# 3) Mira la URL pública temporal
docker compose logs -f cloudflared
```

Cloudflare entrega algo como `https://<aleatorio>.trycloudflare.com` con HTTPS.
Es temporal: cambia cada vez que recreas el contenedor.

### Dominio propio (túnel con nombre)

Más estable; requiere un dominio en Cloudflare:

1. **Zero Trust → Networks → Tunnels → Create a tunnel** (Cloudflared) y copia el token.
2. Añade un **Public Hostname**: `<tu-subdominio>.tudominio.com` → Service `http://web:80`.
3. En `docker-compose.tunnel.yml`, cambia el `command` a `tunnel --no-autoupdate run`
   y arranca con `CLOUDFLARE_TUNNEL_TOKEN` en el `.env`:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN=... docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d
   ```

Con dominio fijo, ajusta en `.env` para que los enlaces (recuperar contraseña)
apunten al sitio público:

```dotenv
WEB_ORIGIN=https://<tu-subdominio>.tudominio.com
APP_URL=https://<tu-subdominio>.tudominio.com
```

> Con la URL temporal, `WEB_ORIGIN`/`APP_URL` pueden quedar en `localhost` sin
> romper nada: las llamadas del navegador son **mismo origen** (nginx proxy) y no
> disparan CORS. Solo los enlaces de correo quedarían mal.

## 3. Alternativas

- **VPS + Cloudflare (proxy DNS)**: IP pública en un VPS (Hetzner/Oracle Free),
  `docker compose up -d` y un registro A detrás de Cloudflare (naranja) para TLS.
- **Cloudflare Pages** (solo la web estática): útil si separas el API; implica
  `VITE_API_URL`/`WEB_API_URL` a la URL del API y **ajustar CORS** (`WEB_ORIGIN`).

## 4. Notas de almacenamiento

- `STORAGE_DRIVER=local` usa el volumen `apistorage` (simple y suficiente para demo).
- `STORAGE_DRIVER=s3` con `AWS_*` (S3 real) **o** `S3_ENDPOINT` (Cloudflare R2,
  MinIO). Ver [entornos.md](entornos.md) §4.
