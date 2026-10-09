# syntax=docker/dockerfile:1

# =============================================================================
# Imagen de la web (SPA React + Vite → nginx).
#
# El builder instala SOLO lo que necesita `vite build`. Del manifiesto se
# descartan DENTRO de la imagen los árboles de ESLint, TypeScript y Playwright
# (~60 MB y miles de archivos que el build del SPA no toca): el typecheck
# (`tsc -b`) y el lint corren en local y en CI, no aquí.
#
# El runtime es nginx y solo recibe `dist/`, así que nada de eso llega a la
# imagen final. Ver D-051.
# =============================================================================

ARG NODE_VERSION=20
ARG PNPM_VERSION=10.34.0

# =========================
# Builder
# =========================
FROM node:${NODE_VERSION}-bookworm-slim AS builder

ARG PNPM_VERSION

# Con caché de npm para no re-descargarlo en cada build.
RUN --mount=type=cache,target=/root/.npm npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app

# Dependencias primero (capa cacheable, reproducible con el lockfile).
COPY package.json pnpm-lock.yaml ./

# Manifiesto reducido a lo que el build usa de verdad (más `dependencies`, que
# no se toca). Sin `--frozen-lockfile`, porque el lockfile aún declara las
# devDependencies que se acaban de quitar; `prefer-frozen-lockfile` (por
# defecto) reutiliza las versiones fijadas para todo lo que queda — el prune
# solo elimina entradas, no cambia ninguna versión — y el CI comprueba con
# `--frozen-lockfile` que el lockfile siga al día.
RUN node <<'NODE'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const keep = new Set(["vite", "@vitejs/plugin-react-swc", "@tailwindcss/vite", "tailwindcss"]);
for (const name of Object.keys(pkg.devDependencies)) {
  if (!keep.has(name)) delete pkg.devDependencies[name];
}
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("devDependencies del build:", Object.keys(pkg.devDependencies).join(", "));
NODE

# La caché de side-effects se desactiva: guarda el resultado de los postinstall
# en el store compartido y, si cambia la plataforma (p. ej. runner arm64), deja
# binarios de esbuild/SWC/oxide de la plataforma anterior.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --config.side-effects-cache=false --store-dir=/pnpm/store

# Código y build. La imagen solo necesita el artefacto: `vite` (esbuild) compila
# sin tipar; el typecheck (`tsc -b`) corre en `pnpm run build` (local/CI).
COPY . .
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm run build:image


# =========================
# Runtime — nginx
# =========================
FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 render-config.sh /docker-entrypoint.d/10-render-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
