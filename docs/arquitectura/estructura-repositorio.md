# Estructura del repositorio (monorepo)

Repositorio único **AXZY_CYC_ERP**: `api/` y `web/` son paquetes independientes
(cada uno con su `package.json`), `docs/` es compartido y la raíz orquesta el
despliegue con Docker. Ver [D-014](../../DECISIONES.md).

```
.
├── docker-compose.yml            # postgres + api + web (deploy fácil)
├── .env.example                  # variables del compose
├── package.json                  # scripts de orquestación del monorepo
├── README.md
├── DECISIONES.md
├── CONTRIBUTING.md
├── docs/                         # Esta documentación
├── api/                          # paquete: API Express + Prisma
│   ├── Dockerfile                # imagen del API
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   ├── seed.ts
│   │   └── seed-data/            # fixtures JSON del seed
│   └── src/
│       ├── index.ts              # boot: createApp + backfills + listen
│       ├── app.ts                # createApp(): middlewares globales + /api/v1
│       ├── core/
│       │   ├── config/           # env.config.ts, database.ts
│       │   ├── middlewares/      # auth, error, language
│       │   ├── permissions/      # RBAC dinámico
│       │   ├── policies/         # ABAC dinámico
│       │   ├── services/         # mail, storage(S3), ably
│       │   ├── swagger/          # registry, openapi, setup
│       │   ├── utils/            # table, security, logger, asyncHandler
│       │   ├── db/               # paginatedQuery
│       │   └── i18n/             # messages/{es,en}
│       └── modules/
│           ├── api.router.ts     # monta módulos + wiring DIP
│           └── <dominio>/        # auth, users, permissions, audit, …
│               ├── index.ts
│               ├── routes/<x>.routes.ts
│               ├── controllers/<x>.controller.ts
│               ├── services/<x>.service.ts
│               └── models/{dto,entity}/
└── web/                          # paquete: React + FSD + Axzy UI
    ├── Dockerfile                # imagen de la web (nginx)
    ├── nginx.conf
    ├── package.json
    └── src/
        ├── app/                  # main.tsx, App.tsx, store, guards, toast
        ├── shared/               # api, ui, lib, i18n, validation, pdf, utils
        ├── entities/<dominio>/   # api/ + model/ + ui/ + index.ts (barrel)
        ├── features/<dominio>/   # <caso-uso>/{model,ui,index.ts}
        ├── widgets/<x>/          # composiciones (PDFs, paneles)
        └── pages/                # rutas
```

## Docker

- **`api/Dockerfile`**: multi-stage (builder Node + runtime slim); aplica
  `prisma migrate deploy` y arranca (`node dist/src/index.js`). El seed **no**
  corre al arrancar.
- **`web/Dockerfile`**: builder Vite + runtime **nginx**; sirve el SPA y hace
  proxy de `/api/` al contenedor `api`.
- **`docker-compose.yml`**: postgres + api + web, con healthchecks y volúmenes.
  Deploy: `docker compose up --build -d`.

## Reglas

- **API:** un módulo = una carpeta en `src/modules/`; lo compartido en `src/core/`.
  El esquema Prisma es la fuente de verdad en `prisma/schema.prisma`.
- **Web (FSD):** límites de capa forzados por ESLint; el barrel `entities/<d>/index.ts`
  es la única API pública de un entity (nadie importa de `model/` o `api/` directo).
- **UI compartida:** componentes propios en `web/src/shared/ui/<componente>/`; el
  resto sale del Axzy UI System.
- **Nada de archivos subidos al repo:** el almacenamiento vive en S3 (o volumen);
  `.env` nunca se versiona.
- Nombres de carpeta en `kebab-case`; de componentes, en `PascalCase`.

Ver detalle en [`api-modular.md`](api-modular.md) y [`web-fsd.md`](web-fsd.md).
