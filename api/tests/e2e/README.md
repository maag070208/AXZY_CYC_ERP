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

## Aislamiento y limpieza

Cada corrida crea usuarios con el prefijo `e2e_` y un sufijo único
(`newRunId()`). `afterAll` los borra con `clearAuthE2E`; roles, tokens y
excepciones caen en cascada. Ningún dato real del cliente se toca.

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
