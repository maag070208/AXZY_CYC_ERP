# M19 — Notificaciones (correo, SMS y WhatsApp)

| Campo | Valor |
|---|---|
| **Código** | M19 |
| **Versión** | 0.2 |
| **Estado** | Terminado (F6) |
| **Fase** | Extras |
| **Depende de** | M02 (auth/roles), M09 (cargos y pagos), M11 (configuración y catálogos), M15 (exámenes en línea), M18 (asistencia) |
| **Habilita a** | M09/M10/M21 (alertas y avisos), portal del alumno/tutor, recordatorios operativos |
| **Permisos** | `notifications.view`, `notifications.manage` (con alcance) |

## Implementación (F6, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/notifications` (`notification-rules.ts`, `notification.service.ts`, `providers/`) y `web/src/entities/notification` + `web/src/features/notification/{inbox,templates,outbox,preferences}`; `/notifications`.

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| POST | `/api/v1/notification-templates/query` | `notifications.view` | Tabla de plantillas |
| GET | `/api/v1/notification-templates/:id` | `notifications.view` | Detalle |
| POST | `/api/v1/notification-templates` | `notifications.manage` | Alta (clave+canal únicos) |
| PATCH | `/api/v1/notification-templates/:id` | `notifications.manage` | Edición |
| DELETE | `/api/v1/notification-templates/:id` | `notifications.manage` | Baja lógica |
| POST | `/api/v1/notification-templates/:id/reactivate` | `notifications.manage` | Reactiva |
| POST | `/api/v1/notifications/query` | `notifications.view` | Historial del outbox |
| POST | `/api/v1/notifications/send` | `notifications.manage` | Encola un aviso (`Idempotency-Key` opcional) |
| POST | `/api/v1/notifications/:id/retry` | `notifications.manage` | Reencola fallidos/omitidos |
| POST | `/api/v1/notifications/drain` | `notifications.manage` | Procesa la cola ahora |
| GET | `/api/v1/notifications/mine` | cualquier sesión | Bandeja interna propia con no leídas |
| POST | `/api/v1/notifications/mine/read` | cualquier sesión | Marca leídas (solo las propias) |
| POST | `/api/v1/notification-preferences/query` | `notifications.view` | Bajas por destinatario y canal |
| PUT | `/api/v1/notification-preferences` | `notifications.manage` | Da de baja o reincorpora |

Decisiones (sección 12):
- Plantillas por clave+canal con variables `{{var}}`; el outbox reclama con `FOR UPDATE SKIP LOCKED` y aplica backoff exponencial hasta `maxAttempts`. Ver [D-044](../../../DECISIONES.md).
- Correo por Resend/SMTP o simulado; SMS/WhatsApp simulados hasta definir proveedor ([A-001](../../../DECISIONES.md)). Canal `IN_APP` con bandeja propia y aviso en tiempo real best-effort (Ably).
- El puerto `Notifier` dispara `ABSENCE_ALERT`, `JUSTIFICATION_RESOLVED`, `EXAM_PUBLISHED`, `PAYMENT_RECEIVED` y `PAYMENT_DUE_SOON` (barrido horario idempotente).
- Las bajas (opt-out) no aplican a los avisos obligatorios.

> **Cómo leer este documento:** la sección «Implementación» de arriba describe lo
> construido y **manda** sobre el diseño original de las secciones siguientes.
> Los nombres de campos, enums, rutas y códigos ya están en inglés
> ([D-046](../../../DECISIONES.md), [D-049](../../../DECISIONES.md)).

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
  /// Bandeja dentro de la app (campana); se entrega al encolar.
  IN_APP
}

enum NotificationStatus {
  QUEUED
  SENT
  FAILED
  /// No se envió por baja del destinatario (opt-out).
  SKIPPED
}

model NotificationTemplate {
  id        String              @id @default(uuid())
  /// Evento que la dispara (p. ej. `ALERTA_INASISTENCIA`); una por canal.
  code      String              @db.VarChar(60)
  name      String              @db.VarChar(150)
  channel   NotificationChannel
  subject   String?             @db.VarChar(200)
  body      String
  /// Variables declaradas que el payload debe cubrir (`["nombre", "monto"]`).
  variables Json                @default("[]")
  /// Transaccional obligatorio: ignora la baja (opt-out).
  required  Boolean             @default(false)
  active    Boolean             @default(true)
  createdAt DateTime            @default(now()) @map("created_at")
  updatedAt DateTime            @updatedAt @map("updated_at")

  notifications Notification[]

  @@unique([code, channel])
  @@index([channel, active])
  @@map("notification_templates")
}

model Notification {
  id                String              @id @default(uuid())
  /// Correo, teléfono o `user:<id>` para la bandeja interna.
  recipient         String              @db.VarChar(200)
  channel           NotificationChannel
  templateId        String?             @map("template_id")
  /// Cuenta destinataria (bandeja y tiempo real), si se conoce.
  userId            String?             @map("user_id")
  /// Evento o módulo de origen (`ALERTA_INASISTENCIA`, `MANUAL`…).
  origin            String              @default("MANUAL") @db.VarChar(60)
  payload           Json                @default("{}")
  subject           String?             @db.VarChar(200)
  body              String
  status            NotificationStatus  @default(QUEUED)
  attempts          Int                 @default(0)
  maxAttempts       Int                 @default(5) @map("max_attempts")
  nextRetryAt       DateTime            @default(now()) @map("next_retry_at")
  /// Reclamo del worker (evita que dos instancias envíen lo mismo).
  lockedUntil       DateTime?           @map("locked_until")
  error             String?             @db.VarChar(500)
  providerMessageId String?             @map("provider_message_id")
  /// Enviado en modo simulado (sin proveedor real configurado).
  dryRun            Boolean             @default(false) @map("dry_run")
  idempotencyKey    String?             @unique @map("idempotency_key") @db.VarChar(200)
  readAt            DateTime?           @map("read_at")
  sentAt            DateTime?           @map("sent_at")
  createdBy         String?             @map("created_by")
  createdAt         DateTime            @default(now()) @map("created_at")
  updatedAt         DateTime            @updatedAt @map("updated_at")

  template NotificationTemplate? @relation(fields: [templateId], references: [id])

  @@index([status, nextRetryAt])
  @@index([recipient])
  @@index([userId, channel, createdAt])
  @@index([templateId])
  @@map("notifications")
}

model NotificationPreference {
  id        String              @id @default(uuid())
  recipient String              @db.VarChar(200)
  channel   NotificationChannel
  optOut    Boolean             @default(false) @map("opt_out")
  reason    String?             @db.VarChar(300)
  updatedBy String?             @map("updated_by")
  createdAt DateTime            @default(now()) @map("created_at")
  updatedAt DateTime            @updatedAt @map("updated_at")

  @@unique([recipient, channel])
  @@map("notification_preferences")
}
```

**Índices:** `notifications(status, nextRetryAt)` para el barrido del worker;
`notifications(recipient)` e `(templateId)` para consulta e historial;
`notification_templates(channel, active)`; `notification_preferences` único por
`(recipient, channel)`.
**Relaciones:** `Notification.templateId → NotificationTemplate.id` (opcional, se
puede enviar sin plantilla como mensaje libre). `NotificationPreference` no tiene
FK a alumnos/usuarios: la clave es el `recipient` (desacopla el módulo).

> Nota de diccionario: [`diccionario-datos.md`](../../modelo-datos/diccionario-datos.md)
> describe `channel` y `status` como `varchar` con literales en minúsculas
> (`EMAIL`, `QUEUED`…). El estándar Prisma de la casa los modela como enums
> `UPPER_SNAKE`; el mapeo a la representación en minúsculas es 1:1 en los *mappers*.

## 4. Reglas de negocio

1. **Envío asíncrono (outbox):** encolar un aviso solo persiste un `Notification`
   en `QUEUED` dentro de la misma transacción del disparador; la API nunca envía
   en el hilo del request.
2. **Drenado con reintentos:** un worker reclama los `QUEUED` con `nextRetryAt`
   vencido y aplica **backoff exponencial**; al superar `maxAttempts` marca
   `FAILED` y guarda `error`. No hay reintento automático de `FAILED` salvo
   reencolado explícito.
3. **Proveedores intercambiables:** todos implementan la interfaz
   `NotificationProvider` (`send(Notification): Promise<ProviderResult>`); el
   proveedor por canal se resuelve por configuración (M11 `sys_config`).
4. **Render de plantillas:** `body`/`subject` admiten variables `{{code}}`; el
   envío valida que el `payload` cubra las variables declaradas; si falta alguna,
   no se encola y responde `VALIDATION_ERROR`.
5. **Preferencias y baja:** si el destinatario tiene `optOut` para el canal, no se
   envía (queda `FAILED`/omitido con motivo `OPT_OUT`). Los avisos marcados como
   transaccionales obligatorios (p. ej. estado de cuenta) están exentos.
6. **Disparadores desacoplados:** M09 (pago próximo a vencer, adeudo vencido), M15
   (examen publicado), M18 (inasistencias) y avisos generales invocan el
   `NotificationPort`; nunca importan modelos de M19 directamente.
7. **Idempotencia:** `POST /notifications/send` acepta `Idempotency-Key`; repetir
   la solicitud devuelve el `Notification` previamente creado sin reenviar.
8. **Tiempo real:** cada transición de estado (`QUEUED → SENT/FAILED`) se
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
| POST | `/api/v1/notifications/:id/retry` | Reencola un `FAILED` | `notifications.manage` |

> La especificación original mencionaba `GET /notifications/query`; se unifica a
> **`POST …/query`** para respetar el contrato de tablas server-side
> ([`api/convenciones.md`](../../api/convenciones.md) §3).

**`POST /notifications/send`** (cabecera `Idempotency-Key` opcional):

```jsonc
// Request
{
  "channel": "EMAIL",
  "recipient": "tutor@example.com",
  "templateCode": "PAYMENT_DUE_SOON",   // o "body" libre si no hay plantilla
  "payload": { "name": "Ana López", "amount": "1500.00", "date": "2026-10-15" }
}
// Response 201
{
  "id": "…", "channel": "EMAIL", "status": "QUEUED",
  "subject": "Pago por vencer", "body": "Hola Ana López, tu pago de $1500.00 dueDate el 2026-10-15.",
  "recipient": "tutor@example.com", "sentAt": null
}
```

**`POST /notifications/query`** — contrato ITDataTable estándar
(`{ page, limit, filters, sort }`; respuesta `{ data, total, page, pageIndex,
totalPages, totalCount, limit, hasPreviousPage, hasNextPage }`), con filtros por
`channel`, `status`, `recipient` y rango de `createdAt`/`sentAt`.

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

- `channel` ∈ `{EMAIL, SMS, WHATSAPP}` → `INVALID_FORMAT` si no.
- `recipient` obligatorio; correo válido para `EMAIL`, teléfono válido para
  `SMS`/`WHATSAPP` (`REQUIRED_FIELD` / `INVALID_EMAIL` / `INVALID_FORMAT`).
- `body` no vacío (`REQUIRED_FIELD`); `subject` requerido solo si `channel = EMAIL`.
- Sistema de variables: `{{code}}` debe existir en `payload` (`VALIDATION_ERROR`
  con `details` por variable faltante).
- `code` de plantilla única → `DUPLICATE_RECORD`; `Idempotency-Key` inválida →
  `INVALID_IDEMPOTENCY_KEY`; clave reusada por otro usuario → `IDEMPOTENCY_KEY_REUSED`.
- Fallo de proveedor → el `Notification` queda `FAILED` con `error`; nunca 500 al
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
  variable → error); cálculo de backoff y transición a `FAILED`; evaluación de
  `optOut`; mapeo de enums; resolución de proveedor por canal.
- **Contrato** (`api/tests/e2e`): CRUD de plantillas; `POST /notifications/send`
  con `Idempotency-Key` (repetir no duplica); `POST /notifications/query` contrato
  de tabla; permisos 401/403; bitácora de plantillas; con proveedor *fake*.
- **Navegador** (`web/tests/e2e`): alta/edición de plantilla, envío de prueba y
  filtrado del historial.
- **Spec(s) del módulo:** `api/tests/e2e/notifications.spec.ts`,
  `web/tests/e2e/notifications.spec.ts` (una prueba por regla numerada de §4).

## 11. Criterios de aceptación

- [x] Migración y modelo Prisma (`NotificationTemplate`, `Notification`,
      `NotificationPreference`).
- [x] Módulo API (routes/controller/service/dto/entity + `providers/`) con
      permisos y bitácora.
- [x] Worker de drenado con reintentos y backoff operativo.
- [x] Interfaz `NotificationProvider` con al menos un proveedor de correo y *fake*
      para pruebas.
- [x] Pantallas web con UI kit (plantillas, historial, preferencias).
- [x] Specs pasando (solo los del módulo).
- [x] Este README completo.

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
