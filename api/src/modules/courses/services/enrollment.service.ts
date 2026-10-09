import { Prisma, type Enrollment, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import { serializable } from "@core/db/serializable";
import type { UserPermissions } from "@core/permissions";
import { fromDbDay, toDbDay, todayInBusinessZone } from "@core/utils/day";
import type { AuthenticatedUser } from "@core/utils/security";
import {
  filterEnum,
  filterId,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
} from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import { fullName } from "@modules/students/services/student.service";
import { ENROLLMENT_STATUSES, type EnrollInput, type EnrollmentView } from "../models/dto/course.dto";
import { firstConflict, parseSchedule } from "../models/entity/schedule";
import { CURRENT_ENROLLMENT, enrollmentScope } from "./academic-scope";
import { t, type MessageKey } from "@core/i18n";

const include = {
  student: {
    select: { studentNumber: true, firstNames: true, paternalSurname: true, maternalSurname: true, status: true },
  },
  group: { select: { name: true, course: { select: { name: true } }, term: { select: { name: true } } } },
} satisfies Prisma.EnrollmentInclude;

type EnrollmentRow = Enrollment & {
  student: { studentNumber: string; firstNames: string; paternalSurname: string; maternalSurname: string | null; status: "ACTIVE" | "WITHDRAWN" };
  group: { name: string; course: { name: string }; term: { name: string } };
};

const toView = (row: EnrollmentRow): EnrollmentView => ({
  id: row.id,
  studentId: row.studentId,
  studentNumber: row.student.studentNumber,
  studentName: fullName(row.student),
  studentStatus: row.student.status,
  groupId: row.groupId,
  groupName: row.group.name,
  courseName: row.group.course.name,
  termName: row.group.term.name,
  date: fromDbDay(row.date),
  status: row.status,
  finalGrade: row.finalGrade === null ? null : Number(row.finalGrade),
  withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
  withdrawalReason: row.withdrawalReason,
  transferredToId: row.transferredToId,
  createdAt: row.createdAt.toISOString(),
});

type Tx = Prisma.TransactionClient;

/**
 * Inscripciones (M07). Las reglas que leen y luego escriben (cupo, duplicado,
 * empalme) corren en una transacción `Serializable` con reintento acotado: dos
 * inscripciones simultáneas al último lugar no pueden pasar ambas. La baja es
 * lógica (`status = BAJA`), nunca un `DELETE`.
 */
export class EnrollmentService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private async load(id: string, user: UserPermissions, permission: string): Promise<EnrollmentRow> {
    const scoped = await enrollmentScope(user, permission);
    const row = await this.db.enrollment.findFirst({ where: { AND: [{ id }, ...(scoped ? [scoped] : [])] }, include });
    if (!row) throw new HttpError(404, "ENROLLMENT_NOT_FOUND");
    return row;
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<EnrollmentView>> {
    const { filters } = params;
    const and: Prisma.EnrollmentWhereInput[] = [];
    for (const key of ["groupId", "studentId"] as const) {
      const value = filterId(filters, key);
      if (value) and.push({ [key]: value });
    }
    const termId = filterId(filters, "termId");
    if (termId) and.push({ group: { termId } });
    const status = filterEnum(filters, "status", ENROLLMENT_STATUSES);
    if (status) and.push({ status });
    const studentNumber = filterText(filters, "studentNumber");
    if (studentNumber) and.push({ student: { studentNumber } });
    const name = filterText(filters, "name");
    if (name) {
      for (const word of name.contains.split(/\s+/).filter(Boolean)) {
        const contains = { contains: word, mode: "insensitive" as const };
        and.push({
          student: { OR: [{ firstNames: contains }, { paternalSurname: contains }, { maternalSurname: contains }] },
        });
      }
    }
    const scoped = await enrollmentScope(user, "enrollments.view");
    if (scoped) and.push(scoped);
    const orderBy = orderByOf(
      params.sort,
      {
        name: (direction) => [{ student: { paternalSurname: direction } }, { student: { firstNames: direction } }],
        studentNumber: (direction) => ({ student: { studentNumber: direction } }),
        date: "date",
        status: "status",
      },
      [[{ student: { paternalSurname: "asc" } }, { student: { firstNames: "asc" } }]]
    ).flat();
    const result = await paginatedQuery<EnrollmentRow>({
      model: this.db.enrollment,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy,
      include,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toView), total: result.total };
  }

  /** Grupo destino listo para recibir al alumno: activo, abierto, con cupo y sin empalme. */
  private async assertCanJoin(
    tx: Tx,
    groupId: string,
    studentId: string,
    { ignoreEnrollmentId }: { ignoreEnrollmentId?: string } = {}
  ) {
    const group = await tx.group.findUnique({ where: { id: groupId } });
    if (!group) throw new HttpError(404, "GROUP_NOT_FOUND");
    if (!group.active) throw new HttpError(409, "GROUP_INACTIVE");
    if (group.closedAt) throw new HttpError(409, "GROUP_CLOSED");

    const student = await tx.student.findUnique({ where: { id: studentId }, select: { status: true } });
    if (!student) throw new HttpError(404, "STUDENT_NOT_FOUND");
    if (student.status !== "ACTIVE") throw new HttpError(409, "STUDENT_INACTIVE");

    const already = await tx.enrollment.findFirst({ where: { studentId, groupId, ...CURRENT_ENROLLMENT } });
    if (already) throw new HttpError(409, "ALREADY_ENROLLED");

    const taken = await tx.enrollment.count({ where: { groupId, ...CURRENT_ENROLLMENT } });
    if (taken >= group.capacity) throw new HttpError(409, "GROUP_FULL", { capacity: group.capacity });

    // Empalme contra los grupos vigentes del alumno en el mismo ciclo.
    const others = await tx.enrollment.findMany({
      where: {
        studentId,
        status: "ENROLLED",
        group: { termId: group.termId, active: true },
        ...(ignoreEnrollmentId ? { NOT: { id: ignoreEnrollmentId } } : {}),
      },
      select: { group: { select: { name: true, schedule: true, course: { select: { name: true } } } } },
    });
    const schedule = parseSchedule(group.schedule);
    for (const other of others) {
      const conflict = firstConflict(schedule, parseSchedule(other.group.schedule));
      if (conflict) {
        throw new HttpError(409, "SCHEDULE_CONFLICT", {
          groupName: other.group.name,
          courseName: other.group.course.name,
          day: t(`days.${conflict.mine.day}` as MessageKey),
        }, { conflict });
      }
    }
    return group;
  }

  /** La carrera contra el índice único parcial también es "ya inscrito". */
  private duplicateAsAlreadyEnrolled(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "ALREADY_ENROLLED");
    }
    throw error;
  }

  async enroll(groupId: string, input: EnrollInput, actor: AuthenticatedUser): Promise<EnrollmentView> {
    const date = input.date ?? todayInBusinessZone();
    try {
      return await serializable(async (tx) => {
        await this.assertCanJoin(tx, groupId, input.studentId);
        const row = await tx.enrollment.create({
          data: { studentId: input.studentId, groupId, date: toDbDay(date), createdBy: actor.id },
          include,
        });
        await this.audit?.(
          { action: "ENROLLMENT_CREATED", entityType: "Enrollment", entityId: row.id, userId: actor.id,
            userName: actor.username, newState: { studentId: row.studentId, groupId, date, status: row.status } },
          tx
        );
        return toView(row);
      });
    } catch (error) {
      return this.duplicateAsAlreadyEnrolled(error);
    }
  }

  /** Baja lógica de la inscripción (solo vigente y con grupo abierto). */
  async drop(id: string, actor: AuthenticatedUser, reason?: string): Promise<EnrollmentView> {
    const previous = await this.load(id, actor, "enrollments.delete");
    if (previous.status !== "ENROLLED") throw new HttpError(409, "ENROLLMENT_NOT_ACTIVE");
    return this.db.$transaction(async (tx) => {
      const group = await tx.group.findUnique({ where: { id: previous.groupId }, select: { closedAt: true } });
      if (group?.closedAt) throw new HttpError(409, "GROUP_CLOSED");
      const changed = await tx.enrollment.updateMany({
        where: { id, status: "ENROLLED" },
        data: { status: "WITHDRAWN", withdrawnAt: new Date(), withdrawalReason: reason ?? null },
      });
      if (changed.count === 0) throw new HttpError(409, "ENROLLMENT_NOT_ACTIVE");
      await this.audit?.(
        { action: "ENROLLMENT_DELETED", entityType: "Enrollment", entityId: id, userId: actor.id,
          userName: actor.username, previousState: { status: "ENROLLED" }, newState: { status: "WITHDRAWN" },
          metadata: { studentId: previous.studentId, groupId: previous.groupId, reason: reason ?? null } },
        tx
      );
      return toView((await tx.enrollment.findUniqueOrThrow({ where: { id }, include })) as EnrollmentRow);
    });
  }

  /**
   * Cambio de grupo atómico: la inscripción origen queda en BAJA apuntando a la
   * nueva. Mismo curso y ciclo; el destino pasa las mismas reglas que una alta.
   */
  async changeGroup(id: string, toGroupId: string, actor: AuthenticatedUser): Promise<EnrollmentView> {
    const origin = await this.load(id, actor, "enrollments.edit");
    if (origin.status !== "ENROLLED") throw new HttpError(409, "ENROLLMENT_NOT_ACTIVE");
    try {
      return await serializable(async (tx) => {
        const [from, to] = await Promise.all([
          tx.group.findUniqueOrThrow({ where: { id: origin.groupId } }),
          tx.group.findUnique({ where: { id: toGroupId } }),
        ]);
        if (!to) throw new HttpError(404, "GROUP_NOT_FOUND");
        if (to.id === from.id || to.courseId !== from.courseId || to.termId !== from.termId) {
          throw new HttpError(400, "GROUP_CHANGE_INVALID");
        }
        if (from.closedAt) throw new HttpError(409, "GROUP_CLOSED");
        await this.assertCanJoin(tx, toGroupId, origin.studentId, { ignoreEnrollmentId: id });
        const created = await tx.enrollment.create({
          data: { studentId: origin.studentId, groupId: toGroupId, date: toDbDay(todayInBusinessZone()), createdBy: actor.id },
          include,
        });
        const changed = await tx.enrollment.updateMany({
          where: { id, status: "ENROLLED" },
          data: { status: "WITHDRAWN", withdrawnAt: new Date(), withdrawalReason: t("enrollments.groupChangeReason"), transferredToId: created.id },
        });
        if (changed.count === 0) throw new HttpError(409, "ENROLLMENT_NOT_ACTIVE");
        await this.audit?.(
          { action: "ENROLLMENT_GROUP_CHANGED", entityType: "Enrollment", entityId: created.id, userId: actor.id,
            userName: actor.username, previousState: { enrollmentId: id, groupId: from.id },
            newState: { enrollmentId: created.id, groupId: to.id },
            metadata: { studentId: origin.studentId } },
          tx
        );
        return toView(created);
      });
    } catch (error) {
      return this.duplicateAsAlreadyEnrolled(error);
    }
  }

  /**
   * Puerto de M05: al dar de baja al alumno se cancelan sus inscripciones
   * vigentes en la misma transacción del movimiento.
   */
  cancelForStudent = async (studentId: string, tx: unknown): Promise<number> => {
    const client = (tx ?? this.db) as Tx;
    const result = await client.enrollment.updateMany({
      where: { studentId, status: "ENROLLED" },
      data: { status: "WITHDRAWN", withdrawnAt: new Date(), withdrawalReason: t("enrollments.studentWithdrawalReason") },
    });
    return result.count;
  };
}
