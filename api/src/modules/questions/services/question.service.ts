import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import { serializable } from "@core/db/serializable";
import { once } from "@core/db/idempotency";
import { scopeOf, scopeWhere, type UserPermissions } from "@core/permissions";
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
import { GROUPS_RESOURCE } from "@modules/courses";
import type { ImportResult, QuestionCreateInput, QuestionUpdateInput, QuestionView } from "../models/dto/question.dto";
import { DIFFICULTIES, QUESTION_TYPES, optionRuleError, readQuestionsCsv } from "../models/entity/question-rules";

const include = {
  course: { select: { clave: true, nombre: true } },
  options: { orderBy: { orden: "asc" } },
  _count: { select: { examQuestions: true, answers: true } },
} satisfies Prisma.QuestionInclude;

type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof include }>;

const toView = (row: QuestionRow): QuestionView => ({
  id: row.id,
  courseId: row.courseId,
  courseClave: row.course.clave,
  courseNombre: row.course.nombre,
  tema: row.tema,
  tipo: row.tipo,
  enunciado: row.enunciado,
  puntos: Number(row.puntos),
  dificultad: row.dificultad,
  status: row.status,
  options: row.options.map((o) => ({ id: o.id, texto: o.texto, esCorrecta: o.esCorrecta, orden: o.orden })),
  usedInExams: row._count.examQuestions,
  locked: row._count.answers > 0,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const stateOf = (v: QuestionView): Prisma.InputJsonObject => ({
  tema: v.tema,
  tipo: v.tipo,
  enunciado: v.enunciado,
  puntos: v.puntos,
  dificultad: v.dificultad,
  status: v.status,
  options: v.options.map((o) => ({ texto: o.texto, esCorrecta: o.esCorrecta })),
});

/** Alcance por curso: el profesor ve los reactivos de los cursos de sus grupos. */
export const questionScope = (user: UserPermissions, permission: string) =>
  scopeWhere<Prisma.QuestionWhereInput>(user, {
    resource: GROUPS_RESOURCE,
    permission,
    own: (u) => ({ course: { groups: { some: { teacher: { userId: u.id } } } } }),
    byIds: (ids) => ({ course: { groups: { some: { id: { in: ids } } } } }),
    or: (filters) => ({ OR: filters }),
    none: { id: { in: [] } },
  });

const MAX_IMPORT_ROWS = 1000;

/**
 * Banco de reactivos (M14). Una pregunta ya respondida en un intento queda
 * bloqueada (`QUESTION_IN_USE`): se conserva tal cual para que la calificación
 * sea reproducible y solo se puede desactivar.
 */
export class QuestionService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private async load(id: string, user: UserPermissions, permission: string): Promise<QuestionRow> {
    const scoped = await questionScope(user, permission);
    const row = await this.db.question.findFirst({ where: { AND: [{ id }, ...(scoped ? [scoped] : [])] }, include });
    if (!row) throw new HttpError(404, "QUESTION_NOT_FOUND");
    return row;
  }

  /** Curso activo y dentro del alcance del permiso (fuera → 403). */
  private async assertCourse(courseId: string, user: UserPermissions, permission: string): Promise<void> {
    const course = await this.db.course.findUnique({ where: { id: courseId }, select: { active: true } });
    if (!course) throw new HttpError(400, "COURSE_NOT_FOUND");
    if (!course.active) throw new HttpError(409, "COURSE_INACTIVE");
    if (scopeOf(user, permission) === "ALL") return;
    const allowed = await this.db.course.count({
      where: { id: courseId, groups: { some: { teacher: { userId: user.id } } } },
    });
    if (!allowed) throw new HttpError(403, "INSUFFICIENT_PERMISSIONS");
  }

  private assertOptions(tipo: (typeof QUESTION_TYPES)[number], options: Array<{ texto: string; esCorrecta: boolean }>): void {
    const error = optionRuleError(tipo, options);
    if (error) throw new HttpError(400, error);
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<QuestionView>> {
    const { filters } = params;
    const and: Prisma.QuestionWhereInput[] = [];
    const courseId = filterId(filters, "courseId");
    if (courseId) and.push({ courseId });
    const tipo = filterEnum(filters, "tipo", QUESTION_TYPES);
    if (tipo) and.push({ tipo });
    const dificultad = filterEnum(filters, "dificultad", DIFFICULTIES);
    if (dificultad) and.push({ dificultad });
    const status = filterEnum(filters, "status", ["ACTIVA", "INACTIVA"] as const);
    if (status) and.push({ status });
    const tema = filterText(filters, "tema");
    if (tema) and.push({ tema });
    const enunciado = filterText(filters, "enunciado");
    if (enunciado) and.push({ enunciado });
    const scoped = await questionScope(user, "questions.view");
    if (scoped) and.push(scoped);
    const result = await paginatedQuery<QuestionRow>({
      model: this.db.question,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy: orderByOf(
        params.sort,
        { tema: "tema", tipo: "tipo", puntos: "puntos", dificultad: "dificultad", status: "status", createdAt: "createdAt" },
        [{ createdAt: "desc" }]
      ),
      include,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toView), total: result.total };
  }

  async getById(id: string, user: UserPermissions): Promise<QuestionView> {
    return toView(await this.load(id, user, "questions.view"));
  }

  async create(input: QuestionCreateInput, actor: AuthenticatedUser): Promise<QuestionView> {
    await this.assertCourse(input.courseId, actor, "questions.create");
    this.assertOptions(input.tipo, input.options);
    return this.db.$transaction(async (tx) => {
      const row = await tx.question.create({
        data: {
          courseId: input.courseId,
          tema: input.tema ?? null,
          tipo: input.tipo,
          enunciado: input.enunciado,
          puntos: input.puntos,
          dificultad: input.dificultad ?? null,
          createdBy: actor.id,
          options: { create: input.options.map((o, i) => ({ texto: o.texto, esCorrecta: o.esCorrecta, orden: i + 1 })) },
        },
        include,
      });
      const view = toView(row);
      await this.audit?.(
        { action: "QUESTION_CREATED", entityType: "Question", entityId: row.id, userId: actor.id, userName: actor.username,
          newState: { courseId: view.courseId, ...stateOf(view) } },
        tx
      );
      return view;
    });
  }

  async update(id: string, input: QuestionUpdateInput, actor: AuthenticatedUser): Promise<QuestionView> {
    const previous = await this.load(id, actor, "questions.edit");
    const before = toView(previous);
    if (before.locked) throw new HttpError(409, "QUESTION_IN_USE");
    const tipo = input.tipo ?? previous.tipo;
    const options = input.options ?? (input.tipo && input.tipo !== previous.tipo ? [] : before.options);
    this.assertOptions(tipo, options);
    return this.db.$transaction(async (tx) => {
      if (input.options !== undefined || input.tipo !== undefined) {
        await tx.questionOption.deleteMany({ where: { questionId: id } });
        await tx.questionOption.createMany({
          data: options.map((o, i) => ({ questionId: id, texto: o.texto, esCorrecta: o.esCorrecta, orden: i + 1 })),
        });
      }
      const row = await tx.question.update({
        where: { id },
        data: {
          ...(input.tema !== undefined && { tema: input.tema }),
          ...(input.tipo !== undefined && { tipo: input.tipo }),
          ...(input.enunciado !== undefined && { enunciado: input.enunciado }),
          ...(input.puntos !== undefined && { puntos: input.puntos }),
          ...(input.dificultad !== undefined && { dificultad: input.dificultad }),
        },
        include,
      });
      const after = toView(row);
      await this.audit?.(
        { action: "QUESTION_UPDATED", entityType: "Question", entityId: id, userId: actor.id, userName: actor.username,
          previousState: stateOf(before), newState: stateOf(after) },
        tx
      );
      return after;
    });
  }

  /** Baja lógica (nunca `DELETE`): ya no se puede agregar a exámenes nuevos. */
  async setStatus(id: string, active: boolean, actor: AuthenticatedUser): Promise<QuestionView> {
    const previous = await this.load(id, actor, "questions.edit");
    if (!active && previous.status === "INACTIVA") throw new HttpError(409, "QUESTION_ALREADY_INACTIVE");
    if (active && previous.status === "ACTIVA") throw new HttpError(409, "QUESTION_INACTIVE");
    return this.db.$transaction(async (tx) => {
      const row = await tx.question.update({ where: { id }, data: { status: active ? "ACTIVA" : "INACTIVA" }, include });
      await this.audit?.(
        { action: active ? "QUESTION_REACTIVATED" : "QUESTION_DEACTIVATED", entityType: "Question", entityId: id,
          userId: actor.id, userName: actor.username,
          previousState: { status: previous.status }, newState: { status: row.status } },
        tx
      );
      return toView(row);
    });
  }

  /**
   * Importación CSV (M14 §4.9). `preview` valida todo y no guarda; aplicar
   * exige `Idempotency-Key` y repite la misma respuesta si se reenvía.
   */
  async import(csv: string, actor: AuthenticatedUser, options: { preview: boolean; idempotencyKey?: string }): Promise<ImportResult> {
    let parsed: ReturnType<typeof readQuestionsCsv>;
    try {
      parsed = readQuestionsCsv(csv);
    } catch (error) {
      throw new HttpError(400, "CSV_INVALID", { reason: error instanceof Error ? error.message : "formato" });
    }
    if (parsed.total > MAX_IMPORT_ROWS) throw new HttpError(400, "CSV_INVALID", { reason: `máximo ${MAX_IMPORT_ROWS} filas` });
    if (!options.preview && !options.idempotencyKey) throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY");

    // Cursos por clave: activos y dentro del alcance de `questions.import`.
    const claves = [...new Set(parsed.rows.map((r) => r.cursoClave))];
    const all = scopeOf(actor, "questions.import") === "ALL";
    const courses = await this.db.course.findMany({
      where: {
        clave: { in: claves },
        active: true,
        ...(all ? {} : { groups: { some: { teacher: { userId: actor.id } } } }),
      },
      select: { id: true, clave: true },
    });
    const courseByClave = new Map(courses.map((c) => [c.clave, c.id]));
    const rejected = [...parsed.rejected];
    const valid = parsed.rows.filter((r) => {
      if (courseByClave.has(r.cursoClave)) return true;
      rejected.push({ row: r.row, code: "COURSE_NOT_FOUND", message: `curso ${r.cursoClave} inexistente, inactivo o fuera de tu alcance` });
      return false;
    });
    rejected.sort((a, b) => a.row - b.row);
    const sample = valid.slice(0, 20).map((r) => ({
      row: r.row, curso: r.cursoClave, tipo: r.tipo, enunciado: r.enunciado.slice(0, 140), puntos: r.puntos, opciones: r.options.length,
    }));
    const base = { total: parsed.total, valid: valid.length, rejected, sample };
    if (options.preview) return { preview: true, created: 0, ...base };

    const { result } = await serializable((tx) =>
      once(tx, options.idempotencyKey, { userId: actor.id, scope: "questions.import" }, async () => {
        for (const r of valid) {
          await tx.question.create({
            data: {
              courseId: courseByClave.get(r.cursoClave) as string,
              tema: r.tema,
              tipo: r.tipo,
              enunciado: r.enunciado,
              puntos: r.puntos,
              dificultad: r.dificultad,
              createdBy: actor.id,
              options: { create: r.options.map((o) => ({ texto: o.texto, esCorrecta: o.esCorrecta, orden: o.orden })) },
            },
          });
        }
        await this.audit?.(
          { action: "QUESTIONS_IMPORTED", entityType: "Question", userId: actor.id, userName: actor.username,
            metadata: { total: parsed.total, created: valid.length, rejected: rejected.length, cursos: claves } },
          tx
        );
        return { preview: false, created: valid.length, ...base } as ImportResult;
      })
    );
    return result;
  }
}
