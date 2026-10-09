# syntax=docker/dockerfile:1

# =============================================================================
# Imagen de la API (Express + TypeScript + Prisma).
#
# Etapas:
#   base      → SO base (bookworm-slim) + `openssl`, que Prisma necesita para
#               detectar la versión de libssl.
#   tools     → base + pnpm (solo para instalar/compilar).
#   build     → TODAS las dependencias + cliente Prisma + `tsc` (dist/).
#   prod-deps → node_modules SOLO de producción (sin Playwright, ESLint,
#               TypeScript, ts-node ni nodemon) + cliente Prisma.
#   runtime   → base sin pnpm ni cadena de herramientas, usuario `node`.
#
# El seed NO corre aquí (una base con datos no debe tocarse, ver D-017): el
# entrypoint aplica las migraciones pendientes y cede el PID 1 a la API.
# =============================================================================

ARG NODE_VERSION=20
ARG PNPM_VERSION=10.34.0

# =========================
# Base común (SO)
# =========================
FROM node:${NODE_VERSION}-bookworm-slim AS base

# El motor de Prisma detecta la plataforma leyendo libssl: sin `openssl` el
# arranque falla con "Unable to require libquery_engine". `ca-certificates` ya
# viene en la imagen de Node.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# =========================
# pnpm (solo build y prod-deps)
# =========================
FROM base AS tools

ARG PNPM_VERSION

# Con caché de npm para no re-descargarlo en cada build.
RUN --mount=type=cache,target=/root/.npm npm install -g pnpm@${PNPM_VERSION}

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

# =========================
# Build (dependencias de desarrollo incluidas)
# =========================
FROM tools AS build

# Dependencias (reproducible con el lockfile). La caché de side-effects se
# desactiva: guarda el resultado de los postinstall en el store compartido y,
# si cambia la imagen base (otra libssl), arrastraría motores de Prisma de la
# plataforma anterior.
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --config.side-effects-cache=false --store-dir=/pnpm/store

# Esquema de Prisma y cliente generado (los binarios se cachean entre builds).
COPY prisma ./prisma
RUN --mount=type=cache,id=prisma-engines,target=/root/.cache/prisma \
    pnpm exec prisma generate

# Código y compilación.
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# =========================
# Solo dependencias de producción
# =========================
FROM tools AS prod-deps
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --config.side-effects-cache=false --store-dir=/pnpm/store

# Cliente Prisma generado sobre el node_modules de producción. `prisma` es
# dependencia de producción porque el contenedor aplica las migraciones.
#
# Se genera SOLO el motor nativo: la imagen es glibc, así que los motores `musl`
# que declara el esquema (para otros empaquetados) serían 16 MB muertos. El
# esquema que se copia al runtime es el del repo, sin tocar.
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=cache,id=prisma-engines,target=/root/.cache/prisma \
    cp prisma/schema.prisma prisma/schema.image.prisma \
 && sed -i 's/binaryTargets *= *\[[^]]*\]/binaryTargets = ["native"]/' prisma/schema.image.prisma \
 && pnpm exec prisma generate --schema prisma/schema.image.prisma \
 && rm prisma/schema.image.prisma

# =========================
# Runtime
# =========================
FROM base AS runtime
ENV NODE_ENV=production

# Lo que cambia menos va primero para reaprovechar capas.
COPY --from=build /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules

# Esquema, migraciones y fixtures del catálogo. Los fixtures los lee el backfill
# insert-missing que corre al arrancar (`prisma/seed-data/*.json`, vía
# `core/utils/seed-data-dir.ts`): sin ellos la API arrancaría sin permisos (todo
# 403) y sin administrador inicial.
COPY --from=build /app/prisma ./prisma

# Artefacto compilado y entrypoint.
COPY --from=build /app/dist ./dist
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Metadatos del build (los expone `/health` para saber qué versión corre). Los
# pasa el workflow; sin ellos quedan vacíos y Railway usa `RAILWAY_GIT_*`.
ARG GIT_COMMIT=""
ARG BUILD_TIME=""
ARG BUILD_BRANCH=""
ENV GIT_COMMIT=$GIT_COMMIT \
    BUILD_TIME=$BUILD_TIME \
    BUILD_BRANCH=$BUILD_BRANCH

# Expediente en disco: el directorio debe existir con dueño `node` para que el
# volumen nombrado herede esos permisos y la API escriba sin root.
RUN mkdir -p /app/storage/private && chown -R node:node /app/storage

# Sin root: la API no necesita escribir fuera de /app/storage.
USER node

EXPOSE 4001

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4001)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# El entrypoint aplica `migrate deploy` y hace `exec` del CMD: el PID 1 es la
# API, que recibe SIGTERM directamente. El CMD es sustituible:
#   docker run --rm -it <imagen> sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
