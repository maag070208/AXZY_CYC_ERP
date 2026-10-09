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

type CourseRow = Course & { level: { nombre: string } | null; _count: { groups: number } };

const include = {
  level: { select: { nombre: true } },
  _count: { select: { groups: { where: { active: true } } } },
} satisfies Prisma.CourseInclude;

const toView = (row: CourseRow): CourseView => ({
  id: row.id,
  clave: row.clave,
  nombre: row.nombre,
  levelId: row.levelId,
  levelNombre: row.level?.nombre ?? null,
  descripcion: row.descripcion,
  active: row.active,
  groupsCount: row._count.groups,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const stateOf = (view: CourseView): Prisma.InputJsonObject => ({
  clave: view.clave,
  nombre: view.nombre,
  levelId: view.levelId,
  descripcion: view.descripcion,
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

  private async assertClaveFree(clave: string, exceptId?: string): Promise<void> {
    const taken = await this.db.course.findFirst({ where: { clave, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
    if (taken) throw new HttpError(409, "COURSE_CLAVE_TAKEN", { clave });
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<CourseView>> {
    const { filters } = params;
    const and: Prisma.CourseWhereInput[] = [];
    const clave = filterText(filters, "clave");
    if (clave) and.push({ clave });
    const nombre = filterText(filters, "nombre");
    if (nombre) and.push({ nombre });
    const levelId = filterId(filters, "levelId");
    if (levelId) and.push({ levelId });
    const active = filterBool(filters, "active");
    if (active !== undefined) and.push({ active });
    const scoped = await courseScope(user, "courses.view");
    if (scoped) and.push(scoped);
    const orderBy = orderByOf(
      params.sort,
      { clave: "clave", nombre: "nombre", active: "active", createdAt: "createdAt" },
      [{ nombre: "asc" }]
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
  async options(user: UserPermissions): Promise<Array<{ id: string; clave: string; nombre: string }>> {
    const scoped = await courseScope(user, "courses.view");
    return this.db.course.findMany({
      where: { AND: [{ active: true }, ...(scoped ? [scoped] : [])] },
      select: { id: true, clave: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  }

  async getById(id: string, user: UserPermissions): Promise<CourseView> {
    return toView(await this.load(id, user));
  }

  async create(input: CourseCreateInput, actor: AuthenticatedUser): Promise<CourseView> {
    await this.assertClaveFree(input.clave);
    await this.assertLevel(input.levelId);
    return this.db.$transaction(async (tx) => {
      const row = await tx.course.create({
        data: {
          clave: input.clave,
          nombre: input.nombre,
          levelId: input.levelId ?? null,
          descripcion: input.descripcion ?? null,
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
    if (input.clave && input.clave !== before.clave) await this.assertClaveFree(input.clave, id);
    if (input.levelId !== undefined) await this.assertLevel(input.levelId);
    return this.db.$transaction(async (tx) => {
      const row = await tx.course.update({
        where: { id },
        data: {
          ...(input.clave !== undefined && { clave: input.clave }),
          ...(input.nombre !== undefined && { nombre: input.nombre }),
          ...(input.levelId !== undefined && { levelId: input.levelId }),
          ...(input.descripcion !== undefined && { descripcion: input.descripcion }),
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
