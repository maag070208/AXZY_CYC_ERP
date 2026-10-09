import { Prisma, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { paginatedQuery } from "@core/db/table";
import { HttpError } from "@core/middlewares/error.middleware";
import { filterBool, filterEnum, filterText, orderByOf, type ITDataTableFetchParams, type ITDataTableResponse } from "@core/utils/table";
import type { AuthenticatedUser } from "@core/utils/security";
import type { AuditLogger } from "@modules/audit";
import { PERIOD_TYPES, monthsPerPeriod } from "../models/entity/program-rules";import type { ProgramCreateInput, ProgramDetailView, ProgramSubjectsInput, ProgramUpdateInput, ProgramView } from "../models/dto/program.dto";

type ProgramRow = Prisma.ProgramGetPayload<{ include: { subjects: { include: { course: { select: { clave: true; nombre: true } } } }; _count: { select: { subjects: true; plans: true } } } }>;

const include = {
  subjects: { include: { course: { select: { clave: true, nombre: true } } }, orderBy: [{ periodIndex: "asc" }, { sortOrder: "asc" }] },
  _count: { select: { subjects: true, plans: true } },
} satisfies Prisma.ProgramInclude;

const toView = (row: ProgramRow): ProgramView => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description,
  periodType: row.periodType,
  periodCount: row.periodCount,
  monthsPerPeriod: monthsPerPeriod(row.periodType, row.monthsPerPeriod),
  monthlyFee: Number(row.monthlyFee),
  enrollmentFee: Number(row.enrollmentFee),
  active: row.active,
  subjects: row._count.subjects,
  plans: row._count.plans,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toDetail = (row: ProgramRow): ProgramDetailView => ({
  ...toView(row),
  subjectsList: row.subjects.map((s) => ({
    id: s.id,
    courseId: s.courseId,
    courseCode: s.course.clave,
    courseName: s.course.nombre,
    periodIndex: s.periodIndex,
    sortOrder: s.sortOrder,
  })),
});

/** M22 — carreras (programas) y su plan de estudios. */
export class ProgramService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private async load(id: string): Promise<ProgramRow> {
    const row = await this.db.program.findUnique({ where: { id }, include });
    if (!row) throw new HttpError(404, "PROGRAM_NOT_FOUND");
    return row;
  }

  async table(params: ITDataTableFetchParams): Promise<ITDataTableResponse<ProgramView>> {
    const and: Prisma.ProgramWhereInput[] = [];
    const code = filterText(params.filters, "code");
    if (code) and.push({ code });
    const name = filterText(params.filters, "name");
    if (name) and.push({ name });
    const active = filterBool(params.filters, "active");
    if (active !== undefined) and.push({ active });
    const periodType = filterEnum(params.filters, "periodType", PERIOD_TYPES);
    if (periodType) and.push({ periodType });

    const orderBy = orderByOf(params.sort, { code: "code", name: "name", createdAt: "createdAt" }, [{ code: "asc" }]).flat();
    const result = await paginatedQuery<ProgramRow>({ model: this.db.program, where: { AND: and }, orderBy, include, page: params.page, limit: params.limit });
    return { data: result.data.map(toView), total: result.total };
  }

  async getById(id: string): Promise<ProgramDetailView> {
    return toDetail(await this.load(id));
  }

  async create(input: ProgramCreateInput, actor: AuthenticatedUser): Promise<ProgramDetailView> {
    try {
      const row = await this.db.program.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          periodType: input.periodType,
          periodCount: input.periodCount,
          monthsPerPeriod: input.monthsPerPeriod ?? null,
          monthlyFee: input.monthlyFee,
          enrollmentFee: input.enrollmentFee,
        },
        include,
      });
      await this.audit?.({ action: "PROGRAM_CREATED", entityType: "Program", entityId: row.id, userId: actor.id, userName: actor.username, newState: toView(row) });
      return toDetail(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "PROGRAM_CODE_TAKEN");
      throw error;
    }
  }

  async update(id: string, input: ProgramUpdateInput, actor: AuthenticatedUser): Promise<ProgramDetailView> {
    const previous = await this.load(id);
    const row = await this.db.program.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.periodType !== undefined ? { periodType: input.periodType } : {}),
        ...(input.periodCount !== undefined ? { periodCount: input.periodCount } : {}),
        ...(input.monthsPerPeriod !== undefined ? { monthsPerPeriod: input.monthsPerPeriod ?? null } : {}),
        ...(input.monthlyFee !== undefined ? { monthlyFee: input.monthlyFee } : {}),
        ...(input.enrollmentFee !== undefined ? { enrollmentFee: input.enrollmentFee } : {}),
      },
      include,
    });
    await this.audit?.({ action: "PROGRAM_UPDATED", entityType: "Program", entityId: id, userId: actor.id, userName: actor.username, previousState: toView(previous), newState: toView(row) });
    return toDetail(row);
  }

  async setActive(id: string, active: boolean, actor: AuthenticatedUser): Promise<ProgramDetailView> {
    await this.load(id);
    const row = await this.db.program.update({ where: { id }, data: { active }, include });
    await this.audit?.({ action: active ? "PROGRAM_REACTIVATED" : "PROGRAM_DEACTIVATED", entityType: "Program", entityId: id, userId: actor.id, userName: actor.username, newState: { active } });
    return toDetail(row);
  }

  async replaceSubjects(id: string, input: ProgramSubjectsInput, actor: AuthenticatedUser): Promise<ProgramDetailView> {
    const program = await this.load(id);
    const outOfRange = input.subjects.find((s) => s.periodIndex > program.periodCount);
    if (outOfRange) throw new HttpError(400, "PROGRAM_PERIOD_OUT_OF_RANGE", { max: program.periodCount });
    const courses = await this.db.course.findMany({ where: { id: { in: input.subjects.map((s) => s.courseId) } }, select: { id: true } });
    if (courses.length !== new Set(input.subjects.map((s) => s.courseId)).size) throw new HttpError(400, "INVALID_REFERENCE");

    await this.db.$transaction(async (tx) => {
      await tx.programSubject.deleteMany({ where: { programId: id } });
      if (input.subjects.length > 0) {
        await tx.programSubject.createMany({ data: input.subjects.map((s) => ({ programId: id, courseId: s.courseId, periodIndex: s.periodIndex, sortOrder: s.sortOrder })) });
      }
      await this.audit?.({ action: "PROGRAM_SUBJECTS_UPDATED", entityType: "Program", entityId: id, userId: actor.id, userName: actor.username, newState: { subjects: input.subjects.length } }, tx);
    });
    return this.getById(id);
  }
}
