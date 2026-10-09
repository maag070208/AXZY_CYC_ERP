# Bitácora (AuditLog)

Módulo `audit` de la API (estándar PTNV). Registra las operaciones de escritura y
los accesos denegados, con estado anterior y posterior, atable a la transacción
del cambio (ver [D-016](../../DECISIONES.md)).

## 1. Tabla `audit_logs`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `action` | varchar | `STUDENT_CREATED`, `PAYMENT_REGISTERED`, `ACCESS_DENIED`, … |
| `entityType` | varchar | `Student`, `Payment`, `Permission`, … |
| `entityId` | varchar | Id afectado (o clave del permiso) |
| `userId` | uuid? | Autor (nulo para el sistema/worker) |
| `userName` | varchar? | Snapshot del nombre del autor |
| `previousState` | jsonb? | Estado previo |
| `newState` | jsonb? | Estado posterior |
| `metadata` | jsonb? | Contexto adicional (ruta, método, motivo…) |
| `createdAt` | timestamptz | Fecha/hora |

Índices por `action`, `(entityType, entityId)`, `userId`, `createdAt`.

## 2. Cómo se escribe (AuditPort)

La auditoría se inyecta por **DIP** a cada módulo:
```ts
await this.audit?.({
  action: "STUDENT_CREATED",
  entityType: "Student",
  entityId: id,
  userId: actorId,
  previousState,
  newState,
  metadata,
}, tx); // tx opcional: ata el log a la transacción del cambio
```
Si el cambio hace rollback, el log también (misma transacción). El error de un
acceso denegado se registra fire-and-forget.

## 3. Qué se registra

- **Altas, ediciones, bajas y cancelaciones** de datos de negocio.
- **Decisiones de acceso:** `ACCESS_DENIED` en cada 403 de `requiresPermission`.
- **Control de acceso:** `ROLE_CREATED/UPDATED/DELETED`, `ROLE_PERMISSIONS_UPDATED`,
  `PERMISSION_CREATED/UPDATED`, `POLICY_CREATED/UPDATED/DELETED`,
  `USER_ROLE_ADDED/REMOVED`, `PERMISSION_EXCEPTION_SET/REMOVED`.
- **Autenticación:** login/bloqueos/logout.

## 4. Qué NO se registra

- Contraseñas, hashes, tokens de sesión o de recuperación.
- Binarios de archivos (solo metadatos/rutas).
- Secretos de configuración (se enmascaran en `previousState`/`newState`).

## 5. Casos por módulo (CYC)

| Módulo | Acciones representativas |
|---|---|
| M02 | login, bloqueo, cambios de usuario/rol/permisos/políticas |
| M03/M05 | `STUDENT_CREATED`, `STUDENT_UPDATED`, `STUDENT_DEACTIVATED`, `STUDENT_REACTIVATED` |
| M06 | `DOCUMENT_UPLOADED`, `DOCUMENT_VALIDATED`, `DOCUMENT_REJECTED`, `DOCUMENT_DELETED` |
| M07 | `ENROLLMENT_CREATED/DELETED/GROUP_CHANGED` |
| M08 | toda modificación de calificación con `previousState`/`newState` |
| M09 | `CHARGE_CREATED/GENERATED`, `PAYMENT_REGISTERED/CANCELLED` (nunca borrado) |
| M15/M16 | `EXAM_PUBLISHED`, `ATTEMPT_SUBMITTED`, revisión manual |
| M18 | `ATTENDANCE_SESSION_CREATED`, `ATTENDANCE_RECORDED`, `JUSTIFICATION_*`, `ATTENDANCE_ALERT_TRIGGERED` |
| M19 | `NOTIFICATION_TEMPLATE_*`, envíos manuales y bajas (opt-out) |
| M20 | `MIGRATION_BATCH_PREVIEWED`, `MIGRATION_BATCH_EXECUTED` (modo, lote, totales) |
| M22 | `PROGRAM_*`, `PROGRAM_SUBJECTS_UPDATED`, `STUDENT_PLAN_CREATED`, `STUDENT_PLAN_CANCELLED` |

## 6. Consulta y retención

- `POST /api/v1/audit/query` (tabla server-side) y `GET /api/v1/audit/:id`
  (permiso `audit.view`) con filtros por `action`,
  `entityType`, `entityId`, `userId`, rango de fechas; paginado server-side.
- La bitácora es inmutable (no se edita ni borra) y va incluida en los
  respaldos. La política de retención está por definir (M12).
- Los registros anteriores a [D-049](../../DECISIONES.md) conservan los nombres de
  campo en español en `previousState`/`newState` (son historial; no se reescriben).
