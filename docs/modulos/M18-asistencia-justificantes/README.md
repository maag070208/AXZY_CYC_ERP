# M18 — Asistencia y justificantes

| Campo | Valor |
|---|---|
| **Código** | M18 |
| **Versión** | 0.2 |
| **Estado** | Terminado (F6) |
| **Fase** | Extras |
| **Depende de** | M07 (Cursos, grupos e inscripciones), M03 (Alumnos), M11 (Administración y catálogos / `settings`), M02 (Autenticación y RBAC) |
| **Habilita a** | M10/M21 (reportes y tablero), M19 (Notificaciones) |
| **Permisos** | `attendance.view` (OWN/AREA), `attendance.manage` (AREA), `attendance.justify` |

## Implementación (F6, 2026-10-09)

**Estado: terminado.** Código en `api/src/modules/attendance` (`attendance-rules.ts`, `attendance.service.ts`, `justification.service.ts`) y `web/src/entities/attendance` + `web/src/features/attendance/{sessions-panel,justifications-inbox,student-attendance}`; pestañas «Asistencia» de `/groups/:id` y de la ficha del alumno, y `/attendance` (bandeja de justificantes).

| Método | Ruta | Permiso | Nota |
|---|---|---|---|
| GET | `/api/v1/groups/:groupId/sessions` | `attendance.view` (AREA/ALL) | Sesiones del grupo (vigentes y anuladas) |
| POST | `/api/v1/groups/:groupId/sessions` | `attendance.manage` | Única por grupo/fecha/hora; no admite fecha futura |
| GET | `/api/v1/groups/:groupId/attendance-summary` | `attendance.view` (OWN = su renglón) | % por alumno, umbral y alerta |
| GET | `/api/v1/attendance-sessions/:id` | `attendance.view` (AREA/ALL) | Pase de lista de la sesión |
| PUT | `/api/v1/attendance-sessions/:id/attendance` | `attendance.manage` | Guarda el pase (upsert); bloquea renglones con justificante |
| DELETE | `/api/v1/attendance-sessions/:id` | `attendance.manage` | Anulación lógica con motivo |
| GET | `/api/v1/students/:studentId/attendance` | `attendance.view` | Asistencia del alumno por grupo con detalle |
| POST | `/api/v1/justifications` | `attendance.justify` | Solicita justificante (multipart; archivo PDF/JPG/PNG ≤ 5 MB opcional) |
| POST | `/api/v1/justifications/query` | `attendance.justify` (OWN = los propios) | Bandeja de justificantes |
| PATCH | `/api/v1/justifications/:id/resolve` | `attendance.justify` (AREA/ALL) | Aprueba (→ JUSTIFICADA) o rechaza |
| GET | `/api/v1/justifications/:id/file` | `attendance.view` | Descarga autorizada del comprobante |

Decisiones (sección 12):
- Sesión única vigente por grupo/fecha/hora con anulación lógica; el pase guarda a todos los inscritos y respeta los justificantes vigentes. Solo la falta resta en el porcentaje (retardo y justificada no penalizan). Ver [D-042](../../../DECISIONES.md).
- La alerta cruza `ATTENDANCE_THRESHOLD` (M11; 80 % por defecto) una sola vez y se limpia al recuperarlo, disparando `ALERTA_INASISTENCIA` por M19. Resuelve [A-006](../../../DECISIONES.md).
- Un justificante por falta con archivo validado por contenido (S3/disco, D-023); aprobar cambia la falta a JUSTIFICADA, rechazar permite nueva solicitud. Ver [D-043](../../../DECISIONES.md).
- Reporte `attendance-by-group` en M10 y bitácora de sesión creada/anulada y asistencia registrada.

## 1. Objetivo

Registrar el pase de lista por sesión de grupo, calcular el porcentaje de
asistencia por alumno con alerta configurable por umbral y gestionar justificantes
que convierten una falta en falta justificada.

## 2. Alcance

**Incluye**
- Creación de sesiones de asistencia por grupo (`fecha`, `hora`).
- Pase de lista (`presente` / `falta` / `retardo` / `justificada`) por inscripción.
- Cálculo del porcentaje de asistencia por alumno y **alerta por umbral**.
- Solicitud de justificantes con archivo (S3) y su resolución (aprobar/rechazar).
- Reporte de asistencia filtrable y exportable.

**No incluye (en este módulo)**
- Grupos, horarios e inscripciones (M07).
- Altas de alumnos y tutores (M03).
- Envío de alertas por correo/SMS/WhatsApp (M19); M18 solo dispara el evento.
- Definición del umbral (M11 `settings`); M18 lo consume.
- Cálculo de calificación final (M08).

## 3. Modelo de datos (Prisma)

Convención: `id uuid`, `createdAt`/`updatedAt`, tablas `snake_case` plural y enums
`UPPER_SNAKE`. Borrado lógico por dominio: las sesiones usan `deletedAt` para
anular un pase equivocado (se conserva historial); una falta justificada se
resuelve por `status`, no se borra.

```prisma
enum AttendanceStatus {
  PRESENTE
  FALTA
  RETARDO
  JUSTIFICADA
}

enum JustificationStatus {
  PENDIENTE
  APROBADA
  RECHAZADA
}

model AttendanceSession {
  id        String    @id @default(uuid())
  groupId   String
  fecha     DateTime  @db.Date
  hora      String?   @db.Time
  createdBy String
  deletedAt DateTime? // anulación lógica de la sesión
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  group     Group      @relation(fields: [groupId], references: [id])
  createdByUser User   @relation(fields: [createdBy], references: [id])
  attendances Attendance[]

  @@unique([groupId, fecha, hora])
  @@index([groupId, fecha])
  @@map("attendance_sessions")
}

model Attendance {
  id           String           @id @default(uuid())
  sessionId    String
  enrollmentId String
  status       AttendanceStatus
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  session       AttendanceSession @relation(fields: [sessionId], references: [id])
  enrollment    Enrollment        @relation(fields: [enrollmentId], references: [id])
  justification Justification?

  @@unique([sessionId, enrollmentId])
  @@index([enrollmentId, status])
  @@map("attendance")
}

model Justification {
  id           String              @id @default(uuid())
  attendanceId String              @unique
  motivo       String
  archivo      String?             // ruta privada en S3
  status       JustificationStatus @default(PENDIENTE)
  resueltoPor  String?
  resolvedAt   DateTime?
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  attendance     Attendance @relation(fields: [attendanceId], references: [id])
  resolvedByUser User?      @relation(fields: [resueltoPor], references: [id])

  @@index([status])
  @@map("justifications")
}
```

**Índices:**
- `attendance_sessions`: único `(groupId, fecha, hora)` (según el diccionario);
  como `hora` admite `NULL`, el único parcial sobre sesiones vigentes
  (`deletedAt IS NULL`) se agrega en migración SQL.
- `attendance`: único `(sessionId, enrollmentId)`; `(enrollmentId, status)` para
  calcular porcentajes por alumno.
- `justifications`: `attendanceId` único (un justificante por falta); `status`
  para la bandeja de pendientes.

**Relaciones:**
- `AttendanceSession.group → Group` (M07) y `createdBy → User` (M02).
- `Attendance.enrollment → Enrollment` (M07) — la falta pertenece a la
  inscripción (alumno+grupo), no directamente al alumno.
- `Justification.attendance → Attendance` (1:1) y `resueltoPor → User`.

> Detalle en
> [`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md#m18--asistencia-y-justificantes).

## 4. Reglas de negocio

Numeradas y verificables (cada una mapea a una prueba de §10):

1. **Una sesión por grupo/fecha/hora.** Crear una sesión duplicada (vigente) →
   409 `DUPLICATE_RECORD`.
2. **Pase de lista completo.** El pase escribe un `Attendance` por cada
   `enrollment` **activo** del grupo; el `status` ∈ `{PRESENTE, FALTA, RETARDO,
   JUSTIFICADA}`. Reenviar el pase hace `upsert` por
   `(sessionId, enrollmentId)`.
3. **Pertenencia.** Solo se registra asistencia de `enrollments` del grupo de la
   sesión; un `enrollmentId` ajeno → 400 `INVALID_REFERENCE`.
4. **Porcentaje de asistencia.** Por alumno/periodo:
   `% = (PRESENTE + RETARDO + JUSTIFICADA) / total de sesiones del grupo`.
   `FALTA` es la única que resta (`RETARDO` cuenta como asistencia; `JUSTIFICADA`
   no penaliza).
5. **Alerta por umbral.** Si el `%` cae por debajo del umbral configurable en
   `settings` (por defecto 80 %), se emite el evento de alerta (consumido por
   M19) y el alumno aparece marcado en el reporte. El umbral es configurable, no
   hardcodeado.
6. **Justificante aprobado.** `PATCH /justifications/:id/resolve` con
   `APROBADA` cambia el `status` del `Attendance` de `FALTA` a `JUSTIFICADA` y
   registra `resueltoPor`/`resolvedAt`. `RECHAZADA` deja la falta como `FALTA`.
7. **Archivo del justificante.** Solo PDF/JPG/PNG y ≤ 5 MB; el archivo se guarda
   en S3 (ruta privada con nombre aleatorio) y solo se persiste la ruta.
   Sin S3 configurado → 503 `STORAGE_NOT_CONFIGURED`.
8. **Aislamiento por grupo.** El profesor solo opera sesiones de sus grupos
   (`AREA`); el alumno solo lee sus propias faltas (`OWN`).
9. **No borrado físico.** Anular una sesión usa `deletedAt`; la asistencia y los
   justificantes se conservan por auditoría.

## 5. API

Módulo bajo `api/src/modules/attendance/` (`routes/ · controllers/ · services/ ·
models/{dto,entity}/`). El listado denso de asistencia usa el contrato
server-side.

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/v1/groups/:id/sessions` | Sesiones del grupo | `attendance.view` (AREA/OWN) |
| POST | `/api/v1/groups/:id/sessions` | Crea una sesión de asistencia | `attendance.manage` (AREA) |
| PUT | `/api/v1/sessions/:id/attendance` | Pase de lista (upsert por inscripción) | `attendance.manage` (AREA) |
| POST | `/api/v1/attendance/query` | Listado server-side de asistencia | `attendance.view` |
| POST | `/api/v1/justifications` | Solicita un justificante (con archivo) | `attendance.justify` (OWN) |
| PATCH | `/api/v1/justifications/:id/resolve` | Aprueba/rechaza un justificante | `attendance.justify` (AREA) |
| GET | `/api/v1/reports/attendance` | Reporte de % por alumno/grupo | `attendance.view` / `reports.view` |

**Crear sesión** `POST /api/v1/groups/:id/sessions`:

```json
{ "fecha": "2026-06-01", "hora": "08:00" }
```

**Pase de lista** `PUT /api/v1/sessions/:id/attendance`:

```json
{ "items": [
  { "enrollmentId": "…", "status": "PRESENTE" },
  { "enrollmentId": "…", "status": "FALTA" }
] }
```

Responde `200` con `{ "sessionId": "…", "saved": 2 }`; `upsert` por
`(sessionId, enrollmentId)`.

**Justificante** `POST /api/v1/justifications` (`multipart/form-data`):
campos `attendanceId`, `motivo`, `archivo` (opcional). El archivo va a S3 y se
guarda la ruta.

**Resolución** `PATCH /api/v1/justifications/:id/resolve`:

```json
{ "status": "APROBADA", "nota": "Comprobante válido" }
```

Al aprobar, la `Attendance` asociada pasa a `JUSTIFICADA` (regla 6).

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `attendanceApi` | `entities/attendance` | API + tipos `AttendanceSession`/`Attendance` |
| `justificationApi` | `entities/justification` | API + tipos `Justification` |
| `take-roll` | `features/attendance/take-roll` | Pase de lista con `ITDataTable`/`ITFormBuilder` |
| `upload-justification` | `features/justification/upload-justification` | Alta de justificante con `ITDropfile` |
| `resolve-justification` | `features/justification/resolve-justification` | Aprobar/rechazar con `ITDialog` |
| `AttendancePage` | `pages/attendance` | Listados de sesiones y asistencia |
| `SessionRollCallPage` | `pages/attendance` | Pase de lista de una sesión |
| `JustificationsPage` | `pages/attendance` | Bandeja de justificantes |

Pase de lista con `ITPage` + `ITDataTable` (una fila por inscripción, columnas con
filtro/orden) y KPIs de % con `KpiTile`; la carga del justificante usa
`ITDropfile` (archivo a S3) y `ITDialog`/`ITConfirmDialog` para la resolución.
i18n con namespace **`attendance`**. La descarga del archivo usa URL firmada, no
expone la ruta privada.

## 7. Permisos y alcance

Ver [`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md).

| Permiso | Roles | Alcance | Notas |
|---|---|---|---|
| `attendance.view` | `ADMIN`/`CONTROL_ESCOLAR` (`ALL`), `PROFESOR` (`AREA`), `ALUMNO` (`OWN`) | por rol | El alumno solo ve sus faltas. |
| `attendance.manage` | `ADMIN`/`CONTROL_ESCOLAR` (`ALL`), `PROFESOR` (`AREA`) | por rol | Crear sesiones y pasar lista en sus grupos. |
| `attendance.justify` | `ALUMNO` (`OWN`), `PROFESOR` (`AREA`) | por rol | El alumno solicita; el profesor/control resuelve. |

Scoping en el servicio (`withinScope` por `group_id` del profesor, o por
`studentId` del alumno) aplicado en `AND`; fuera de alcance → 403
`INSUFFICIENT_PERMISSIONS` o lista filtrada. Una política ABAC puede limitar la
aprobación (p. ej. el profesor no aprueba justificantes de su propio hijo).

## 8. Validaciones

Zod en `models/dto`; `ZodError` → 400 `VALIDATION_ERROR`. Validación de archivo:
`FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`.

| DTO | Campos | Reglas / código |
|---|---|---|
| `CreateSessionSchema` | `fecha` (`YYYY-MM-DD`), `hora` (`HH:mm`?) | `REQUIRED_FIELD`, `INVALID_FORMAT` |
| `SaveAttendanceSchema` | `items[] { enrollmentId (uuid), status }` | `1..N`; enum `AttendanceStatus` → `INVALID_FORMAT` |
| `CreateJustificationSchema` | `attendanceId` (uuid), `motivo` (≥ 5), `archivo`? | `REQUIRED_FIELD`; archivo PDF/JPG/PNG ≤ 5 MB |
| `ResolveJustificationSchema` | `status` (`APROBADA`/`RECHAZADA`), `nota`? | enum → `INVALID_FORMAT` |
| `AttendanceQuerySchema` | `page`, `limit`, `filters`, `sort` | tope `limit` 200; `INVALID_FILTER` / `INVALID_RANGE` |

## 9. Bitácora

Vía `AuditPort` ([`../../seguridad/bitacora.md`](../../seguridad/bitacora.md)) con
`previousState`/`newState`.

| Acción | `entityType` | `previousState` / `newState` |
|---|---|---|
| `ATTENDANCE_SESSION_CREATED` | `AttendanceSession` | `null` → `{ groupId, fecha, hora }` |
| `ATTENDANCE_RECORDED` | `Attendance` | `{ status: null }` → `{ status }` (o previo → nuevo) |
| `JUSTIFICATION_CREATED` | `Justification` | `null` → `{ attendanceId, status: PENDIENTE }` |
| `JUSTIFICATION_APPROVED` | `Justification` + `Attendance` | `PENDIENTE` → `APROBADA`; `FALTA` → `JUSTIFICADA` |
| `JUSTIFICATION_REJECTED` | `Justification` | `PENDIENTE` → `RECHAZADA` |
| `ATTENDANCE_ALERT_TRIGGERED` | `Enrollment` | `{ porcentaje, umbral }` (al cruzar el umbral) |

Nunca se registra el contenido del archivo, solo su ruta y metadatos.

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): cálculo de porcentaje (regla 4), disparo de
  umbral (regla 5), transición de falta a justificada (regla 6) y validación de
  archivo (regla 7).
- **Contrato** (`api/tests/e2e`): sesiones/pase de lista/justificantes con
  `ctxProfesor` y `ctxAlumno`; 401/403 fuera de alcance, 409 `DUPLICATE_RECORD`,
  400 `INVALID_REFERENCE`, archivo inválido (reglas 1–7).
- **Navegador** (`web/tests/e2e`): pase de lista con `ITDataTable`, carga de
  justificante y resolución con `ITDialog`; verifica el cálculo del % en pantalla.
- **Spec del módulo:** `api/tests/e2e/m18-asistencia-justificantes.spec.ts` y
  `web/tests/e2e/m18-asistencia-justificantes.spec.ts`.
- **Una prueba por regla numerada** de §4 y verificación de bitácora.
- Cobertura objetivo ≥ 70 % en los servicios del módulo.

## 11. Criterios de aceptación

- [ ] Migración y modelos Prisma (`AttendanceSession`, `Attendance`, `Justification`, enums).
- [ ] Módulo API (`routes/controller/service/dto/entity`) con permisos, alcance y bitácora.
- [ ] Pase de lista, cálculo de % y alerta por umbral.
- [ ] Justificantes con archivo a S3 y resolución (aprobar/rechazar).
- [ ] Pantallas web con UI kit (`ITPage`, `ITDataTable`, `ITDropfile`, `ITDialog`, `KpiTile`).
- [ ] Specs del módulo pasando (solo los del módulo).
- [ ] Este README completo.

## 12. Decisiones abiertas

- **Fórmula del porcentaje:** confirmar si `RETARDO` cuenta como asistencia
  completa o ponderada, y si `JUSTIFICADA` se excluye del denominador.
- **Umbral:** valor por defecto (80 %) y si puede variar por grupo/periodo, no
  solo global en `settings`.
- **Multiple justificantes:** ¿restringir a uno vigente por falta (como el índice
  único) o permitir historial con `deletedAt`? Ver
  [`../../../DECISIONES.md`](../../../DECISIONES.md).
- **Ventana de solicitud:** ¿límite de días para subir un justificante tras la falta?
- **Retardos:** ¿afectan la alerta acumulada (p. ej. N retardos = 1 falta)?

## 13. Referencias

- Plantilla: [`../../plantillas/plantilla-modulo.md`](../../plantillas/plantilla-modulo.md).
- Convenciones: [`../../guia/convenciones.md`](../../guia/convenciones.md).
- API modular: [`../../arquitectura/api-modular.md`](../../arquitectura/api-modular.md);
  web FSD: [`../../arquitectura/web-fsd.md`](../../arquitectura/web-fsd.md);
  UI kit: [`../../arquitectura/axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).
- API: [`../../api/convenciones.md`](../../api/convenciones.md),
  [`../../api/errores.md`](../../api/errores.md).
- Permisos/bitácora: [`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md),
  [`../../seguridad/bitacora.md`](../../seguridad/bitacora.md).
- Datos: [`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md).
- Pruebas: [`../../pruebas/estrategia-pruebas.md`](../../pruebas/estrategia-pruebas.md).
- Módulos relacionados: [M07](../M07-cursos-grupos-inscripciones/README.md),
  [M11](../M11-administracion-catalogos/README.md),
  [M19](../M19-notificaciones/README.md), [M10](../M10-reportes-tablero/README.md).
