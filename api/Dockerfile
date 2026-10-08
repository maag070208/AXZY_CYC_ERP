# syntax=docker/dockerfile:1

# =========================
# Builder
# =========================
FROM node:20-bullseye AS builder

WORKDIR /app

# pnpm con caché de npm para no re-descargarlo en cada build.
RUN --mount=type=cache,target=/root/.npm npm install -g pnpm@10

# Dependencias (reproducible con el lockfile).
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

# Esquema de Prisma y cliente generado (los binarios se cachean entre builds).
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.cache/prisma pnpm exec prisma generate

# Código y compilación.
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build


# =========================
# Runtime
# =========================
FROM node:20-bullseye-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

EXPOSE 4001

# Boot de producción: aplica migraciones pendientes y arranca. El seed NO corre
# aquí (una base con datos no debe tocarse); es manual con `npm run seed`.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
