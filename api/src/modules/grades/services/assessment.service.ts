import { Prisma, type Assessment, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import { scopeWhere, type UserPermissions } from "@core/permissions";
import { fromDbDay, toDbDay } from "@core/utils/day";
import type { AuthenticatedUser } from "@core/utils/security";
import {
  filterBool,
  filterEnum,
  filterId,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
} from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import { CURRENT_ENROLLMENT, GROUPS_RESOURCE, assertGroupInScope } from "@modules/courses";
import {
  ASSESSMENT_TYPES,
  type AssessmentCreateInput,
  type AssessmentUpdateInput,
  type AssessmentView,
} from "../models/dto/grade.dto";
import { weightsTotal } from "../models/entity/grading";

type AssessmentRow = Assessment & { _count: { grades: number } };

const include = {
  _count: { select: { grades: { where: { score: { not: null } } } } },
} satisfies Prisma.AssessmentInclude;

const toView = (row: AssessmentRow): AssessmentView => ({
  id: row.id,
  groupId: row.groupId,
  name: row.name,
  type: row.type,
  weight: Number(row.weight),
  date: row.date ? fromDbDay(row.date) : null,
  maxScore: Number(row.maxScore),
  active: row.active,
  capturedCount: row._count.grades,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const stateOf = (v: AssessmentView): Prisma.InputJsonObject => ({
  groupId: v.groupId,
  name: v.name,
  type: v.type,
  weight: v.weight,
  date: v.date,
  maxScore: v.maxScore,
  active: v.active,
});

/** Filtro de alcance de instrumentos: los del grupo del profesor / donde está inscrito el alumno. */
export const assessmentScope = (user: UserPermissions, permission: string) =>
  scopeWhere<Prisma.AssessmentWhereInput>(user, {
    resource: GROUPS_RESOURCE,
    permission,
    own: (u) => ({ group: { enrollments: { some: { ...CURRENT_ENROLLMENT, student: { userId: u.id } } } } }),
    byIds: (ids) => ({ groupId: { in: ids } }),
    or: (filters) => ({ OR: filters }),
    none: { id: { in: [] } },
  });

/**
 * Instrumentos de evaluación (M08). La suma de ponderaciones activas de un
 * grupo nunca pasa de 100 (`WEIGHTS_EXCEED_100` al crear/editar) y debe ser
 * exactamente 100 para cerrar (`WEIGHTS_NOT_100`). Un grupo cerrado ya no cambia.
 */
export class AssessmentService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  async load(id: string, user: UserPermissions | null, permission = "assessments.view"): Promise<AssessmentRow> {
    const scoped = user ? await assessmentScope(user, permission) : null;
    const row = await this.db.assessment.findFirst({ where: { AND: [{ id }, ...(scoped ? [scoped] : [])] }, include });
    if (!row) throw new HttpError(404, "ASSESSMENT_NOT_FOUND");
    return row;
  }

  /** Grupo abierto y dentro del alcance de `assessments.manage`. */
  private async assertManageableGroup(groupId: string, actor: AuthenticatedUser): Promise<void> {
    const group = await this.db.group.findUnique({ where: { id: groupId }, select: { active: true, closedAt: true } });
    if (!group) throw new HttpError(404, "GROUP_NOT_FOUND");
    await assertGroupInScope(this.db, actor, "assessments.manage", groupId);
    if (group.closedAt) throw new HttpError(409, "GROUP_CLOSED");
    if (!group.active) throw new HttpError(409, "GROUP_INACTIVE");
  }

  private async assertWeights(groupId: string, weight: number, exceptId?: string): Promise<void> {
    const others = await this.db.assessment.findMany({
      where: { groupId, active: true, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { weight: true },
    });
    const total = weightsTotal([...others, { weight }]);
    if (total > 100) throw new HttpError(409, "WEIGHTS_EXCEED_100", { total });
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<AssessmentView>> {
    const { filters } = params;
    const and: Prisma.AssessmentWhereInput[] = [];
    const groupId = filterId(filters, "groupId");
    if (groupId) and.push({ groupId });
    const type = filterEnum(filters, "type", ASSESSMENT_TYPES);
    if (type) and.push({ type });
    const active = filterBool(filters, "active");
    if (active !== undefined) and.push({ active });
    const scoped = await assessmentScope(user, "assessments.view");
    if (scoped) and.push(scoped);
    const orderBy = orderByOf(
      params.sort,
      { name: "name", type: "type", weight: "weight", date: "date", createdAt: "createdAt" },
      [{ date: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]
    );
    const result = await paginatedQuery<AssessmentRow>({
      model: this.db.assessment,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy,
      include,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toView), total: result.total };
  }

  async getById(id: string, user: UserPermissions): Promise<AssessmentView> {
    return toView(await this.load(id, user));
  }

  async create(input: AssessmentCreateInput, actor: AuthenticatedUser): Promise<AssessmentView> {
    await this.assertManageableGroup(input.groupId, actor);
    await this.assertWeights(input.groupId, input.weight);
    return this.db.$transaction(async (tx) => {
      const row = await tx.assessment.create({
        data: {
          groupId: input.groupId,
          name: input.name,
          type: input.type,
          weight: input.weight,
          date: input.date ? toDbDay(input.date) : null,
          maxScore: input.maxScore ?? 100,
        },
        include,
      });
      const view = toView(row);
      await this.audit?.(
        { action: "ASSESSMENT_CREATED", entityType: "Assessment", entityId: row.id, userId: actor.id,
          userName: actor.username, newState: stateOf(view) },
        tx
      );
      return view;
    });
  }

  async update(id: string, input: AssessmentUpdateInput, actor: AuthenticatedUser): Promise<AssessmentView> {
    const previous = await this.load(id, null);
    await this.assertManageableGroup(previous.groupId, actor);
    if (!previous.active) throw new HttpError(409, "ASSESSMENT_INACTIVE");
    if (input.weight !== undefined) await this.assertWeights(previous.groupId, input.weight, id);
    if (input.maxScore !== undefined) {
      const above = await this.db.grade.count({ where: { assessmentId: id, score: { gt: input.maxScore } } });
      if (above > 0) throw new HttpError(409, "MAX_SCORE_BELOW_CAPTURED", { max: input.maxScore });
    }
    const before = toView(previous);
    return this.db.$transaction(async (tx) => {
      const row = await tx.assessment.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.type !== undefined && { type: input.type }),
          ...(input.weight !== undefined && { weight: input.weight }),
          ...(input.date !== undefined && { date: input.date ? toDbDay(input.date) : null }),
          ...(input.maxScore !== undefined && { maxScore: input.maxScore }),
        },
        include,
      });
      const after = toView(row);
      await this.audit?.(
        { action: "ASSESSMENT_UPDATED", entityType: "Assessment", entityId: id, userId: actor.id,
          userName: actor.username, previousState: stateOf(before), newState: stateOf(after) },
        tx
      );
      return after;
    });
  }

  /** Baja lógica: sus calificaciones se conservan pero dejan de contar. */
  async deactivate(id: string, actor: AuthenticatedUser): Promise<AssessmentView> {
    const previous = await this.load(id, null);
    await this.assertManageableGroup(previous.groupId, actor);
    if (!previous.active) throw new HttpError(409, "ASSESSMENT_INACTIVE");
    return this.db.$transaction(async (tx) => {
      const row = await tx.assessment.update({ where: { id }, data: { active: false }, include });
      await this.audit?.(
        { action: "ASSESSMENT_DEACTIVATED", entityType: "Assessment", entityId: id, userId: actor.id,
          userName: actor.username, previousState: { active: true }, newState: { active: false },
          metadata: { groupId: previous.groupId } },
        tx
      );
      return toView(row);
    });
  }
}
