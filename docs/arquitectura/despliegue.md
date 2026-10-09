# Despliegue

Ver también [`stack.md`](stack.md) y [`../operacion/entornos.md`](../operacion/entornos.md).

## 1. Topología

| Ambiente | Uso | Composición |
|---|---|---|
| **Desarrollo** | Local | `docker-compose.yml` (raíz): postgres + api + web |
| **Producción** | Institución | docker-compose o equivalente gestionado; nginx sirve la web y hace proxy `/api` |

El despliegue sigue el estándar PTNV: **dos imágenes** (`api` y `web`), publicadas
por separado, con **nginx** delante de la web. La publicación en Railway +
Hostinger está en [`../operacion/despliegue.md`](../operacion/despliegue.md).

## 2. Docker

El monorepo trae **un Dockerfile por proyecto** y un `docker-compose.yml` raíz
para desplegar con un comando.

```bash
cp .env.example .env        # ajusta credenciales/secretos
docker compose up --build -d
# web:  http://localhost:8080
# api:  http://localhost:4001/api/v1/health
```

- **API** (`api/Dockerfile`): multi-stage con **BuildKit** (`# syntax=docker/dockerfile:1`)
  y **cache mounts** para la caché de pnpm; la capa de dependencias va **antes**
  del código. Etapas: `base` (bookworm-slim + `openssl`) → `tools` (+ pnpm, solo
  para instalar) → `build` (todas las dependencias + `tsc`) y `prod-deps`
  (`pnpm install --prod`) → `runtime` (**sin pnpm ni herramientas de build**,
  usuario `node`). El `ENTRYPOINT` (`docker-entrypoint.sh`) aplica
  `prisma migrate deploy` y hace `exec` del `CMD` (`node dist/src/index.js`), así
  el PID 1 es la API y recibe SIGTERM. **El seed no corre al arrancar** (ver
  [D-017](../../DECISIONES.md)); dentro del contenedor, que no trae `ts-node`, se
  siembra con `npm run seed:dist`. Ver [D-050](../../DECISIONES.md).

> **Actualizar una instalación ya desplegada:** el volumen `apistorage` de un
> despliegue anterior quedó con dueño `root`, así que la API (uid 1000) no podrá
> escribir el expediente. Se arregla una sola vez:
> ```bash
> docker compose run --rm --user root --entrypoint chown api -R node:node /app/storage
> ```
- **Web** (`web/Dockerfile`): builder Vite → runtime **`nginx:1.27-alpine`**.
  La imagen usa `build:image` (`vite build` sin `tsc`; el typecheck corre en
  local/CI).
- `.dockerignore` excluye lo que infla el contexto (tests, reportes, artefactos
  de Electron, `.sql` crudos).

> Primera puesta en marcha: genera la migración inicial con
> `pnpm db:migrate` contra Postgres (solo en desarrollo) y siembra con
> `pnpm db:seed`. `docker compose up` aplica `migrate deploy` al arrancar.

## 3. nginx y configuración runtime

- SPA fallback `try_files $uri $uri/ /index.html`.
- Proxy `/api/` al servicio `api`, con **`resolver`** (Docker DNS) y `proxy_pass`
  por variable para re-resolver y evitar 502 al recrear el contenedor.
- `render-config.sh` genera `/config.js` con
  `window.__APP_CONFIG__ = { API_URL: "$WEB_API_URL" }`, consumido por
  `index.html` (mismo contrato que Electron).

## 4. CI/CD

- Por paquete (`api/`, `web/`), en `.github/workflows/`: `ci.yml` (build, lint,
  unitarias, migraciones y e2e) y un workflow que publica cada imagen a Docker Hub
  **solo `linux/amd64`**, con caché `type=gha` y sin atestaciones
  (`provenance/sbom: false`). En Mac ARM la imagen corre emulada; para desarrollo
  nativo, `docker compose build`.
- El job de la API corre `prisma migrate deploy` contra una base vacía para
  detectar migraciones rotas.
- Typecheck (`pnpm build`) y lint en cada paquete antes de merge.

## 5. Cabeceras, HTTPS y CORS

- HTTPS obligatorio en producción; cabeceras de seguridad (`helmet`), HSTS, CSP,
  `X-Content-Type-Options`, `X-Frame-Options`.
- CORS restringido al origen del frontend (`WEB_ORIGIN`).
- Rate limiting en login y endpoints públicos: **pendiente** (M12); hoy solo
  existe el bloqueo temporal por intentos fallidos.

## 6. Escritorio (opcional, no implementado)

Previsto, aún sin código en el repo: la web se empaquetaría como app de escritorio (Electron): carga el mismo `dist/`
por protocolo `app://` y resuelve la URL de la API por
`window.__APP_CONFIG__` / `config.json` (menú Servidor). Instaladores con
`electron-builder` (firma ad-hoc en mac).

## 7. Checklist de despliegue

- [ ] `.env` con secretos reales (nunca en el repo).
- [ ] HTTPS y cabeceras de seguridad activas.
- [ ] CORS restringido al origen del frontend.
- [ ] Rate limiting en login y endpoints públicos (pendiente de implementar, M12).
- [ ] `prisma migrate deploy` aplicado (sin seed en arranque).
- [ ] Backfills insert-missing (permisos/roles/políticas/sys_config) al arrancar.
- [ ] Respaldos automáticos configurados (ver [`../operacion/respaldos.md`](../operacion/respaldos.md)).
- [ ] Healthchecks (`/api/v1/health`, `/health/ready`) y monitoreo.
