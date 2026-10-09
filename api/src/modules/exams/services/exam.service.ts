import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import { scopeWhere, type UserPermissions } from "@core/permissions";
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
import type { Notifier } from "@core/ports/notification.port";
import { formatInstant } from "@core/utils/format";
import { studentContacts } from "@modules/students";
import { CURRENT_ENROLLMENT, GROUPS_RESOURCE, assertGroupInScope } from "@modules/courses";
import {
  EXAM_STATUSES,
  type ExamCreateInput,
  type ExamDetail,
  type ExamQuestionsInput,
  type ExamUpdateInput,
  type ExamView,
} from "../models/dto/exam.dto";
import { round2 } from "../models/entity/exam-rules";

export const examInclude = {
  group: { select: { nombre: true, courseId: true, course: { select: { nombre: true } }, term: { select: { name: true } } } },
  assessment: { select: { nombre: true } },
  questions: {
    orderBy: { orden: "asc" },
    include: { question: { select: { tipo: true, tema: true, enunciado: true, status: true } } },
  },
  _count: { select: { attempts: true } },
} satisfies Prisma.OnlineExamInclude;

export type ExamRow = Prisma.OnlineExamGetPayload<{ include: typeof examInclude }>;

export const totalOf = (row: { questions: Array<{ puntos: Prisma.Decimal }> }): number =>
  round2(row.questions.reduce((s, q) => s + Number(q.puntos), 0));

export const toExamView = (row: ExamRow): ExamView => ({
  id: row.id,
  groupId: row.groupId,
  groupNombre: row.group.nombre,
  courseId: row.group.courseId,
  courseNombre: row.group.course.nombre,
  termNombre: row.group.term.name,
  titulo: row.titulo,
  instrucciones: row.instrucciones,
  duracionMin: row.duracionMin,
  intentosMax: row.intentosMax,
  fechaApertura: row.fechaApertura.toISOString(),
  fechaCierre: row.fechaCierre.toISOString(),
  aleatorizarPreguntas: row.aleatorizarPreguntas,
  aleatorizarOpciones: row.aleatorizarOpciones,
  mostrarResultado: row.mostrarResultado,
  puntajeAprobatorio: Number(row.puntajeAprobatorio),
  criterioIntentos: row.criterioIntentos,
  assessmentId: row.assessmentId,
  assessmentNombre: row.assessment?.nombre ?? null,
  status: row.status,
  totalPuntos: totalOf(row),
  preguntas: row.questions.length,
  intentos: row._count.attempts,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  closedAt: row.closedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const toDetail = (row: ExamRow): ExamDetail => ({
  ...toExamView(row),
  questions: row.questions.map((q) => ({
    questionId: q.questionId,
    orden: q.orden,
    puntos: Number(q.puntos),
    tipo: q.question.tipo,
    tema: q.question.tema,
    enunciado: q.question.enunciado,
    status: q.question.status,
  })),
});

const stateOf = (v: ExamView): Prisma.InputJsonObject => ({
  titulo: v.titulo,
  duracionMin: v.duracionMin,
  intentosMax: v.intentosMax,
  fechaApertura: v.fechaApertura,
  fechaCierre: v.fechaCierre,
  aleatorizarPreguntas: v.aleatorizarPreguntas,
  aleatorizarOpciones: v.aleatorizarOpciones,
  mostrarResultado: v.mostrarResultado,
  puntajeAprobatorio: v.puntajeAprobatorio,
  criterioIntentos: v.criterioIntentos,
  assessmentId: v.assessmentId,
  status: v.status,
});

/** Lo que se puede tocar con intentos ya iniciados (M15 §4.1). */
const EDITABLE_WITH_ATTEMPTS = new Set(["instrucciones", "fechaCierre", "mostrarResultado"]);

/** Alcance: el profesor ve los exámenes de sus grupos; el alumno, los publicados de sus grupos. */
export const examScope = (user: UserPermissions, permission: string) =>
  scopeWhere<Prisma.OnlineExamWhereInput>(user, {
    resource: GROUPS_RESOURCE,
    permission,
    own: (u) => ({
      status: { not: "BORRADOR" },
      group: { enrollments: { some: { ...CURRENT_ENROLLMENT, student: { userId: u.id } } } },
    }),
    byIds: (ids) => ({ groupId: { in: ids } }),
    or: (filters) => ({ OR: filters }),
    none: { id: { in: [] } },
  });

/**
 * Exámenes en línea (M15): borrador → publicado → cerrado. Con intentos
 * iniciados, preguntas y reglas quedan fijas (`EXAM_PUBLISHED_LOCKED`).
 */
export class ExamService {
  private notifier?: Notifier;

  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  /** Puerto de M19: aviso «examen publicado» a los inscritos del grupo. */
  setNotifier(notifier: Notifier): void {
    this.notifier = notifier;
  }

  async load(id: string, user: UserPermissions | null, permission = "exams.view"): Promise<ExamRow> {
    const scoped = user ? await examScope(user, permission) : null;
    const row = await this.db.onlineExam.findFirst({ where: { AND: [{ id }, ...(scoped ? [scoped] : [])] }, include: examInclude });
    if (!row) throw new HttpError(404, "EXAM_NOT_FOUND");
    return row;
  }

  /** Examen administrable por la persona (fuera de su ámbito → 403). */
  private async manageable(id: string, actor: AuthenticatedUser, permission = "exams.manage"): Promise<ExamRow> {
    const row = await this.load(id, null);
    await assertGroupInScope(this.db, actor, permission, row.groupId);
    return row;
  }

  private async assertAssessment(assessmentId: string | null | undefined, groupId: string, examId?: string): Promise<void> {
    if (!assessmentId) return;
    const assessment = await this.db.assessment.findUnique({
      where: { id: assessmentId },
      select: { groupId: true, active: true, onlineExam: { select: { id: true } } },
    });
    if (!assessment || assessment.groupId !== groupId || !assessment.active) throw new HttpError(400, "EXAM_ASSESSMENT_INVALID");
    if (assessment.onlineExam && assessment.onlineExam.id !== examId) throw new HttpError(409, "EXAM_ASSESSMENT_TAKEN");
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<ExamView>> {
    const { filters } = params;
    const and: Prisma.OnlineExamWhereInput[] = [];
    const groupId = filterId(filters, "groupId");
    if (groupId) and.push({ groupId });
    const status = filterEnum(filters, "status", EXAM_STATUSES);
    if (status) and.push({ status });
    const titulo = filterText(filters, "titulo");
    if (titulo) and.push({ titulo });
    const scoped = await examScope(user, "exams.view");
    if (scoped) and.push(scoped);
    const result = await paginatedQuery<ExamRow>({
      model: this.db.onlineExam,
      where: (and.length ? { AND: and } : {}) as Record<string, unknown>,
      orderBy: orderByOf(
        params.sort,
        { titulo: "titulo", fechaApertura: "fechaApertura", fechaCierre: "fechaCierre", status: "status", createdAt: "createdAt" },
        [{ fechaApertura: "desc" }]
      ),
      include: examInclude,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toExamView), total: result.total };
  }

  async getById(id: string, user: UserPermissions): Promise<ExamDetail> {
    return toDetail(await this.load(id, user));
  }

  async create(input: ExamCreateInput, actor: AuthenticatedUser): Promise<ExamDetail> {
    const group = await this.db.group.findUnique({ where: { id: input.groupId }, select: { active: true, closedAt: true } });
    if (!group) throw new HttpError(400, "GROUP_NOT_FOUND");
    await assertGroupInScope(this.db, actor, "exams.manage", input.groupId);
    if (!group.active) throw new HttpError(409, "GROUP_INACTIVE");
    if (group.closedAt) throw new HttpError(409, "GROUP_CLOSED");
    await this.assertAssessment(input.assessmentId, input.groupId);
    return this.db.$transaction(async (tx) => {
      const row = await tx.onlineExam.create({
        data: {
          ...input,
          instrucciones: input.instrucciones ?? null,
          assessmentId: input.assessmentId ?? null,
          fechaApertura: new Date(input.fechaApertura),
          fechaCierre: new Date(input.fechaCierre),
          createdBy: actor.id,
        },
        include: examInclude,
      });
      const view = toExamView(row);
      await this.audit?.(
        { action: "EXAM_CREATED", entityType: "OnlineExam", entityId: row.id, userId: actor.id, userName: actor.username,
          newState: { groupId: row.groupId, ...stateOf(view) } },
        tx
      );
      return toDetail(row);
    });
  }

  async update(id: string, input: ExamUpdateInput, actor: AuthenticatedUser): Promise<ExamDetail> {
    const previous = await this.manageable(id, actor);
    if (previous.status === "CERRADO") throw new HttpError(409, "EXAM_NOT_EDITABLE");
    if (previous._count.attempts > 0 && Object.keys(input).some((key) => !EDITABLE_WITH_ATTEMPTS.has(key))) {
      throw new HttpError(409, "EXAM_PUBLISHED_LOCKED");
    }
    const apertura = input.fechaApertura ? new Date(input.fechaApertura) : previous.fechaApertura;
    const cierre = input.fechaCierre ? new Date(input.fechaCierre) : previous.fechaCierre;
    if (apertura >= cierre) throw new HttpError(400, "INVALID_RANGE");
    if (input.assessmentId !== undefined) await this.assertAssessment(input.assessmentId, previous.groupId, id);
    const total = totalOf(previous);
    const aprobatorio = input.puntajeAprobatorio ?? Number(previous.puntajeAprobatorio);
    if (previous.status === "PUBLICADO" && aprobatorio > total) {
      throw new HttpError(400, "EXAM_SCORE_INVALID", { aprobatorio, total });
    }
    const before = toExamView(previous);
    return this.db.$transaction(async (tx) => {
      const row = await tx.onlineExam.update({
        where: { id },
        data: {
          ...input,
          ...(input.fechaApertura && { fechaApertura: apertura }),
          ...(input.fechaCierre && { fechaCierre: cierre }),
        },
        include: examInclude,
      });
      const after = toExamView(row);
      await this.audit?.(
        { action: "EXAM_UPDATED", entityType: "OnlineExam", entityId: id, userId: actor.id, userName: actor.username,
          previousState: stateOf(before), newState: stateOf(after) },
        tx
      );
      return toDetail(row);
    });
  }

  /** Fija (reemplaza) las preguntas: activas y del curso del grupo; puntos por examen. */
  async setQuestions(id: string, input: ExamQuestionsInput, actor: AuthenticatedUser): Promise<ExamDetail> {
    const exam = await this.manageable(id, actor);
    if (exam.status === "CERRADO") throw new HttpError(409, "EXAM_NOT_EDITABLE");
    if (exam._count.attempts > 0) throw new HttpError(409, "EXAM_PUBLISHED_LOCKED");
    const ids = input.questions.map((q) => q.questionId);
    const questions = await this.db.question.findMany({
      where: { id: { in: ids }, status: "ACTIVA", courseId: exam.group.courseId },
      select: { id: true, puntos: true },
    });
    if (questions.length !== ids.length) throw new HttpError(400, "EXAM_QUESTION_INVALID");
    const byId = new Map(questions.map((q) => [q.id, q]));
    const before = exam.questions.map((q) => ({ questionId: q.questionId, puntos: Number(q.puntos) }));
    return this.db.$transaction(async (tx) => {
      await tx.onlineExamQuestion.deleteMany({ where: { examId: id } });
      await tx.onlineExamQuestion.createMany({
        data: input.questions.map((q, i) => ({
          examId: id,
          questionId: q.questionId,
          puntos: q.puntos ?? Number(byId.get(q.questionId)?.puntos ?? 1),
          orden: i + 1,
        })),
      });
      const row = await tx.onlineExam.findUniqueOrThrow({ where: { id }, include: examInclude });
      await this.audit?.(
        { action: "EXAM_QUESTIONS_SET", entityType: "OnlineExam", entityId: id, userId: actor.id, userName: actor.username,
          previousState: { questions: before },
          newState: { questions: row.questions.map((q) => ({ questionId: q.questionId, puntos: Number(q.puntos) })), total: totalOf(row) } },
        tx
      );
      return toDetail(row);
    });
  }

  async removeQuestion(id: string, questionId: string, actor: AuthenticatedUser): Promise<ExamDetail> {
    const exam = await this.load(id, null);
    return this.setQuestions(
      id,
      { questions: exam.questions.filter((q) => q.questionId !== questionId).map((q) => ({ questionId: q.questionId, puntos: Number(q.puntos) })) },
      actor
    );
  }

  /** BORRADOR → PUBLICADO con preguntas activas y aprobatorio ≤ total. */
  async publish(id: string, actor: AuthenticatedUser): Promise<ExamDetail> {
    const exam = await this.manageable(id, actor, "exams.publish");
    if (exam.status !== "BORRADOR") throw new HttpError(409, "EXAM_ALREADY_PUBLISHED");
    if (exam.questions.length === 0) throw new HttpError(409, "EXAM_NO_QUESTIONS");
    if (exam.questions.some((q) => q.question.status !== "ACTIVA")) throw new HttpError(409, "EXAM_QUESTION_INVALID");
    const total = totalOf(exam);
    const aprobatorio = Number(exam.puntajeAprobatorio);
    if (aprobatorio > total) throw new HttpError(400, "EXAM_SCORE_INVALID", { aprobatorio, total });
    if (exam.fechaCierre <= new Date()) throw new HttpError(400, "INVALID_RANGE");
    return this.db.$transaction(async (tx) => {
      const row = await tx.onlineExam.update({ where: { id }, data: { status: "PUBLICADO", publishedAt: new Date() }, include: examInclude });
      await this.audit?.(
        { action: "EXAM_PUBLISHED", entityType: "OnlineExam", entityId: id, userId: actor.id, userName: actor.username,
          previousState: { status: "BORRADOR" }, newState: { status: "PUBLICADO", total, preguntas: row.questions.length } },
        tx
      );
      if (this.notifier) {
        const enrolled = await tx.enrollment.findMany({ where: { groupId: row.groupId, status: "INSCRITO" }, select: { studentId: true } });
        for (const { studentId } of enrolled) {
          const contacts = await studentContacts(tx, studentId);
          if (!contacts) continue;
          await this.notifier(
            {
              clave: "EXAMEN_PUBLICADO",
              recipients: contacts.recipients,
              payload: {
                nombre: contacts.nombre,
                examen: row.titulo,
                curso: row.group.course.nombre,
                apertura: formatInstant(row.fechaApertura),
                cierre: formatInstant(row.fechaCierre),
              },
              idempotencyKey: `EXAMEN_PUBLICADO:${row.id}:${studentId}`,
            },
            tx
          );
        }
      }
      return toDetail(row);
    });
  }

  /** Solo un borrador se elimina (sin intentos posibles); lo publicado se cierra. */
  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const exam = await this.manageable(id, actor);
    if (exam.status !== "BORRADOR") throw new HttpError(409, "EXAM_DRAFT_ONLY");
    await this.db.$transaction(async (tx) => {
      await tx.onlineExam.delete({ where: { id } });
      await this.audit?.(
        { action: "EXAM_DELETED", entityType: "OnlineExam", entityId: id, userId: actor.id, userName: actor.username,
          previousState: { titulo: exam.titulo, status: exam.status } },
        tx
      );
    });
  }

  /** Para el cierre (lo coordina el servicio de intentos, que termina los abiertos). */
  async assertClosable(id: string, actor: AuthenticatedUser): Promise<ExamRow> {
    const exam = await this.manageable(id, actor);
    if (exam.status !== "PUBLICADO") throw new HttpError(409, exam.status === "CERRADO" ? "EXAM_NOT_EDITABLE" : "EXAM_NOT_PUBLISHED");
    return exam;
  }

  detail(row: ExamRow): ExamDetail {
    return toDetail(row);
  }
}
