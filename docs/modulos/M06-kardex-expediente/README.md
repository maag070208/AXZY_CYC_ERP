# M06 — Kardex y expediente documental

| Campo | Valor |
|---|---|
| **Código** | M06 |
| **Versión** | 1.0 |
| **Estado** | Terminado (F2, 2026-10-09) |
| **Fase** | Académico (Expediente y academia) |
| **Depende de** | M02 (autenticación, roles y bitácora), M03 (alumnos), M07 (inscripciones), M08 (calificaciones finales), M11 (`document_types`) |
| **Habilita a** | M10/M21 (reportes con estatus documental), M17 (kardex alimentado por exámenes) |
| **Permisos** | `documents.view`, `documents.upload`, `documents.validate`, `documents.delete`, `kardex.view`, `kardex.export` |

## Implementación (F2, 2026-10-09)

**Estado: terminado** (desde F3 el kardex se alimenta de M07/M08). Código en `api/src/modules/documents`, `web/src/features/document/documents-panel` y `web/src/widgets/kardex-pdf`; pestañas «Expediente» y «Kardex» del alumno.

| Método | Ruta | Permiso |
|---|---|---|
| GET · POST | `/api/v1/students/:studentId/documents` | `documents.view` · `documents.upload` |
| GET | `/api/v1/documents/:id/download` | `documents.view` (alcance del alumno) |
| PATCH | `/api/v1/documents/:id/validate` | `documents.validate` |
| DELETE | `/api/v1/documents/:id` | `documents.delete` |
| GET | `/api/v1/students/:studentId/kardex` | `kardex.view` |

Diferencias con el borrador: el tipo de documento es FK al catálogo `document_types` de M11 (no un enum), así «faltantes» sale directo de `required`; el almacenamiento es privado con driver S3 o local ([D-023](../../../DECISIONES.md)); el PDF del kardex se genera en el navegador con `@react-pdf/renderer` (permiso `kardex.export`), sin endpoint `/kardex/pdf` ([D-024](../../../DECISIONES.md)); un alumno en BAJA conserva su expediente en solo lectura (`409 STUDENT_INACTIVE` al escribir).

> **Cómo leer este documento:** la sección «Implementación» de arriba describe lo
> construido y **manda** sobre el diseño original de las secciones siguientes.
> Los nombres de campos, enums, rutas y códigos ya están en inglés
> ([D-046](../../../DECISIONES.md), [D-049](../../../DECISIONES.md)).

## 1. Objetivo

Gestionar el **expediente documental** del alumno (subida, validación y consulta
de documentos) y exponer su **kardex** como vista calculada con el historial de
cursos, calificaciones finales y estatus de acreditación. Sirve a Control Escolar
para operar el expediente y a alumnos/profesores para consultarlo dentro de su
alcance.

## 2. Alcance

**Incluye**
- Subida de documentos por alumno (multipart) con tipo, validación y metadatos.
- Validación/rechazo de documentos y su eliminación lógica.
- Indicador de **documentos faltantes** según los tipos obligatorios de M11.
- Kardex calculado por alumno (no persistido) y su exportación a PDF.
- Descarga autorizada de archivos privados (nunca servidos desde `public`).

**No incluye (en este módulo)**
- La captura de calificaciones (M08) y el cálculo de la calificación final
  (también M08); aquí solo se **leen** para armar el kardex.
- El alta del alumno y sus datos personales (M03).
- La administración de tipos de documento (M11, `document_types`).
- Firma electrónica, sellado de tiempo o validación notarial de documentos.
- Analítica antivirus de terceros (se documenta como decisión abierta).

## 3. Modelo de datos (Prisma)

```prisma
model Document {
  id             String         @id @default(uuid())
  studentId      String         @map("student_id")
  documentTypeId String         @map("document_type_id")
  /// Clave privada del objeto (nombre aleatorio); nunca una URL pública.
  filePath       String         @map("file_path")
  originalName   String         @map("original_name")
  mimeType       String         @map("mime_type")
  size           Int
  status         DocumentStatus @default(PENDING)
  uploadedBy     String         @map("uploaded_by")
  validatedBy    String?        @map("validated_by")
  validatedAt    DateTime?      @map("validated_at")
  notes          String?
  deletedAt      DateTime?      @map("deleted_at")
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  student      Student      @relation(fields: [studentId], references: [id])
  documentType DocumentType @relation(fields: [documentTypeId], references: [id])
  uploader     User         @relation("DocumentUploader", fields: [uploadedBy], references: [id])
  validator    User?        @relation("DocumentValidator", fields: [validatedBy], references: [id], onDelete: SetNull)

  @@index([studentId, documentTypeId, status])
  @@index([status])
  @@map("documents")
}

/// Tipo de documento del expediente (lo consume M06).
model DocumentType {
  id        String   @id @default(uuid())
  name      String   @unique
  required  Boolean  @default(false)
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  documents Document[]

  @@index([active])
  @@map("document_types")
}

enum DocumentStatus {
  PENDING
  VALIDATED
  REJECTED
}
```

- `filePath` guarda la **clave privada** del objeto en S3 con nombre aleatorio
  (uuid + extensión), fuera de cualquier carpeta pública; nunca la URL del archivo.
- `size` en bytes (máx. 5 MB); `mimeType` whitelist.
- Borrado lógico por dominio vía `deletedAt` (ver [D-003](../../../DECISIONES.md)).
- El diccionario describe `type`/`status` como `varchar`, representados aquí como
  enums `UPPER_SNAKE` (ver
  [`diccionario-datos.md`](../../modelo-datos/diccionario-datos.md)).

**Índices:** `(studentId, type, status)` para el expediente; `status` para colas
de validación.
**Relaciones:** `Student 1—N Document`; `User 1—N Document` (validador).

### Kardex (vista calculada, NO persistida)

No existe tabla `kardex`; se compone en el servicio a partir de `enrollments`,
`groups`, `courses`, `assessments` y `grades`.

```ts
interface KardexEntry {
  termId: string;
  termName: string;        // p. ej. "2025-2026"
  courseId: string;
  courseName: string;
  group: string;
  grades: number[];  // parciales/tareas
  weights: number[];   // suma = 100
  finalGrade: number | null;
  status: "PASSED" | "FAILED" | "IN_PROGRESS" | "WITHDRAWN";
}

interface Kardex {
  studentId: string;
  studentNumber: string;         // snapshot para el PDF
  name: string;
  entries: KardexEntry[];
  overallAverage: number | null;
  missingDocuments: string[];
  generatedAt: string;        // ISO 8601 UTC
}
```

## 4. Reglas de negocio

1. **Formato permitido**: solo `application/pdf`, `image/jpeg`, `image/png`; se
   valida por **contenido** (magic bytes), no solo por la extensión ni por el
   `Content-Type` declarado.
2. **Tamaño máximo 5 MB** por archivo; excederlo responde `FILE_TOO_LARGE`; tipo no
   permitido responde `FILE_TYPE_NOT_ALLOWED`.
3. **Almacenamiento privado**: se usa `multer` con `memoryStorage` (el binario nunca
   se escribe en disco), se sube a S3 con nombre **aleatorio** y el objeto queda
   **fuera de `public`**; la BD solo guarda la clave.
4. **Acceso autorizado**: la descarga es por endpoint (`GET /documents/:id/download`)
   que valida permiso y alcance; nunca se expone una URL pública.
5. **Validación**: un documento pasa de `PENDING` a `VALIDATED` o `REJECTED`; al
   validar se registra `validatedBy`; un rechazo puede llevar `notes`.
6. **Reemplazo**: un documento rechazado puede sustituirse subiendo uno nuevo; el
   anterior se marca con borrado lógico, conservando trazabilidad.
7. **Kardex no persistido**: se calcula al vuelo; nunca se almacena ni se edita
   manualmente.
8. **Documentos faltantes**: se comparan los tipos obligatorios activos de M11
   (`document_types.required`) contra los documentos `VALIDATED` del alumno.
9. **Alumno en baja**: conserva su expediente y kardex en modo lectura; no se
   elimina documentación.
10. **Alcance por registro**: el alumno solo ve/descarga sus documentos y su
    kardex (`OWN`); el profesor solo de sus alumnos (`AREA`).

## 5. API

Módulo bajo `api/src/modules/documents/` (documentos y `KardexService`) con `routes/ · controllers/ · services/ ·
models/{dto,entity}/`. Ver [`api-modular.md`](../../arquitectura/api-modular.md).

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| POST | `/api/v1/students/:id/documents` | Sube documento (multipart) | `documents.upload` |
| GET | `/api/v1/students/:id/documents` | Lista documentos del alumno con estado | `documents.view` |
| GET | `/api/v1/documents/:id/download` | Descarga autorizada del archivo privado | `documents.view` |
| PATCH | `/api/v1/documents/:id/validate` | Valida o rechaza un documento | `documents.validate` |
| DELETE | `/api/v1/documents/:id` | Baja lógica del documento | `documents.delete` |
| GET | `/api/v1/students/:id/kardex` | Kardex calculado (JSON) | `kardex.view` |

Request/response (Zod + resultado):

```ts
// PATCH /api/v1/documents/:id/validate
export const ValidateDocumentSchema = z.object({
  status: z.enum(["VALIDATED", "REJECTED"]),
  notes: z.string().max(1000).optional(),
}).openapi("ValidateDocument");

// POST /students/:id/documents  (multipart/form-data)
// fields: file (binary), tipo (enum DocumentType), notas? (string)
// 201 Created
{ "id": "…", "type": "CURP", "mimeType": "application/pdf",
  "size": 348120, "status": "PENDING", "createdAt": "2026-02-10T18:20:00.000Z" }
```

- `multer({ storage: memoryStorage, limits: { fileSize: 5 * 1024 * 1024 } })` en
  `routes`; la validación por contenido y la subida a S3 viven en el `service`.
- Errores del catálogo (ver [`errores.md`](../../api/errores.md)):
  `FILE_TYPE_NOT_ALLOWED` (400), `FILE_TOO_LARGE` (400),
  `STORAGE_NOT_CONFIGURED` (503), `RECORD_NOT_FOUND` (404).

## 6. Web

| Elemento | Capa FSD | Descripción |
|---|---|---|
| `document` | `entities/document` | API de documentos + tipos y estados |
| `kardex` | `entities/kardex` | API `getKardex` / `exportKardexPdf` + modelo |
| Subida de documento | `features/document/upload` | `model/useUpload.ts` + `ui/UploadDropfile.tsx` |
| Validación de documento | `features/document/validate` | `model/useValidate.ts` + diálogo validar/rechazar |
| Eliminación | `features/document/delete` | Confirmación con `ITConfirmDialog` |
| PDF de kardex | `widgets/kardex-pdf` | Render con `@react-pdf/renderer` + `file-saver` |
| Expediente | `pages/students/StudentDocumentsPage.tsx` | Listado y acciones sobre documentos |
| Kardex | `pages/students/StudentKardexPage.tsx` | Vista de kardex + exportar |

- Expediente con `ITPage` + `ITDataTable` (tipo, estado con `ITBadget`, tamaño,
  validador, acciones) y `ITDropfile` para la subida.
- `KpiTile` con el indicador de **documentos faltantes**; `ITDialog` para
  validar/rechazar.
- Kardex con `ITTable`/`PanelCard` por ciclo y promedios.
- i18n namespaces `documents` y `kardex`; validación con `@shared/validation`
  (tipo/tamaño en cliente, siempre reforzados en la API).

## 7. Permisos y alcance

| Permiso | ADMIN | CONTROL_ESCOLAR | PROFESOR | ALUMNO |
|---|---|---|---|---|
| `documents.view` | ALL | ALL | AREA | OWN |
| `documents.upload` | ALL | ALL | NONE | NONE |
| `documents.validate` | ALL | ALL | NONE | NONE |
| `documents.delete` | ALL | ALL | NONE | NONE |
| `kardex.view` | ALL | ALL | AREA | OWN |
| `kardex.export` | ALL | ALL | AREA | OWN |

- El alcance se aplica en la consulta (`AND`), nunca en el cliente. Los permisos
  y la matriz se administran en `/roles` (ver
  [`roles-permisos.md`](../../seguridad/roles-permisos.md)).
- `requiresPermission("documents.upload")` etc.; descarga y kardex reevalúan
  alcance **por registro** (el archivo solo se entrega si el alumno cae en el
  ámbito del usuario).

## 8. Validaciones

- Archivo: whitelist de MIME real (`%PDF`, `FF D8 FF`, `89 50 4E 47`), extensión
  coherente y `size ≤ 5 MB`.
- `documentTypeId` de un tipo activo del catálogo (M11); `status` de validación ∈ `{VALIDATED, REJECTED}`.
- `notes` `max 1000`; `file` obligatorio.
- IDs (`studentId`, `documentId`) UUID.
- Códigos: `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `REQUIRED_FIELD`,
  `VALIDATION_ERROR`, `INVALID_FORMAT`.

## 9. Bitácora

Registrado vía `AuditPort` con `previousState`/`newState` (ver
[`bitacora.md`](../../seguridad/bitacora.md)). Nunca se registran binarios: solo
metadatos y la clave del objeto.

| Acción | `entityType` | `previousState` → `newState` | `metadata` |
|---|---|---|---|
| `DOCUMENT_UPLOADED` | `Document` | `null` → `{ type, mimeType, size, status }` | `{ studentId, filePath }` |
| `DOCUMENT_VALIDATED` | `Document` | `{ status: "PENDING" }` → `{ status: "VALIDATED", validatedBy }` | `{ studentId }` |
| `DOCUMENT_REJECTED` | `Document` | `{ status: "PENDING" }` → `{ status: "REJECTED", notes }` | `{ studentId }` |
| `DOCUMENT_DELETED` | `Document` | `{ deletedAt: null }` → `{ deletedAt: <ts> }` | `{ studentId }` |

## 10. Pruebas (Playwright)

- **Unitarias** (`api/tests/unit`): validación de contenido/tamaño; construcción
  del kardex (promedio y acreditación); cálculo de faltantes; transición de
  estados; borrado lógico.
- **Contrato** (`api/tests/e2e`): subida multipart PDF/JPG/PNG válida → 201;
  archivo excedido → 400 `FILE_TOO_LARGE`; tipo no permitido → 400
  `FILE_TYPE_NOT_ALLOWED`; validar → 200; descarga sin permiso → 403; descarga
  fuera de alcance → 404; kardex → 200 (el PDF se arma en el navegador, [D-024](../../../DECISIONES.md)).
- **Navegador** (`web/tests/e2e`): subir, validar y eliminar documento; abrir y
  exportar el kardex.
- **Spec del módulo**: `tests/e2e/documents-kardex.spec.ts`.

## 11. Criterios de aceptación

- [x] Migración y modelo Prisma (`Document` + enums, índices y `deletedAt`).
- [x] Módulo API (routes/controller/service/dto/entity) con `multer`
      `memoryStorage`, S3 privado, permisos y bitácora.
- [x] Pantallas web con UI kit (expediente + kardex + export PDF) e i18n.
- [x] Specs pasando (solo los del módulo).
- [x] Este README completo.

## 12. Decisiones abiertas

- ¿Se requiere **antivirus/scan** de archivos antes de servir? (p. ej. ClamAV).
- ¿URLs firmadas temporales de S3 o streaming por la API? Determina expiración y
  cache.
- Política de **retención** del expediente tras baja definitiva del alumno.
- ¿El kardex debe congelarse (snapshot) al egresar para evitar cambios por
  recálculos posteriores?
- Tamaño y tipos configurables desde M11 o fijos en código.

## 13. Referencias

- Plantilla: [`plantilla-modulo.md`](../../plantillas/plantilla-modulo.md).
- Datos: [`../../modelo-datos/diccionario-datos.md`](../../modelo-datos/diccionario-datos.md) (`documents`, `kardex`).
- API: [`../../api/convenciones.md`](../../api/convenciones.md) · Errores: [`../../api/errores.md`](../../api/errores.md).
- Seguridad: [`../../seguridad/roles-permisos.md`](../../seguridad/roles-permisos.md) · [`../../seguridad/bitacora.md`](../../seguridad/bitacora.md) · [`../../seguridad/seguridad-owasp.md`](../../seguridad/seguridad-owasp.md).
- Arquitectura: [`../../arquitectura/api-modular.md`](../../arquitectura/api-modular.md), [`../../arquitectura/web-fsd.md`](../../arquitectura/web-fsd.md), [`../../arquitectura/axzy-ui-system.md`](../../arquitectura/axzy-ui-system.md).
- Módulos relacionados: [`../M07-cursos-grupos-inscripciones/README.md`](../M07-cursos-grupos-inscripciones/README.md), [`../M08-examenes-calificaciones/README.md`](../M08-examenes-calificaciones/README.md).
- Decisiones: [`../../../DECISIONES.md`](../../../DECISIONES.md).
