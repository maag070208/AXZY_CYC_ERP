import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { deleteObject, readObject, uploadObject } from "@core/services/storage";
import type { AuthenticatedUser } from "@core/utils/security";
import type { AuditLogger } from "@modules/audit";
import type { StudentService } from "@modules/students";
import { MAX_DOCUMENT_BYTES, type DocumentView } from "../models/dto/document.dto";
import { detectFileType } from "../models/entity/document.entity";

const include = {
  documentType: { select: { name: true, required: true } },
  uploader: { select: { name: true } },
  validator: { select: { name: true } },
};

type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof include }>;

const toView = (row: DocumentRow): DocumentView => ({
  id: row.id,
  studentId: row.studentId,
  documentTypeId: row.documentTypeId,
  documentType: row.documentType.name,
  obligatorio: row.documentType.required,
  originalName: row.originalName,
  mimeType: row.mimeType,
  size: row.size,
  status: row.status,
  notas: row.notas,
  uploadedByName: row.uploader?.name ?? null,
  validatedByName: row.validator?.name ?? null,
  validatedAt: row.validatedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

/**
 * Expediente documental (M06). El archivo se valida por contenido, se guarda
 * con nombre aleatorio en almacenamiento privado y solo se entrega por la API
 * dentro del alcance del alumno. Nada se borra físicamente: la baja es lógica.
 */
export class DocumentService {
  constructor(
    private readonly students: StudentService,
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  /** Alumno dentro del alcance de `permission`; en BAJA el expediente es de solo lectura. */
  private async writableStudent(studentId: string, actor: AuthenticatedUser, permission: string) {
    const student = await this.students.loadScoped(studentId, actor, permission);
    if (student.status === "BAJA") throw new HttpError(409, "STUDENT_INACTIVE");
    return student;
  }

  private async loadDocument(id: string, actor: AuthenticatedUser, permission: string): Promise<DocumentRow> {
    const row = await this.db.document.findFirst({ where: { id, deletedAt: null }, include });
    if (!row) throw new HttpError(404, "DOCUMENT_NOT_FOUND");
    // El alcance se evalúa sobre el alumno dueño del documento.
    await this.students.loadScoped(row.studentId, actor, permission).catch(() => {
      throw new HttpError(404, "DOCUMENT_NOT_FOUND");
    });
    return row;
  }

  async list(studentId: string, actor: AuthenticatedUser) {
    await this.students.loadScoped(studentId, actor, "documents.view");
    const [rows, required] = await Promise.all([
      this.db.document.findMany({
        where: { studentId, deletedAt: null },
        include,
        orderBy: [{ createdAt: "desc" }],
      }),
      this.db.documentType.findMany({ where: { active: true, required: true }, orderBy: { name: "asc" } }),
    ]);
    const validated = new Set(rows.filter((r) => r.status === "VALIDADO").map((r) => r.documentTypeId));
    return {
      documents: rows.map(toView),
      missing: required.filter((t) => !validated.has(t.id)).map((t) => ({ id: t.id, name: t.name })),
      requiredCount: required.length,
    };
  }

  async upload(
    studentId: string,
    file: UploadedFile | undefined,
    fields: { documentTypeId: string; notas?: string },
    actor: AuthenticatedUser
  ): Promise<DocumentView> {
    await this.writableStudent(studentId, actor, "documents.upload");
    if (!file || file.size === 0) throw new HttpError(400, "FILE_REQUIRED");
    if (file.size > MAX_DOCUMENT_BYTES) throw new HttpError(400, "FILE_TOO_LARGE", { maxMb: 5 });
    const type = detectFileType(file.buffer);
    if (!type) throw new HttpError(400, "FILE_TYPE_NOT_ALLOWED");
    const documentType = await this.db.documentType.findFirst({ where: { id: fields.documentTypeId, active: true } });
    if (!documentType) throw new HttpError(400, "DOCUMENT_TYPE_NOT_AVAILABLE");

    const key = `students/${studentId}/${randomUUID()}.${type.ext}`;
    await uploadObject(key, file.buffer, type.mime);
    const originalName = file.originalname.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 200) || `documento.${type.ext}`;

    try {
      return await this.db.$transaction(async (tx) => {
        // Reemplazo: los rechazados del mismo tipo quedan dados de baja (trazables).
        await tx.document.updateMany({
          where: { studentId, documentTypeId: documentType.id, status: "RECHAZADO", deletedAt: null },
          data: { deletedAt: new Date() },
        });
        const row = await tx.document.create({
          data: {
            studentId,
            documentTypeId: documentType.id,
            filePath: key,
            originalName,
            mimeType: type.mime,
            size: file.size,
            notas: fields.notas ?? null,
            uploadedBy: actor.id,
          },
          include,
        });
        await this.audit?.(
          {
            action: "DOCUMENT_UPLOADED",
            entityType: "Document",
            entityId: row.id,
            userId: actor.id,
            userName: actor.username,
            newState: { tipo: documentType.name, mimeType: type.mime, size: file.size, status: "PENDIENTE" },
            metadata: { studentId, filePath: key },
          },
          tx
        );
        return toView(row);
      });
    } catch (error) {
      await deleteObject(key).catch(() => undefined);
      throw error;
    }
  }

  async download(id: string, actor: AuthenticatedUser): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const row = await this.loadDocument(id, actor, "documents.view");
    return { buffer: await readObject(row.filePath), mimeType: row.mimeType, filename: row.originalName };
  }

  async validate(id: string, status: "VALIDADO" | "RECHAZADO", notas: string | undefined, actor: AuthenticatedUser) {
    const row = await this.loadDocument(id, actor, "documents.validate");
    await this.writableStudent(row.studentId, actor, "documents.validate");
    if (row.status !== "PENDIENTE") throw new HttpError(409, "DOCUMENT_ALREADY_REVIEWED");
    return this.db.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id },
        data: { status, validatedBy: actor.id, validatedAt: new Date(), ...(notas !== undefined && { notas }) },
        include,
      });
      await this.audit?.(
        {
          action: status === "VALIDADO" ? "DOCUMENT_VALIDATED" : "DOCUMENT_REJECTED",
          entityType: "Document",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: { status: "PENDIENTE" },
          newState: { status, validatedBy: actor.id, notas: notas ?? null },
          metadata: { studentId: row.studentId },
        },
        tx
      );
      return toView(updated);
    });
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const row = await this.loadDocument(id, actor, "documents.delete");
    await this.writableStudent(row.studentId, actor, "documents.delete");
    await this.db.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.document.update({ where: { id }, data: { deletedAt } });
      await this.audit?.(
        {
          action: "DOCUMENT_DELETED",
          entityType: "Document",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: { deletedAt: null },
          newState: { deletedAt: deletedAt.toISOString() },
          metadata: { studentId: row.studentId },
        },
        tx
      );
    });
  }
}
