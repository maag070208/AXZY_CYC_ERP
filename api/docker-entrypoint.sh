#!/bin/sh
# =============================================================================
# Entrypoint de la API.
#
#   1. Aplica las migraciones pendientes (`prisma migrate deploy`).
#   2. Cede el PID 1 a la app con `exec`, para que reciba SIGTERM/SIGINT y el
#      contenedor pare al instante (sin esperar el SIGKILL de Docker).
#
# El seed NO se ejecuta aquí: una base con datos no debe tocarse (D-017). Es
# manual (`pnpm db:seed`) contra la base, no desde el contenedor.
#
# Variables:
#   SKIP_MIGRATIONS=true → arranca sin tocar la base (útil para pruebas).
# =============================================================================
set -e

PRISMA_BIN="/app/node_modules/.bin/prisma"

if [ "${SKIP_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] SKIP_MIGRATIONS=true: no se aplican migraciones"
elif [ ! -x "$PRISMA_BIN" ]; then
  echo "[entrypoint] ERROR: falta el CLI de Prisma en $PRISMA_BIN" >&2
  exit 1
else
  echo "[entrypoint] aplicando migraciones pendientes (prisma migrate deploy)…"
  "$PRISMA_BIN" migrate deploy
fi

echo "[entrypoint] arrancando la API: $*"
exec "$@"
