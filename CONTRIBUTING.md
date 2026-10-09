# Cómo contribuir

Guía de trabajo del SGE (documentación y código). Los estándares completos están
en [`docs/guia/convenciones.md`](docs/guia/convenciones.md).

## 1. Principios

1. **Estándar de la casa.** Se reutiliza la arquitectura y convenciones de PTNV; en web, el Axzy UI System.
2. **Un módulo a la vez**, en el orden del [roadmap](docs/guia/roadmap.md).
3. No avanzar sin que el módulo anterior funcione y tenga pruebas.
4. **Código en inglés, comentarios y documentación en español, todo lo visible por i18n**
   ([D-046](DECISIONES.md)): identificadores, campos, enums, rutas, códigos de error y
   llaves i18n en inglés; ningún texto visible escrito en el código.
5. Registrar toda ambigüedad resuelta en [`DECISIONES.md`](DECISIONES.md).
6. Nunca versionar secretos ni credenciales.

## 2. Monorepo y comandos

`api/` y `web/` son paquetes del **monorepo `AXZY_CYC_ERP`** (ver [D-014](DECISIONES.md)),
cada uno con su `package.json`. Desde la raíz:

```bash
pnpm install:all            # instala api y web
pnpm dev:api                # API en :4001
pnpm dev:web                # Web en :5173
pnpm docker:up              # docker compose up --build -d (web :8080, api :4001)
pnpm docker:down
```

**API (`api/`)**
```bash
pnpm --dir api install
pnpm --dir api dev
pnpm --dir api build
pnpm --dir api lint
pnpm --dir api prisma:migrate:dev
pnpm --dir api prisma:migrate      # migrate deploy
pnpm --dir api seed
pnpm --dir api test:unit
pnpm --dir api exec playwright test tests/e2e/<spec>.spec.ts   # SOLO el spec del cambio
```

**Web (`web/`)**
```bash
pnpm --dir web install
pnpm --dir web dev
pnpm --dir web build
pnpm --dir web lint
pnpm --dir web exec playwright test tests/e2e/<spec>.spec.ts   # SOLO el spec del cambio
```

## 3. Regla de pruebas (importante)

- Corre **únicamente el spec** que cubre tu cambio. **Nunca** la suite completa
  por inercia.
- Si el cambio no tiene spec, dilo y ofrécelo.
- No hagas verificaciones largas (builds de Docker, barridos) sin que se pidan.

## 4. Flujo de trabajo

1. Elige el módulo (M01–M22) según el roadmap.
2. Lee su README en `docs/modulos/` y el modelo de datos relacionado.
3. Implementa en el orden estándar:
   - **API:** migración Prisma → módulo (`models/dto` zod → `services` →
     `controllers` → `routes` con `requiresPermission` → registrar en `api.router.ts`).
   - **Web:** `entities` (api + model) → `features` (casos de uso) → `pages` con
     `ITPage`/`ITDataTable`/`ITFormBuilder`.
4. Cada escritura pasa por el `AuditPort`; cada endpoint valida con Zod y declara su permiso.
5. Actualiza el README del módulo (estado, endpoints finales, decisiones).
6. Corre lint, typecheck y el spec del módulo.

## 5. Definición de «terminado»

- [ ] Migración y modelo Prisma.
- [ ] Módulo API (routes/controller/service/dto/entity) con permisos, alcance y bitácora.
- [ ] Pantallas web con el UI kit (i18n y validación incluidos).
- [ ] Spec(s) del módulo pasando.
- [ ] README del módulo completo según la [plantilla](docs/plantillas/plantilla-modulo.md).

## 6. Convenciones de commits

Conventional Commits: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
```
feat(students): alta con validación de CURP
fix(enrollments): evitar empalme de horario
docs(payments): documentar folio de recibo
```

## 7. Cómo documentar un módulo

1. Copia [`docs/plantillas/plantilla-modulo.md`](docs/plantillas/plantilla-modulo.md)
   a `docs/modulos/MXX-nombre/README.md`.
2. Completa **todas** las secciones (si algo no aplica, indícalo).
3. Actualiza el índice [`docs/modulos/README.md`](docs/modulos/README.md).

## 8. Cómo registrar una decisión

Nuevo `D-###` en [`DECISIONES.md`](DECISIONES.md) con fecha, estado, contexto,
decisión, alternativas y consecuencias.

## 9. Revisión (PR)

- [ ] Cambios acotados al módulo/repo correcto.
- [ ] Endpoints con Zod, permiso/alcance y bitácora.
- [ ] Sin secretos ni datos sensibles.
- [ ] Sin identificadores en español ni texto visible fuera de los catálogos i18n (`es` y `en`).
- [ ] Spec del cambio pasando; documentación actualizada.
