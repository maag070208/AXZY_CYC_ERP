import type { PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { fromDbDay, toDbDay, todayInBusinessZone } from "@core/utils/day";
import type { AuthenticatedUser } from "@core/utils/security";
import type { AuditLogger } from "@modules/audit";
import type { MovementInput, MovementView } from "../models/dto/student.dto";
import type { EnrollmentCanceller, MovementRow } from "../models/entity/student.entity";
import type { StudentService } from "./student.service";

const toView = (row: MovementRow): MovementView => ({
  id: row.id,
  studentId: row.studentId,
  tipo: row.tipo,
  motivo: row.motivo,
  reasonId: row.reasonId,
  fecha: fromDbDay(row.fecha),
  observaciones: row.observaciones,
  createdBy: row.createdBy,
  authorName: row.author?.name ?? null,
  createdAt: row.createdAt.toISOString(),
});

/** Sin inscripciones todavía (M07): no hay nada que cancelar. */
const noEnrollments: EnrollmentCanceller = async () => 0;

/**
 * Bajas y reingresos (M05). Cada movimiento cambia `Student.status`, cancela
 * las inscripciones activas (baja), deja el historial inmutable y audita, todo
 * en una sola transacción.
 */
export class MovementService {
  private cancelEnrollments: EnrollmentCanceller = noEnrollments;

  constructor(
    private readonly students: StudentService,
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  /** M07 conecta aquí la cancelación de inscripciones activas. */
  setEnrollmentCanceller(canceller: EnrollmentCanceller): void {
    this.cancelEnrollments = canceller;
  }

  async list(studentId: string, actor: AuthenticatedUser): Promise<MovementView[]> {
    await this.students.loadScoped(studentId, actor, "students.movements");
    const rows = await this.db.studentMovement.findMany({
      where: { studentId },
      include: { author: { select: { name: true } } },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toView);
  }

  private async prepare(input: MovementInput): Promise<{ fecha: string }> {
    const today = todayInBusinessZone();
    const fecha = input.fecha ?? today;
    if (fecha > today) throw new HttpError(400, "FUTURE_DATE", { field: "fecha" });
    if (input.reasonId) {
      const reason = await this.db.cancellationReason.findFirst({ where: { id: input.reasonId, active: true } });
      if (!reason) throw new HttpError(400, "REASON_NOT_AVAILABLE");
    }
    return { fecha };
  }

  /** Baja: ACTIVO → BAJA. Repetirla responde `409 STUDENT_INACTIVE`. */
  async baja(studentId: string, input: MovementInput, actor: AuthenticatedUser, permission = "students.movements") {
    const student = await this.students.loadScoped(studentId, actor, permission);
    if (student.status === "BAJA") throw new HttpError(409, "STUDENT_INACTIVE");
    const { fecha } = await this.prepare(input);

    return this.db.$transaction(async (tx) => {
      // Guardia contra una baja concurrente: solo cambia si sigue ACTIVO.
      const changed = await tx.student.updateMany({ where: { id: studentId, status: "ACTIVO" }, data: { status: "BAJA" } });
      if (changed.count === 0) throw new HttpError(409, "STUDENT_INACTIVE");
      const cancelledEnrollments = await this.cancelEnrollments(studentId, tx);
      const movement = await tx.studentMovement.create({
        data: {
          studentId,
          tipo: "BAJA",
          motivo: input.motivo,
          reasonId: input.reasonId ?? null,
          fecha: toDbDay(fecha),
          observaciones: input.observaciones ?? null,
          createdBy: actor.id,
        },
        include: { author: { select: { name: true } } },
      });
      await this.audit?.(
        {
          action: "STUDENT_DEACTIVATED",
          entityType: "Student",
          entityId: studentId,
          userId: actor.id,
          userName: actor.username,
          previousState: { status: "ACTIVO" },
          newState: { status: "BAJA" },
          metadata: { motivo: input.motivo, fecha, movementId: movement.id, cancelledEnrollments },
        },
        tx
      );
      return { studentId, status: "BAJA" as const, movement: toView(movement), cancelledEnrollments };
    });
  }

  /** Reingreso: BAJA → ACTIVO; la matrícula se conserva. */
  async reingreso(studentId: string, input: MovementInput, actor: AuthenticatedUser) {
    const student = await this.students.loadScoped(studentId, actor, "students.movements");
    if (student.status === "ACTIVO") throw new HttpError(409, "STUDENT_ALREADY_ACTIVE");
    const { fecha } = await this.prepare(input);

    return this.db.$transaction(async (tx) => {
      const changed = await tx.student.updateMany({ where: { id: studentId, status: "BAJA" }, data: { status: "ACTIVO" } });
      if (changed.count === 0) throw new HttpError(409, "STUDENT_ALREADY_ACTIVE");
      const movement = await tx.studentMovement.create({
        data: {
          studentId,
          tipo: "REINGRESO",
          motivo: input.motivo,
          reasonId: input.reasonId ?? null,
          fecha: toDbDay(fecha),
          observaciones: input.observaciones ?? null,
          createdBy: actor.id,
        },
        include: { author: { select: { name: true } } },
      });
      await this.audit?.(
        {
          action: "STUDENT_REACTIVATED",
          entityType: "Student",
          entityId: studentId,
          userId: actor.id,
          userName: actor.username,
          previousState: { status: "BAJA" },
          newState: { status: "ACTIVO" },
          metadata: { motivo: input.motivo, fecha, movementId: movement.id },
        },
        tx
      );
      return { studentId, status: "ACTIVO" as const, movement: toView(movement), cancelledEnrollments: 0 };
    });
  }
}
