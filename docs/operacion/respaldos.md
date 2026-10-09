# Respaldos y restauración

Respaldo de PostgreSQL y de los archivos del expediente, con restauración
probada (M12). Dos caminos que producen **el mismo formato**:

| Camino | Cuándo | Cómo |
|---|---|---|
| Servicio `backup` de `docker-compose` | Programado (cada 24 h por defecto) | Corre solo con `docker compose up -d` |
| `pnpm --dir api backup` | A demanda: antes de una migración, de una importación (M20) o de restaurar | Usa `pg_dump` local o `docker exec` en `cyc-postgres` |

## 1. Qué se respalda

| Elemento | Archivo | Notas |
|---|---|---|
| Base de datos | `cyc-AAAAMMDD-HHmmss.dump` | `pg_dump -Fc --no-owner` (incluye la bitácora) |
| Integridad | `cyc-….dump.sha256` | Lo verifica la restauración |
| Archivos (driver `local`) | `cyc-…-files.tar.gz` | Expedientes y justificantes de `STORAGE_LOCAL_DIR` |
| Archivos (driver `s3`) | — | Se respaldan con el versionado del bucket |
| Configuración (`.env`, compose) | — | Fuera del repo, en un almacén seguro |

Cada respaldo terminado registra la fecha en `settings.MIGRATION_LAST_BACKUP_AT`:
M20 exige un respaldo de las últimas 24 h antes de importar (`409 BACKUP_REQUIRED`).

## 2. Respaldo programado (compose)

```bash
docker compose up -d backup          # diario, en ./backups
docker compose logs -f backup        # "[backup] cyc-… listo"
BACKUP_INTERVAL_HOURS=0 docker compose run --rm backup   # uno solo y termina
```

| Variable | Default | Descripción |
|---|---|---|
| `BACKUP_DIR` | `./backups` | Carpeta del host donde quedan los archivos |
| `BACKUP_INTERVAL_HOURS` | `24` | Frecuencia; `0` = un respaldo y termina (para un cron externo) |
| `BACKUP_RETENTION_DAYS` | `30` | Se borran los `cyc-*` más antiguos |

Copiar la carpeta **fuera del servidor** (y cifrada) es responsabilidad de la
operación: un respaldo que vive en el mismo disco que la base no protege de
perder el servidor. En Railway se usan además los respaldos administrados del
servicio de Postgres.

## 3. Respaldo a demanda

```bash
pnpm --dir api backup                       # → api/backups/
pnpm --dir api backup --container=otro      # si el contenedor no se llama cyc-postgres
```

Lee `DATABASE_URL`, `BACKUP_DIR` (default `backups`), `BACKUP_RETENTION_DAYS` y
`STORAGE_LOCAL_DIR` del `.env` de la API.

## 4. Restauración

```bash
pnpm --dir api restore backups/cyc-AAAAMMDD-HHmmss.dump
pnpm --dir api restore <archivo.dump> --yes     # base NO local (producción)
```

Hace, en orden: verifica el `sha256` → **vacía el esquema `public` y lo
restaura** (la base queda exactamente como el respaldo) → `prisma migrate deploy`
(el respaldo puede venir de una versión anterior) → reporta conteos de usuarios,
alumnos, inscripciones, calificaciones y pagos para validar contra el origen.

- **Se niega** a tocar una base que no es local sin `--yes`.
- La API debe estar detenida durante la carga.
- Los archivos se restauran aparte:
  `tar -xzf cyc-…-files.tar.gz -C <STORAGE_LOCAL_DIR>`.

## 5. El arranque no siembra

El contenedor de la API aplica `prisma migrate deploy` y arranca; el seed **no**
corre al iniciar ([D-017](../../DECISIONES.md)). `pnpm --dir api seed` solo hace
el *insert-missing* de permisos, roles y matriz, y crea el administrador inicial
si la tabla `users` está vacía.

## 6. Pruebas de restauración

- Probar la restauración **periódicamente** (p. ej. mensual) en una base aparte:

  ```bash
  DATABASE_URL=postgresql://…/cyc_restore_check pnpm --dir api restore <archivo.dump>
  ```

- Documentar fecha, responsable y resultado. Un respaldo no probado no es válido.
- Verificada el 2026-10-09: respaldo → restauración en base temporal → mismos
  conteos que el origen.

## 7. Responsabilidades

| Actividad | Responsable |
|---|---|
| Mantener el servicio `backup` y copiar los archivos fuera del servidor | Administrador de infraestructura |
| Prueba de restauración | Administrador + control escolar (validación de datos) |

> Los scripts `seed:from-backup`, `cutover` y `legacy:extract` del estándar PTNV
> **no aplican** al SGE: allá convierten respaldos de un modelo anterior; aquí
> los históricos entran por la importación CSV de M20 ([D-051](../../DECISIONES.md)).
