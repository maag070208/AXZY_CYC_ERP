# Respaldos y restauración

Estándar PTNV: respaldos de PostgreSQL y del almacenamiento, con utilidades de
restauración y regeneración de fixtures.

## 1. Qué se respalda

| Elemento | Frecuencia | Retención sugerida |
|---|---|---|
| PostgreSQL (`pg_dump -Fc`, formato custom) | Diario | 30 diarios + 12 mensuales |
| Archivos S3 (expedientes, justificantes) | Versionado del bucket | Según política |
| Configuración (`.env`, compose) | Al cambiar | Versionado seguro (no en repo) |
| Bitácora | Incluida en el dump | Igual que la BD |

## 2. Programación

- Respaldo **diario** en horario de baja actividad; **antes** de migraciones o
  importaciones masivas (M20).
- Almacenar fuera del servidor de producción y **cifrado**.
- Verificar integridad (checksum) al generar.

## 3. Restauración (herramienta del proyecto)

La API expone la utilidad de restauración (mismo patrón que PTNV):

```bash
# Reemplaza la base con un respaldo (convierte el dump, restaura, aplica migraciones y concilia)
npm run restore -- /ruta/sge-AAAA-MM-DD.dump
npm run restore -- dump --yes        # base NO local (producción)
npm run restore -- dump --fixtures   # además refresca las seeds
```

Hace, en orden: convierte el dump → **vacía el esquema y lo restaura tal cual** →
`prisma migrate deploy` (el respaldo suele estar atrás en migraciones) → garantiza
catálogos base → concilia/reporta. **Se niega** a tocar una base remota sin `--yes`.
La API debe estar detenida durante la carga.

## 4. Regenerar fixtures con un respaldo

```bash
npm run seed:from-backup -- /ruta/sge-AAAA-MM-DD.dump
npm run cutover    # lleva esos fixtures a una base (migrate deploy + seed forzado)
```

`seed:from-backup` lee el dump del **modelo actual** y escribe los fixtures JSON
que consume el seed, con las columnas derivadas del DMMF de Prisma (una columna
nueva entra sola). Deja constancia del respaldo de origen (nombre + sha256 + filas
por tabla). No toca `permissions.json`/`role_permissions.json`/`roles.json`: son
catálogo del repo.

## 5. El arranque no siembra

- El contenedor de la API corre `prisma migrate deploy && node dist/src/index.js`.
  El seed **no** corre al arrancar (ver [D-017](../../DECISIONES.md)).
- El seed es de solo lectura en bases con usuarios; solo escribe en base vacía o
  con `cutover`.

## 6. Restauración manual (referencia)

```bash
pg_restore --clean --no-owner -d "$DATABASE_URL" sge-AAAA-MM-DD.dump
```

1. Detener la aplicación (evitar escrituras).
2. Restaurar la base.
3. Restaurar archivos S3 si aplica.
4. Aplicar migraciones pendientes.
5. Verificar integridad (conteos de alumnos, pagos, calificaciones) y reactivar.

## 7. Pruebas de restauración

- Probar la restauración **periódicamente** (p. ej. mensual) en ambiente aislado.
- Documentar fecha, responsable y resultado. Un respaldo no probado no es válido.

## 8. Responsabilidades

| Actividad | Responsable |
|---|---|
| Configurar/monitorear respaldos | Administrador de infraestructura |
| Prueba de restauración | Administrador + control escolar (validación de datos) |
