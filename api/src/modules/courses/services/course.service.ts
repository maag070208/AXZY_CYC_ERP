import { Prisma, type Course, type PrismaClient } from "@prisma/client";
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
import type { CourseCreateInput, CourseUpdateInput, CourseView } from "../models/dto/course.dto";
import { courseScope } from "./academic-scope";

type CourseRow = Course & { level: { name: string } | null; _count: { groups: number } };

const include = {
  level: { select: { name: true } },
  _count: { select: { groups: { where: { active: true } } } },
} satisfies Prisma.CourseInclude;

const toView = (row: CourseRow): CourseView => ({
  id: row.id,
  code: row.code,
  name: row.name,
  levelId: row.levelId,
  levelNombre: row.level?.name ?? null,
  description: row.description,
  active: row.active,
  groupsCount: row._count.groups,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const stateOf = (view: CourseView): Prisma.InputJsonObject => ({
  code: view.code,
  name: view.name,
  levelId: view.levelId,
  description: view.description,
  active: view.active,
});

/** Cursos (M07): oferta académica. Baja lógica con `active = false`. */
export class CourseService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private async load(id: string, user?: UserPermissions): Promise<CourseRow> {
    const scoped = user ? await courseScope(user, "courses.view") : null;
    const row = await this.db.course.findFirst({ where: { AND: [{ id }, ...(scoped ? [scoped] : [])] }, include });
    if (!row) throw new HttpError(404, "COURSE_NOT_FOUND");
    return row;
  }

  private async assertLevel(levelId: string | null | undefined): Promise<void> {
    if (!levelId) return;
    const level = await this.db.level.findFirst({ where: { id: levelId, active: true } });
    if (!level) throw new HttpError(400, "LEVEL_NOT_AVAILABLE");
  }

  private async assertClaveFree(code: string, exceptId?: string): Promise<void> {
    const taken = await this.db.course.findFirst({ where: { code, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
    if (taken) throw new HttpError(409, "COURSE_CLAVE_TAKEN", { code });
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<CourseView>> {
    const { filters } = params;
    const and: Prisma.CourseWhereInput[] = [];
    const code = filterText(filters, "code");
    if (code) and.push({ code });
    const name = filterText(filters, "name");
    if (name) and.push({ name });
    const levelId = filterId(filters, "levelId");
    if (levelId) and.push({ levelId });
    const active = filterBool(filters, "active");
    if (active !== undefined) and.push({ active });
    const scoped = await courseScope(user, "courses.view");
    if (scoped) and.push(scoped);
    const orderBy = orderByOf(
      params.sort,
      { code: "code", name: "name", active: "active", createdAt: "createdAt" },
      [{ name: "asc" }]
    );
    const result = await paginatedQuery<CourseRow>({
      model: this.db.course,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy,
      include,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toView), total: result.total };
  }

  /** Cursos activos para selectores. */
  async options(user: UserPermissions): Promise<Array<{ id: string; code: string; name: string }>> {
    const scoped = await courseScope(user, "courses.view");
    return this.db.course.findMany({
      where: { AND: [{ active: true }, ...(scoped ? [scoped] : [])] },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async getById(id: string, user: UserPermissions): Promise<CourseView> {
    return toView(await this.load(id, user));
  }

  async create(input: CourseCreateInput, actor: AuthenticatedUser): Promise<CourseView> {
    await this.assertClaveFree(input.code);
    await this.assertLevel(input.levelId);
    return this.db.$transaction(async (tx) => {
      const row = await tx.course.create({
        data: {
          code: input.code,
          name: input.name,
          levelId: input.levelId ?? null,
          description: input.description ?? null,
        },
        include,
      });
      const view = toView(row);
      await this.audit?.(
        { action: "COURSE_CREATED", entityType: "Course", entityId: row.id, userId: actor.id, userName: actor.username,
          newState: stateOf(view) },
        tx
      );
      return view;
    });
  }

  async update(id: string, input: CourseUpdateInput, actor: AuthenticatedUser): Promise<CourseView> {
    const before = toView(await this.load(id));
    if (input.code && input.code !== before.code) await this.assertClaveFree(input.code, id);
    if (input.levelId !== undefined) await this.assertLevel(input.levelId);
    return this.db.$transaction(async (tx) => {
      const row = await tx.course.update({
        where: { id },
        data: {
          ...(input.code !== undefined && { code: input.code }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.levelId !== undefined && { levelId: input.levelId }),
          ...(input.description !== undefined && { description: input.description }),
        },
        include,
      });
      const after = toView(row);
      await this.audit?.(
        { action: "COURSE_UPDATED", entityType: "Course", entityId: id, userId: actor.id, userName: actor.username,
          previousState: stateOf(before), newState: stateOf(after) },
        tx
      );
      return after;
    });
  }

  /** Baja lógica: los grupos existentes siguen, pero no se abren nuevos. */
  async setActive(id: string, active: boolean, actor: AuthenticatedUser): Promise<CourseView> {
    const before = await this.load(id);
    if (before.active === active) throw new HttpError(409, active ? "COURSE_ALREADY_ACTIVE" : "COURSE_INACTIVE");
    return this.db.$transaction(async (tx) => {
      const row = await tx.course.update({ where: { id }, data: { active }, include });
      await this.audit?.(
        {
          action: active ? "COURSE_REACTIVATED" : "COURSE_DEACTIVATED",
          entityType: "Course",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: { active: before.active },
          newState: { active },
        },
        tx
      );
      return toView(row);
    });
  }
}
