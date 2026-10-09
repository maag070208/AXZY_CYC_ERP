# Suite E2E de la API (Playwright)

Pruebas **reales** contra la API corriendo en local: cada test hace peticiones
HTTP de verdad a `http://localhost:4000/api/v1`, que escribe en la base Postgres
de verdad. No hay mocks ni base en memoria.

## Cómo correrlas

```bash
cd api
npm test
```

Si la API no está levantada, Playwright la arranca con `npm run dev` y espera al
health check; si ya está corriendo, la reutiliza. Postgres tiene que estar
arriba y la BD con el catálogo de permisos/roles sembrado (el arranque de la API
hace el backfill insert-missing).

```bash
npm test -- auth.spec.ts     # un solo archivo
npm test -- -g "refresh"     # por nombre
npm run test:e2e:report      # abrir el último reporte HTML
```

## Specs

| Archivo | Módulo | Cubre |
|---|---|---|
| `auth.spec.ts` | M02 | Login, lockout, `/auth/me`, refresh rotado, logout, recuperación de contraseña de punta a punta, autorización por endpoint |
| `users.spec.ts` | M02 | CRUD de usuarios, multi-rol, validaciones, baja/reactivación, desbloqueo, contraseña temporal y cambio propio, bitácora |
| `permissions.spec.ts` | M02 | Roles dinámicos, matriz (anti-lockout), excepciones por persona, políticas ABAC (prioridad, roles, `@user.id`) |
| `students.spec.ts` | M03/M05 | Alta con matrícula, CURP, homónimos, tutores, búsqueda, edición, alcance OWN/AREA, exportación, baja/reingreso e historial |
| `teachers.spec.ts` | M04 | Alta transaccional con cuenta e invitación, edición sincronizada, baja/reactivación, reenvío, alcance OWN |
| `documents.spec.ts` | M06 | Subida multipart, firmas de archivo, 5 MB, descarga privada, validación/rechazo/reemplazo, baja lógica, faltantes, kardex, alcance |
| `m07-cursos-grupos-inscripciones.spec.ts` | M07 | Cursos, grupos (horario, cupo), inscripción con cupo/duplicado/empalme/alumno inactivo, concurrencia al último lugar, baja, cambio de grupo, baja del alumno (M05), alcance AREA/OWN |
| `m08-examenes-calificaciones.spec.ts` | M08 | Instrumentos (suma ≤ 100), captura en lote con bitácora anterior/nuevo, rango, libro con proyección, cierre (umbral, estatus, kardex), exportación, alcance |
| `m09-colegiaturas-pagos.spec.ts` | M09 | Conceptos, cargos, pagos parciales y folio, cancelaciones con bitácora, Idempotency-Key, concurrencia, política de descuento, generación masiva, recargos, estado de cuenta y alcance |
| `m10-reportes-tablero.spec.ts` | M10 | Catálogo por alcance, validaciones, cada reporte, AREA del profesor, montos solo ALL, exportación xlsx/pdf auditada, tablero |
| `m11-administracion-catalogos.spec.ts` | M11 | `settings` (todo o nada, bitácora, idioma), niveles, ciclos (uno activo), motivos de baja, tipos de documento |

## Qué cubre `auth.spec.ts` (M02)

- `POST /auth/login`: feliz (tokens + usuario con permisos), credenciales
  inválidas (`401 INVALID_CREDENTIALS`) y **bloqueo tras 5 intentos**
  (`429 ACCOUNT_LOCKED`, incluso con la contraseña correcta).
- `GET /auth/me`: `401` sin token; con token devuelve usuario, `roles`,
  `permissions` (mapa `{ permiso: alcance }`) e `language`.
- `POST /auth/refresh`: **rotación** (el refresh viejo deja de servir) y `logout`
  revoca el refresh vigente.
- `POST /auth/forgot-password`: responde `200` aunque el usuario no exista.
- `POST /auth/reset-password`: token inválido → `422 RESET_TOKEN_INVALID`;
  contraseña corta → `400 VALIDATION_ERROR` con `details` por campo.
- Autorización: cuenta dada de baja (`401 ACCOUNT_DEACTIVATED`), login por email,
  refresh usado como access (`401 INVALID_TOKEN`), header mal formado, `403
  INSUFFICIENT_PERMISSIONS` registrado como `ACCESS_DENIED`, `200` con permiso y
  bitácora `AUTH_LOGIN` sin secretos.

## Provisión para la suite web

La suite de navegador (`web/tests/e2e`) usa usuarios fijos por rol. Este paquete
es el dueño de la base, así que los crea y borra:

```bash
npm run test:e2e:provision   # e2e_admin, e2e_control, e2e_profesor (este último con perfil de profesor M04)
npm run test:e2e:clean       # borra todo lo que lleva el prefijo e2e_/E2E
npm run --silent test:e2e:reset-token -- e2e_usuario   # token de recuperación conocido
```

## Aislamiento y limpieza

Cada corrida crea usuarios con el prefijo `e2e_` y un sufijo único
(`newRunId()`); roles `E2E_*`, políticas `e2e_*` y registros de catálogo
`E2E …`, alumnos con `nombres` `E2E …` (y sus archivos del driver local) y
profesores con correo `e2e_…`. `afterAll` los borra (`clearAuthE2E`, `clearAccessE2E`,
`clearCatalogsE2E`) y restaura los parámetros que tocó. Ningún dato real del
cliente se toca.

## Seguridad

`support/env.ts` se niega a correr si `DATABASE_URL` no apunta a un host local,
salvo que exportes `E2E_ALLOW_REMOTE_DB=1`, y nunca corre con
`NODE_ENV=production`.

## Variables de entorno

Se leen del mismo `api/.env` que usa el servidor.

| Variable | Default | Para qué |
|---|---|---|
| `E2E_API_URL` | `http://localhost:${PORT}/api/v1` | Apuntar a otra instancia |
| `E2E_PASSWORD` | `e2e-Test-2026!` | Contraseña de los usuarios de prueba |
| `E2E_ALLOW_REMOTE_DB` | — | `1` para permitir una base no local |
