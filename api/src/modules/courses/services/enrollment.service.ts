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

const include = {
  student: {
    select: { matricula: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true, status: true },
  },
  group: { select: { nombre: true, course: { select: { nombre: true } }, term: { select: { name: true } } } },
} satisfies Prisma.EnrollmentInclude;

type EnrollmentRow = Enrollment & {
  student: { matricula: string; nombres: string; apellidoPaterno: string; apellidoMaterno: string | null; status: "ACTIVO" | "BAJA" };
  group: { nombre: string; course: { nombre: string }; term: { name: string } };
};

const toView = (row: EnrollmentRow): EnrollmentView => ({
  id: row.id,
  studentId: row.studentId,
  matricula: row.student.matricula,
  studentNombre: fullName(row.student),
  studentStatus: row.student.status,
  groupId: row.groupId,
  groupNombre: row.group.nombre,
  courseNombre: row.group.course.nombre,
  termNombre: row.group.term.name,
  fecha: fromDbDay(row.fecha),
  status: row.status,
  finalGrade: row.finalGrade === null ? null : Number(row.finalGrade),
  bajaAt: row.bajaAt?.toISOString() ?? null,
  bajaMotivo: row.bajaMotivo,
  transferredToId: row.transferredToId,
  createdAt: row.createdAt.toISOString(),
});

const DAY_LABEL: Record<string, string> = {
  LUNES: "lunes",
  MARTES: "martes",
  MIERCOLES: "miércoles",
  JUEVES: "jueves",
  VIERNES: "viernes",
  SABADO: "sábado",
  DOMINGO: "domingo",
};

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
    const matricula = filterText(filters, "matricula");
    if (matricula) and.push({ student: { matricula } });
    const nombre = filterText(filters, "nombre");
    if (nombre) {
      for (const word of nombre.contains.split(/\s+/).filter(Boolean)) {
        const contains = { contains: word, mode: "insensitive" as const };
        and.push({
          student: { OR: [{ nombres: contains }, { apellidoPaterno: contains }, { apellidoMaterno: contains }] },
        });
      }
    }
    const scoped = await enrollmentScope(user, "enrollments.view");
    if (scoped) and.push(scoped);
    const orderBy = orderByOf(
      params.sort,
      {
        nombre: (direction) => [{ student: { apellidoPaterno: direction } }, { student: { nombres: direction } }],
        matricula: (direction) => ({ student: { matricula: direction } }),
        fecha: "fecha",
        status: "status",
      },
      [[{ student: { apellidoPaterno: "asc" } }, { student: { nombres: "asc" } }]]
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
    if (student.status !== "ACTIVO") throw new HttpError(409, "STUDENT_INACTIVE");

    const already = await tx.enrollment.findFirst({ where: { studentId, groupId, ...CURRENT_ENROLLMENT } });
    if (already) throw new HttpError(409, "ALREADY_ENROLLED");

    const taken = await tx.enrollment.count({ where: { groupId, ...CURRENT_ENROLLMENT } });
    if (taken >= group.cupo) throw new HttpError(409, "GROUP_FULL", { cupo: group.cupo });

    // Empalme contra los grupos vigentes del alumno en el mismo ciclo.
    const others = await tx.enrollment.findMany({
      where: {
        studentId,
        status: "INSCRITO",
        group: { termId: group.termId, active: true },
        ...(ignoreEnrollmentId ? { NOT: { id: ignoreEnrollmentId } } : {}),
      },
      select: { group: { select: { nombre: true, horario: true, course: { select: { nombre: true } } } } },
    });
    const schedule = parseSchedule(group.horario);
    for (const other of others) {
      const conflict = firstConflict(schedule, parseSchedule(other.group.horario));
      if (conflict) {
        throw new HttpError(409, "SCHEDULE_CONFLICT", {
          grupo: other.group.nombre,
          curso: other.group.course.nombre,
          dia: DAY_LABEL[conflict.mine.dia],
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
    const fecha = input.fecha ?? todayInBusinessZone();
    try {
      return await serializable(async (tx) => {
        await this.assertCanJoin(tx, groupId, input.studentId);
        const row = await tx.enrollment.create({
          data: { studentId: input.studentId, groupId, fecha: toDbDay(fecha), createdBy: actor.id },
          include,
        });
        await this.audit?.(
          { action: "ENROLLMENT_CREATED", entityType: "Enrollment", entityId: row.id, userId: actor.id,
            userName: actor.username, newState: { studentId: row.studentId, groupId, fecha, status: row.status } },
          tx
        );
        return toView(row);
      });
    } catch (error) {
      return this.duplicateAsAlreadyEnrolled(error);
    }
  }

  /** Baja lógica de la inscripción (solo vigente y con grupo abierto). */
  async drop(id: string, actor: AuthenticatedUser, motivo?: string): Promise<EnrollmentView> {
    const previous = await this.load(id, actor, "enrollments.delete");
    if (previous.status !== "INSCRITO") throw new HttpError(409, "ENROLLMENT_NOT_ACTIVE");
    return this.db.$transaction(async (tx) => {
      const group = await tx.group.findUnique({ where: { id: previous.groupId }, select: { closedAt: true } });
      if (group?.closedAt) throw new HttpError(409, "GROUP_CLOSED");
      const changed = await tx.enrollment.updateMany({
        where: { id, status: "INSCRITO" },
        data: { status: "BAJA", bajaAt: new Date(), bajaMotivo: motivo ?? null },
      });
      if (changed.count === 0) throw new HttpError(409, "ENROLLMENT_NOT_ACTIVE");
      await this.audit?.(
        { action: "ENROLLMENT_DELETED", entityType: "Enrollment", entityId: id, userId: actor.id,
          userName: actor.username, previousState: { status: "INSCRITO" }, newState: { status: "BAJA" },
          metadata: { studentId: previous.studentId, groupId: previous.groupId, motivo: motivo ?? null } },
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
    if (origin.status !== "INSCRITO") throw new HttpError(409, "ENROLLMENT_NOT_ACTIVE");
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
          data: { studentId: origin.studentId, groupId: toGroupId, fecha: toDbDay(todayInBusinessZone()), createdBy: actor.id },
          include,
        });
        const changed = await tx.enrollment.updateMany({
          where: { id, status: "INSCRITO" },
          data: { status: "BAJA", bajaAt: new Date(), bajaMotivo: "Cambio de grupo", transferredToId: created.id },
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
      where: { studentId, status: "INSCRITO" },
      data: { status: "BAJA", bajaAt: new Date(), bajaMotivo: "Baja del alumno" },
    });
    return result.count;
  };
}
