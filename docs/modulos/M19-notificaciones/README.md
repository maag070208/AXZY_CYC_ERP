# M19 — Notificaciones (correo, SMS y WhatsApp)

| Campo | Valor |
|---|---|
| **Código** | M19 |
| **Versión** | 0.1 |
| **Estado** | Planeado |
| **Fase** | Extras |
| **Depende de** | M02 (auth/roles), M09 (cargos y pagos), M11 (configuración y catálogos), M15 (exámenes en línea), M18 (asistencia) |
| **Habilita a** | M09/M10/M21 (alertas y avisos), portal del alumno/tutor, recordatorios operativos |
| **Permisos** | `notifications.view`, `notifications.manage` (con alcance) |

## 1. Objetivo

Enviar avisos por correo, SMS y WhatsApp a alumnos, tutores y personal con
plantillas versionables y envío asíncrono confiable. Resuelve la comunicación
masiva y transaccional (recordatorios de pago, publicación de exámenes,
inasistencias y avisos generales) sin bloquear las operaciones de la API.

## 2. Alcance

**Incluye**
- Catálogo de plantillas de mensaje por canal, con variables `{{...}}` y asunto.
- Encolado y envío asíncrono (patrón *outbox*) con reintentos y registro de resultado.
- Proveedores intercambiables detrás de una interfaz común (correo: Resend/SMTP;
  SMS y WhatsApp: proveedor a definir, p. ej. Twilio).
- Preferencias de contacto y **baja (opt-out)** por destinatario y canal.
- Disparadores desde otros módulos vía `NotificationPort`: pago próximo a vencer,
  adeudo vencido, examen publicado, inasistencias y avisos generales.
- Notificación en tiempo real del estado de envío con Ably.
- Envío manual/prueba desde la consola (`POST /notifications/send`).

**No incluye (en este módulo)**
- La construcción del hecho de negocio que dispara el aviso (vive en M09, M15, M18…).
- Campañas de marketing con segmentación avanzada ni editor visual *drag & drop*.
- Buzón de entrada de respuestas entrantes (inbound) ni chatbot.
- Facturación/costo del proveedor de mensajería.

## 3. Modelo de datos (Prisma)

`NotificationTemplate` guarda el mensaje; `Notification` es la **cola/outbox** y a
la vez el historial de envíos; `NotificationPreference` guarda la baja por
destinatario y canal.

```prisma
enum NotificationChannel {
  EMAIL
  SMS
  WHATSAPP
}

enum NotificationStatus {
  EN_COLA
  ENVIADO
  FALLIDO
}

model NotificationTemplate {
  id        String              @id @default(uuid())
  clave     String              @unique          // p. ej. "PAGO_POR_VENCER"
  canal     NotificationChannel
  asunto    String?                              // solo correo
  cuerpo    String                               // variables {{nombre}}, {{monto}}
  variables Json                @default("[]")   // variables declaradas por la plantilla
  active    Boolean             @default(true)
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  notifications Notification[]

  @@index([canal, active])
  @@map("notification_templates")
}

model Notification {
  id                String              @id @default(uuid())
  destinatario      String                               // email o teléfono
  canal             NotificationChannel
  templateId        String?
  template          NotificationTemplate? @relation(fields: [templateId], references: [id])
  payload           Json                                 // variables resueltas
  asunto            String?                              // render final (correo)
  cuerpo            String?                              // render final
  status            NotificationStatus  @default(EN_COLA)
  attempts          Int                 @default(0)
  maxAttempts       Int                 @default(5)
  nextRetryAt       DateTime?
  error             String?
  providerMessageId String?
  idempotencyKey    String?             @unique
  sentAt            DateTime?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  @@index([status, nextRetryAt])   // drenado del worker
  @@index([destinatario])
  @@index([templateId])
  @@map("notifications")
}

model NotificationPreference {
  id           String              @id @default(uuid())
  destinatario String
  canal        NotificationChannel
  optOut       Boolean             @default(false)      // baja del canal
  motivo       String?
  active       Boolean             @default(true)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  @@unique([destinatario, canal])
  @@map("notification_preferences")
}
```

**Índices:** `notifications(status, nextRetryAt)` para el barrido del worker;
`notifications(destinatario)` e `(templateId)` para consulta e historial;
`notification_templates(canal, active)`; `notification_preferences` único por
`(destinatario, canal)`.
**Relaciones:** `Notification.templateId → NotificationTemplate.id` (opcional, se
puede enviar sin plantilla como mensaje libre). `NotificationPreference` no tiene
FK a alumnos/usuarios: la clave es el `destinatario` (desacopla el módulo).

> Nota de diccionario: [`diccionario-datos.md`](../../modelo-datos/diccionario-datos.md)
> describe `canal` y `status` como `varchar` con literales en minúsculas
> (`correo`, `en_cola`…). El estándar Prisma de la casa los modela como enums
> `UPPER_SNAKE`; el mapeo a la representación en minúsculas es 1:1 en los *mappers*.

## 4. Reglas de negocio

1. **Envío asíncrono (outbox):** encolar un aviso solo persiste un `Notification`
   en `EN_COLA` dentro de la misma transacción del disparador; la API nunca envía
   en el hilo del request.
2. **Drenado con reintentos:** un worker reclama los `EN_COLA` con `nextRetryAt`
   vencido y aplica **backoff exponencial**; al superar `maxAttempts` marca
   `FALLIDO` y guarda `error`. No hay reintento automático de `FALLIDO` salvo
   reencolado explícito.
3. **Proveedores intercambiables:** todos implementan la interfaz
   `NotificationProvider` (`send(Notification): Promise<ProviderResult>`); el
   proveedor por canal se resuelve por configuración (M11 `sys_config`).
4. **Render de plantillas:** `cuerpo`/`asunto` admiten variables `{{clave}}`; el
   envío valida que el `payload` cubra las variables declaradas; si falta alguna,
   no se encola y responde `VALIDATION_ERROR`.
5. **Preferencias y baja:** si el destinatario tiene `optOut` para el canal, no se
   envía (queda `FALLIDO`/omitido con motivo `OPT_OUT`). Los avisos marcados como
   transaccionales obligatorios (p. ej. estado de cuenta) están exentos.
6. **Disparadores desacoplados:** M09 (pago próximo a vencer, adeudo vencido), M15
   (examen publicado), M18 (inasistencias) y avisos generales invocan el
   `NotificationPort`; nunca importan modelos de M19 directamente.
7. **Idempotencia:** `POST /notifications/send` acepta `Idempotency-Key`; repetir
   la solicitud devuelve el `Notification` previamente creado sin reenviar.
8. **Tiempo real:** cada transición de estado (`EN_COLA → ENVIADO/FALLIDO`) se
   publica en el canal Ably del usuario para reflejarlo en la UI sin recargar.
9. **Aislamiento por canal:** un fallo del proveedor de un canal no detiene el
   drenado de los demás; el worker procesa por canal.
10. **Auditoría:** altas/ediciones/bajas de plantillas y envíos manuales se
    registran vía `AuditPort` (ver §9). Los envíos automáticos del worker usan
    `userId = null`.

## 5. API

Módulo bajo `api/src/modules/notifications/`
(`routes/ · controllers/ · services/ · models/{dto,entity}/ · providers/`). El
subdirectorio `providers/` contiene las implementaciones (`resend`, `smtp`,
`twilio`) detrás de la misma interfaz.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/notification-templates` | Lista de plantillas | `notifications.view` |
| GET | `/api/v1/notification-templates/:id` | Detalle de plantilla | `notifications.view` |
| POST | `/api/v1/notification-templates` | Alta de plantilla | `notifications.manage` |
| PATCH | `/api/v1/notification-templates/:id` | Edición de plantilla | `notifications.manage` |
| DELETE | `/api/v1/notification-templates/:id` | Baja lógica (`active = false`) | `notifications.manage` |
| POST | `/api/v1/notification-templates/query` | Listado server-side | `notifications.view` |
| POST | `/api/v1/notifications/query` | Historial de envíos (server-side) | `notifications.view` |
| POST | `/api/v1/notifications/send` | Envía/encola manualmente | `notifications.manage` |
| POST | `/api/v1/notifications/:id/retry` | Reencola un `FALLIDO` | `notifications.manage` |

> La especificación original mencionaba `GET /notifications/query`; se unifica a
> **`POST …/query`** para respetar el contrato de tablas server-side
> ([`api/convenciones.md`](../../api/convenciones.md) §3).

**`POST /notifications/send`** (cabecera `Idempotency-Key` opcional):

```jsonc
// Request
{
  "canal": "EMAIL",
  "destinatario": "tutor@example.com",
  "templateClave": "PAGO_POR_VENCER",   // o "cuerpo" libre si no hay plantilla
  "payload": { "nombre": "Ana López", "monto": "1500.00", "fecha": "2026-10-15" }
}
// Response 201
{
  "id": "…", "canal": "EMAIL", "status": "EN_COLA",
  "asunto": "Pago por vencer", "cuerpo": "Hola Ana López, tu pago de $1500.00 vence el 2026-10-15.",
  "destinatario": "tutor@example.com", "sentAt": null
}
```

**`POST /notifications/query`** — contrato ITDataTable estándar
(`{ page, limit, filters, sort }`; respuesta `{ data, total, page, pageIndex,
totalPages, totalCount, limit, hasPreviousPage, hasNextPage }`), con filtros por
`canal`, `status`, `destinatario` y rango de `createdAt`/`sentAt`.

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `notification-template` | `entities/notification-template` | API + tipos + hooks de plantillas |
| `notification` | `entities/notification` | API + tipos + hooks del historial de envíos |
| `notification-template/upsert` | `features/notification-template/upsert` | Alta/edición de plantilla con `ITFormBuilder` |
| `notification/send` | `features/notification/send` | Diálogo de envío/prueba manual |
| `notification/set-preference` | `features/notification/set-preference` | Baja/reincorporación por destinatario y canal |
| Plantillas | `pages/notifications/templates` | Listado con `ITPage` + `ITDataTable` |
| Historial | `pages/notifications/history` | Listado de envíos con filtros por estado/canal |
| Consola | `pages/notifications/settings` | Preferencias y estado de proveedores |

Pantallas con `ITPage` + `ITDataTable`/`ITFormBuilder` y `ITDialog` para el envío;
i18n con namespace **`notifications`**
(`shared/i18n/locales/{es,en}/notifications.json`). La suscripción Ably de estado
se integra en el canal de notificaciones ya provisto por `PrivateRoutes`.

## 7. Permisos y alcance

Permisos `recurso.accion` con alcance (`NONE/OWN/AREA/ALL`):

- `notifications.view` — consultar plantillas e historial; ADMIN `ALL`,
  CONTROL_ESCOLAR puede tener `ALL` en lectura para soporte.
- `notifications.manage` — CRUD de plantillas, envío manual y reintento; ADMIN `ALL`.

Scoping por registro: el historial se filtra por los destinatarios dentro del
alcance del actor cuando aplique (`AREA`/`OWN`). El catálogo y la matriz se rigen
por [`roles-permisos.md`](../../seguridad/roles-permisos.md) (fail-closed: sin
matriz cargada, `NONE`).

## 8. Validaciones

Zod en `models/dto` (whitelist estricta) y validadores puros en la web vía
`@shared/validation`:

- `canal` ∈ `{EMAIL, SMS, WHATSAPP}` → `INVALID_FORMAT` si no.
- `destinatario` obligatorio; correo válido para `EMAIL`, teléfono válido para
  `SMS`/`WHATSAPP` (`REQUIRED_FIELD` / `INVALID_EMAIL` / `INVALID_FORMAT`).
- `cuerpo` no vacío (`REQUIRED_FIELD`); `asunto` requerido solo si `canal = EMAIL`.
- Sistema de variables: `{{clave}}` debe existir en `payload` (`VALIDATION_ERROR`
  con `details` por variable faltante).
- `clave` de plantilla única → `DUPLICATE_RECORD`; `Idempotency-Key` inválida →
  `INVALID_IDEMPOTENCY_KEY`; clave reusada por otro usuario → `IDEMPOTENCY_KEY_REUSED`.
- Fallo de proveedor → el `Notification` queda `FALLIDO` con `error`; nunca 500 al
  cliente por un envío asíncrono.

## 9. Bitácora

Acciones registradas vía `AuditPort` con `previousState`/`newState`:

- `NOTIFICATION_TEMPLATE_CREATED`, `NOTIFICATION_TEMPLATE_UPDATED`,
  `NOTIFICATION_TEMPLATE_DEACTIVATED`.
- `NOTIFICATION_QUEUED`, `NOTIFICATION_SENT`, `NOTIFICATION_FAILED`,
  `NOTIFICATION_RETRIED` (los del worker con `userId = null`).
- `NOTIFICATION_OPTOUT_SET`, `NOTIFICATION_OPTOUT_REMOVED`.
- `ACCESS_DENIED` en cada 403 de `requiresPermission`.

Los secretos del proveedor (API keys) nunca se guardan en `previousState`/
`newState` (se enmascaran). Ver [`bitacora.md`](../../seguridad/bitacora.md).

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): render de plantillas con variables (falta una
  variable → error); cálculo de backoff y transición a `FALLIDO`; evaluación de
  `optOut`; mapeo de enums; resolución de proveedor por canal.
- **Contrato** (`api/tests/e2e`): CRUD de plantillas; `POST /notifications/send`
  con `Idempotency-Key` (repetir no duplica); `POST /notifications/query` contrato
  de tabla; permisos 401/403; bitácora de plantillas; con proveedor *fake*.
- **Navegador** (`web/tests/e2e`): alta/edición de plantilla, envío de prueba y
  filtrado del historial.
- **Spec(s) del módulo:** `api/tests/e2e/notifications.spec.ts`,
  `web/tests/e2e/notifications.spec.ts` (una prueba por regla numerada de §4).

## 11. Criterios de aceptación

- [ ] Migración y modelo Prisma (`NotificationTemplate`, `Notification`,
      `NotificationPreference`).
- [ ] Módulo API (routes/controller/service/dto/entity + `providers/`) con
      permisos y bitácora.
- [ ] Worker de drenado con reintentos y backoff operativo.
- [ ] Interfaz `NotificationProvider` con al menos un proveedor de correo y *fake*
      para pruebas.
- [ ] Pantallas web con UI kit (plantillas, historial, preferencias).
- [ ] Specs pasando (solo los del módulo).
- [ ] Este README completo.

## 12. Decisiones abiertas

- Proveedor definitivo de SMS y WhatsApp (Twilio vs. alternativas) y su contrato.
- Estrategia de plantillas pre-aprobadas de WhatsApp (categorías y *opt-in*).
- Retención del historial de `Notification` y política de purga de `payload`.
- ¿Se soporta canal *push* de escritorio/Electron (`window.desktop`)?
- Configuración de Ably (canal por usuario vs. por recurso) y su costo.
- Umbral y algoritmia exacta del backoff (base, jitter, tope).
- Enlazar en [`DECISIONES.md`](../../../DECISIONES.md) al cerrarse.

## 13. Referencias

- Plantilla: [`plantilla-modulo.md`](../../plantillas/plantilla-modulo.md).
- Convenciones: [`convenciones.md`](../../guia/convenciones.md),
  [`api/convenciones.md`](../../api/convenciones.md).
- Arquitectura: [`api-modular.md`](../../arquitectura/api-modular.md),
  [`web-fsd.md`](../../arquitectura/web-fsd.md),
  [`axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).
- Errores: [`errores.md`](../../api/errores.md).
- Seguridad: [`roles-permisos.md`](../../seguridad/roles-permisos.md),
  [`bitacora.md`](../../seguridad/bitacora.md).
- Pruebas: [`estrategia-pruebas.md`](../../pruebas/estrategia-pruebas.md).
- Datos: [`diccionario-datos.md`](../../modelo-datos/diccionario-datos.md).
- Módulos: [`M09`](../M09-colegiaturas-pagos/README.md),
  [`M15`](../M15-examenes-configuracion/README.md),
  [`M18`](../M18-asistencia-justificantes/README.md).
