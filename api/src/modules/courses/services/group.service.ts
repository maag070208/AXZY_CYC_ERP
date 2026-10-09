import { Prisma, type Group, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import type { UserPermissions } from "@core/permissions";
import type { AuthenticatedUser } from "@core/utils/security";
import {
  filterBool,
  filterId,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
} from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import type { GroupCreateInput, GroupUpdateInput, GroupView } from "../models/dto/course.dto";
import { parseSchedule, sortSchedule } from "../models/entity/schedule";
import { CURRENT_ENROLLMENT, groupScope } from "./academic-scope";

export const groupInclude = {
  course: { select: { code: true, name: true, active: true } },
  term: { select: { name: true, active: true } },
  teacher: { select: { firstNames: true, surnames: true } },
  _count: { select: { enrollments: { where: CURRENT_ENROLLMENT } } },
} satisfies Prisma.GroupInclude;

export type GroupRow = Group & {
  course: { code: string; name: string; active: boolean };
  term: { name: string; active: boolean };
  teacher: { firstNames: string; surnames: string } | null;
  _count: { enrollments: number };
};

export const toGroupView = (row: GroupRow): GroupView => ({
  id: row.id,
  name: row.name,
  courseId: row.courseId,
  courseCode: row.course.code,
  courseName: row.course.name,
  termId: row.termId,
  termName: row.term.name,
  activeTerm: row.term.active,
  teacherId: row.teacherId,
  teacherName: row.teacher ? `${row.teacher.firstNames} ${row.teacher.surnames}` : null,
  capacity: row.capacity,
  enrolledCount: row._count.enrollments,
  available: Math.max(0, row.capacity - row._count.enrollments),
  schedule: sortSchedule(parseSchedule(row.schedule)),
  classroom: row.classroom,
  active: row.active,
  closedAt: row.closedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const stateOf = (view: GroupView): Prisma.InputJsonObject => ({
  name: view.name,
  courseId: view.courseId,
  termId: view.termId,
  teacherId: view.teacherId,
  capacity: view.capacity,
  schedule: view.schedule,
  classroom: view.classroom,
  active: view.active,
});

/**
 * Grupos (M07): curso + ciclo + profesor + cupo + horario + aula. El profesor
 * ve solo sus grupos (`AREA`) y el alumno los grupos donde está inscrito (`OWN`).
 */
export class GroupService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  /** Grupo dentro del alcance de `permission`; fuera de él, 404. */
  async load(id: string, user: UserPermissions | null, permission = "groups.view"): Promise<GroupRow> {
    const scoped = user ? await groupScope(user, permission) : null;
    const row = await this.db.group.findFirst({
      where: { AND: [{ id }, ...(scoped ? [scoped] : [])] },
      include: groupInclude,
    });
    if (!row) throw new HttpError(404, "GROUP_NOT_FOUND");
    return row;
  }

  private async assertTeacher(teacherId: string | null | undefined): Promise<void> {
    if (!teacherId) return;
    const teacher = await this.db.teacher.findUnique({ where: { id: teacherId }, select: { status: true } });
    if (!teacher) throw new HttpError(400, "TEACHER_NOT_FOUND");
    if (teacher.status !== "ACTIVE") throw new HttpError(409, "TEACHER_INACTIVE");
  }

  private async assertNameFree(courseId: string, termId: string, name: string, exceptId?: string): Promise<void> {
    const taken = await this.db.group.findFirst({
      where: {
        courseId,
        termId,
        name: { equals: name, mode: "insensitive" },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
    });
    if (taken) throw new HttpError(409, "GROUP_NAME_TAKEN", { name });
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<GroupView>> {
    const { filters } = params;
    const and: Prisma.GroupWhereInput[] = [];
    const name = filterText(filters, "name");
    if (name) and.push({ name });
    const course = filterText(filters, "course");
    if (course) and.push({ OR: [{ course: { name: course } }, { course: { code: course } }] });
    for (const key of ["courseId", "termId", "teacherId"] as const) {
      const value = filterId(filters, key);
      if (value) and.push({ [key]: value });
    }
    const active = filterBool(filters, "active");
    if (active !== undefined) and.push({ active });
    const closed = filterBool(filters, "closed");
    if (closed !== undefined) and.push({ closedAt: closed ? { not: null } : null });
    const scoped = await groupScope(user, "groups.view");
    if (scoped) and.push(scoped);
    const orderBy = orderByOf(
      params.sort,
      {
        name: "name",
        course: (direction) => ({ course: { name: direction } }),
        term: (direction) => ({ term: { startDate: direction } }),
        capacity: "capacity",
        createdAt: "createdAt",
      },
      [{ term: { startDate: "desc" } }, { course: { name: "asc" } }, { name: "asc" }]
    );
    const result = await paginatedQuery<GroupRow>({
      model: this.db.group,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy,
      include: groupInclude,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toGroupView), total: result.total };
  }

  /** Grupos abiertos de un ciclo para selectores (cambio de grupo, inscripción). */
  async options(user: UserPermissions, filters: { termId?: string; courseId?: string }): Promise<GroupView[]> {
    const scoped = await groupScope(user, "groups.view");
    const rows = await this.db.group.findMany({
      where: {
        AND: [
          { active: true, closedAt: null },
          ...(filters.termId ? [{ termId: filters.termId }] : []),
          ...(filters.courseId ? [{ courseId: filters.courseId }] : []),
          ...(scoped ? [scoped] : []),
        ],
      },
      include: groupInclude,
      orderBy: [{ course: { name: "asc" } }, { name: "asc" }],
      take: 200,
    });
    return rows.map(toGroupView);
  }

  async getById(id: string, user: UserPermissions): Promise<GroupView> {
    return toGroupView(await this.load(id, user));
  }

  async create(input: GroupCreateInput, actor: AuthenticatedUser): Promise<GroupView> {
    const [course, term] = await Promise.all([
      this.db.course.findUnique({ where: { id: input.courseId }, select: { active: true } }),
      this.db.term.findUnique({ where: { id: input.termId }, select: { id: true } }),
    ]);
    if (!course) throw new HttpError(400, "COURSE_NOT_FOUND");
    if (!course.active) throw new HttpError(409, "COURSE_INACTIVE");
    if (!term) throw new HttpError(400, "TERM_NOT_FOUND");
    await this.assertTeacher(input.teacherId);
    await this.assertNameFree(input.courseId, input.termId, input.name);
    return this.db.$transaction(async (tx) => {
      const row = await tx.group.create({
        data: {
          courseId: input.courseId,
          termId: input.termId,
          teacherId: input.teacherId ?? null,
          name: input.name,
          capacity: input.capacity,
          schedule: sortSchedule(input.schedule) as unknown as Prisma.InputJsonArray,
          classroom: input.classroom ?? null,
        },
        include: groupInclude,
      });
      const view = toGroupView(row);
      await this.audit?.(
        { action: "GROUP_CREATED", entityType: "Group", entityId: row.id, userId: actor.id, userName: actor.username,
          newState: stateOf(view) },
        tx
      );
      return view;
    });
  }

  async update(id: string, input: GroupUpdateInput, actor: AuthenticatedUser): Promise<GroupView> {
    const previous = await this.load(id, null);
    if (previous.closedAt) throw new HttpError(409, "GROUP_CLOSED");
    const before = toGroupView(previous);
    if (input.teacherId !== undefined && input.teacherId !== previous.teacherId) await this.assertTeacher(input.teacherId);
    if (input.name && input.name !== previous.name) {
      await this.assertNameFree(previous.courseId, previous.termId, input.name, id);
    }
    if (input.capacity !== undefined && input.capacity < before.enrolledCount) {
      throw new HttpError(409, "CAPACITY_BELOW_ENROLLED", { capacity: input.capacity, enrolledCount: before.enrolledCount });
    }
    return this.db.$transaction(async (tx) => {
      const row = await tx.group.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.teacherId !== undefined && { teacherId: input.teacherId }),
          ...(input.capacity !== undefined && { capacity: input.capacity }),
          ...(input.schedule !== undefined && { schedule: sortSchedule(input.schedule) as unknown as Prisma.InputJsonArray }),
          ...(input.classroom !== undefined && { classroom: input.classroom }),
        },
        include: groupInclude,
      });
      const after = toGroupView(row);
      await this.audit?.(
        { action: "GROUP_UPDATED", entityType: "Group", entityId: id, userId: actor.id, userName: actor.username,
          previousState: stateOf(before), newState: stateOf(after) },
        tx
      );
      return after;
    });
  }

  /** Baja lógica: solo sin alumnos inscritos (darlos de baja o cambiarlos antes). */
  async setActive(id: string, active: boolean, actor: AuthenticatedUser): Promise<GroupView> {
    const previous = await this.load(id, null);
    if (previous.active === active) throw new HttpError(409, active ? "GROUP_ALREADY_ACTIVE" : "GROUP_INACTIVE");
    if (!active) {
      const count = await this.db.enrollment.count({ where: { groupId: id, status: "ENROLLED" } });
      if (count > 0) throw new HttpError(409, "GROUP_HAS_ENROLLMENTS", { count });
    }
    if (active && !previous.course.active) throw new HttpError(409, "COURSE_INACTIVE");
    return this.db.$transaction(async (tx) => {
      const row = await tx.group.update({ where: { id }, data: { active }, include: groupInclude });
      await this.audit?.(
        {
          action: active ? "GROUP_REACTIVATED" : "GROUP_DEACTIVATED",
          entityType: "Group",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: { active: previous.active },
          newState: { active },
        },
        tx
      );
      return toGroupView(row);
    });
  }
}
