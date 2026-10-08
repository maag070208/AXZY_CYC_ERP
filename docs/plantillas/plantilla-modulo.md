# Plantilla de documentación de módulo

Copia este archivo al crear el `README.md` de un módulo en
`docs/modulos/MXX-nombre/README.md`. **No elimines secciones**: si algo no aplica,
escríbelo como «No aplica» y explica por qué.

La plantilla refleja el estándar PTNV: backend Express modular, web FSD + Axzy UI,
RBAC/ABAC, tablas server-side, bitácora por `AuditPort` y pruebas Playwright.

> Los enlaces internos de esta plantilla son relativos a `docs/plantillas/`. Al
> copiarla a `docs/modulos/MXX-nombre/`, ajusta la profundidad
> (`../../../DECISIONES.md`, `../../modelo-datos/…`, `../../seguridad/…`).

---

# MXX — Título del módulo

| Campo | Valor |
|---|---|
| **Código** | MXX |
| **Versión** | 0.1 |
| **Estado** | Planeado / En diseño / En desarrollo / Terminado |
| **Fase** | Descubrimiento / Núcleo / Personas / Académico / Finanzas / Extras |
| **Depende de** | Módulos o componentes previos |
| **Habilita a** | Módulos que lo consumen |
| **Permisos** | `recurso.accion` (con alcance) |

## 1. Objetivo

Una o dos frases: qué problema resuelve y para quién.

## 2. Alcance

**Incluye**
- …

**No incluye (en este módulo)**
- …

## 3. Modelo de datos (Prisma)

Para cada modelo: campos, tipos, claves, índices. Convención: `id uuid`,
`createdAt`/`updatedAt`, `active` o borrado lógico por dominio
(ver [D-003](../../DECISIONES.md) y
[`../../modelo-datos/diccionario-datos.md`](../modelo-datos/diccionario-datos.md)).

```prisma
model Ejemplo {
  id        String   @id @default(uuid())
  // ...
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("ejemplos")
}
```

**Índices:** …
**Relaciones:** …

## 4. Reglas de negocio

Numeradas y verificables (cada una mapeable a una prueba):

1. …
2. …

## 5. API

Módulo bajo `api/src/modules/<x>/` (`routes/ · controllers/ · services/ · models/{dto,entity}/`).

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/...` | … | `<recurso>.view` |
| POST | `/api/v1/.../query` | Listado server-side | `<recurso>.view` |

Request/response de los endpoints no triviales (Zod + respuesta).

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| … | `entities/<x>` | API + modelo |
| … | `features/<x>/<caso>` | Casos de uso |
| … | `pages/...` | Pantallas |

Pantallas con `ITPage` + `ITDataTable`/`ITFormBuilder`; entidades y features
indicadas; i18n con su namespace.

## 7. Permisos y alcance

Permisos `recurso.accion` con alcance (`NONE/OWN/AREA/ALL`); reglas de scoping por
registro y políticas ABAC aplicables. Ver [`roles-permisos.md`](../seguridad/roles-permisos.md).

## 8. Validaciones

Reglas de validación (Zod en API, `@shared/validation` en web), mensajes/códigos.

## 9. Bitácora

Acciones que se registran vía `AuditPort` con `previousState`/`newState`.

## 10. Pruebas (Playwright)

- Unitarias (`api/tests/unit`): …
- Contrato (`api/tests/e2e`): …
- Navegador (`web/tests/e2e`): …
- Spec(s) del módulo: `tests/e2e/<modulo>.spec.ts`.

## 11. Criterios de aceptación

- [ ] Migración y modelo Prisma.
- [ ] Módulo API (routes/controller/service/dto/entity) con permisos y bitácora.
- [ ] Pantallas web con UI kit.
- [ ] Specs pasando (solo los del módulo).
- [ ] Este README completo.

## 12. Decisiones abiertas

Preguntas sin resolver; enlaza a [`DECISIONES.md`](../../DECISIONES.md).

## 13. Referencias

Enlaces a otros documentos, spec original y código.
