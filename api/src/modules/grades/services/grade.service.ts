import * as XLSX from "xlsx";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedQuery } from "@core/db/table";
import { scopeWhere, type UserPermissions } from "@core/permissions";
import type { AuthenticatedUser } from "@core/utils/security";
import { filterId, orderByOf, type ITDataTableFetchParams, type ITDataTableResponse } from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import { CURRENT_ENROLLMENT, GROUPS_RESOURCE, assertGroupInScope, enrollmentScope, groupScope } from "@modules/courses";
import type { KardexEntry } from "@modules/documents/models/dto/document.dto";
import { fullName } from "@modules/students/services/student.service";
import type { Gradebook, GradeCaptureInput, GradeView } from "../models/dto/grade.dto";
import { finalGradeOf, resultOf, round2, scoreInRange, weightsComplete, weightsTotal } from "../models/entity/grading";

const studentSelect = { matricula: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true } as const;

const gradeInclude = {
  assessment: { select: { nombre: true } },
  enrollment: { select: { studentId: true, student: { select: studentSelect } } },
} satisfies Prisma.GradeInclude;

type GradeRow = Prisma.GradeGetPayload<{ include: typeof gradeInclude }>;

const toGradeView = (row: GradeRow): GradeView => ({
  id: row.id,
  assessmentId: row.assessmentId,
  assessmentNombre: row.assessment.nombre,
  enrollmentId: row.enrollmentId,
  studentId: row.enrollment.studentId,
  matricula: row.enrollment.student.matricula,
  studentNombre: fullName(row.enrollment.student),
  score: row.score === null ? null : Number(row.score),
  observaciones: row.observaciones,
  capturedBy: row.capturedBy,
  capturedAt: row.capturedAt?.toISOString() ?? null,
});

const gradeScope = (user: UserPermissions, permission: string) =>
  scopeWhere<Prisma.GradeWhereInput>(user, {
    resource: GROUPS_RESOURCE,
    permission,
    own: (u) => ({ enrollment: { student: { userId: u.id } } }),
    byIds: (ids) => ({ enrollment: { groupId: { in: ids } } }),
    or: (filters) => ({ OR: filters }),
    none: { id: { in: [] } },
  });

const sameScore = (a: Prisma.Decimal | null, b: number | null): boolean =>
  a === null || b === null ? a === b : a.equals(b);

/**
 * Calificaciones (M08): captura manual individual o en lote (upsert por
 * `(assessmentId, enrollmentId)`), libro de calificaciones con proyección de
 * la final, cierre del grupo (escribe la final y el estatus de cada
 * inscripción) y la fuente académica del kardex (M06).
 */
export class GradeService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private async threshold(): Promise<number> {
    const row = await this.db.setting.findUnique({ where: { key: "MIN_PASSING_GRADE" } });
    const value = Number(row?.value ?? 70);
    return Number.isFinite(value) ? value : 70;
  }

  // --- captura ------------------------------------------------------------------

  async capture(assessmentId: string, input: GradeCaptureInput, actor: AuthenticatedUser): Promise<GradeView[]> {
    const assessment = await this.db.assessment.findUnique({
      where: { id: assessmentId },
      include: { group: { select: { id: true, closedAt: true } } },
    });
    if (!assessment) throw new HttpError(404, "ASSESSMENT_NOT_FOUND");
    await assertGroupInScope(this.db, actor, "grades.capture", assessment.groupId);
    if (!assessment.active) throw new HttpError(409, "ASSESSMENT_INACTIVE");
    if (assessment.group.closedAt) throw new HttpError(409, "GROUP_CLOSED");

    const max = Number(assessment.maxScore);
    for (const row of input.grades) {
      if (row.score !== null && !scoreInRange(row.score, assessment.maxScore)) {
        throw new HttpError(400, "SCORE_OUT_OF_RANGE", { max }, { enrollmentId: row.enrollmentId });
      }
    }
    const ids = input.grades.map((g) => g.enrollmentId);
    const enrollments = await this.db.enrollment.findMany({
      where: { id: { in: ids } },
      select: { id: true, groupId: true, status: true },
    });
    const byId = new Map(enrollments.map((e) => [e.id, e]));
    for (const id of ids) {
      const enrollment = byId.get(id);
      if (!enrollment || enrollment.groupId !== assessment.groupId) {
        throw new HttpError(400, "ENROLLMENT_NOT_IN_GROUP", {}, { enrollmentId: id });
      }
      if (enrollment.status !== "INSCRITO") throw new HttpError(409, "NOT_ENROLLED", {}, { enrollmentId: id });
    }

    const now = new Date();
    const actorFields = { userId: actor.id, userName: actor.username };
    await this.db.$transaction(async (tx) => {
      const existing = await tx.grade.findMany({ where: { assessmentId, enrollmentId: { in: ids } } });
      const previous = new Map(existing.map((g) => [g.enrollmentId, g]));
      for (const row of input.grades) {
        const before = previous.get(row.enrollmentId);
        const observaciones = row.observaciones === undefined ? (before?.observaciones ?? null) : row.observaciones;
        if (!before) {
          if (row.score === null && !observaciones) continue;
          const created = await tx.grade.create({
            data: {
              assessmentId,
              enrollmentId: row.enrollmentId,
              score: row.score,
              observaciones,
              capturedBy: actor.id,
              capturedAt: now,
            },
          });
          await this.audit?.(
            { action: "GRADE_CAPTURED", entityType: "Grade", entityId: created.id, ...actorFields,
              newState: { score: row.score, observaciones },
              metadata: { assessmentId, enrollmentId: row.enrollmentId } },
            tx
          );
          continue;
        }
        if (sameScore(before.score, row.score) && before.observaciones === observaciones) continue;
        await tx.grade.update({
          where: { id: before.id },
          data: { score: row.score, observaciones, capturedBy: actor.id, capturedAt: now },
        });
        const cleared = before.score !== null && row.score === null;
        await this.audit?.(
          {
            action: cleared ? "GRADE_CLEARED" : before.score === null ? "GRADE_CAPTURED" : "GRADE_UPDATED",
            entityType: "Grade",
            entityId: before.id,
            ...actorFields,
            previousState: {
              score: before.score === null ? null : Number(before.score),
              observaciones: before.observaciones,
            },
            newState: { score: row.score, observaciones },
            metadata: { assessmentId, enrollmentId: row.enrollmentId },
          },
          tx
        );
      }
    });

    const rows = await this.db.grade.findMany({
      where: { assessmentId, enrollmentId: { in: ids } },
      include: gradeInclude,
    });
    return rows.map(toGradeView);
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<GradeView>> {
    const { filters } = params;
    const and: Prisma.GradeWhereInput[] = [];
    const assessmentId = filterId(filters, "assessmentId");
    if (assessmentId) and.push({ assessmentId });
    const enrollmentId = filterId(filters, "enrollmentId");
    if (enrollmentId) and.push({ enrollmentId });
    const groupId = filterId(filters, "groupId");
    if (groupId) and.push({ assessment: { groupId } });
    const studentId = filterId(filters, "studentId");
    if (studentId) and.push({ enrollment: { studentId } });
    and.push({ assessment: { active: true } });
    const scoped = await gradeScope(user, "grades.view");
    if (scoped) and.push(scoped);
    const orderBy = orderByOf(
      params.sort,
      {
        score: "score",
        capturedAt: "capturedAt",
        nombre: (direction) => ({ enrollment: { student: { apellidoPaterno: direction } } }),
      },
      [{ enrollment: { student: { apellidoPaterno: "asc" } } }, { assessment: { createdAt: "asc" } }]
    );
    const result = await paginatedQuery<GradeRow>({
      model: this.db.grade,
      where: { AND: and } as Record<string, unknown>,
      orderBy,
      include: gradeInclude,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toGradeView), total: result.total };
  }

  // --- libro de calificaciones ---------------------------------------------------

  private async buildGradebook(
    client: PrismaClient | Prisma.TransactionClient,
    groupId: string,
    enrollmentFilter: Prisma.EnrollmentWhereInput | null
  ): Promise<Gradebook> {
    const group = await client.group.findUnique({
      where: { id: groupId },
      include: {
        course: { select: { nombre: true } },
        term: { select: { name: true } },
        teacher: { select: { nombres: true, apellidos: true } },
        assessments: { where: { active: true }, orderBy: [{ fecha: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] },
      },
    });
    if (!group) throw new HttpError(404, "GROUP_NOT_FOUND");
    const enrollments = await client.enrollment.findMany({
      where: { AND: [{ groupId, ...CURRENT_ENROLLMENT }, ...(enrollmentFilter ? [enrollmentFilter] : [])] },
      include: {
        student: { select: studentSelect },
        grades: { where: { assessment: { active: true } } },
      },
      orderBy: [{ student: { apellidoPaterno: "asc" } }, { student: { apellidoMaterno: "asc" } }, { student: { nombres: "asc" } }],
    });
    const threshold = await this.threshold();
    const items = group.assessments.map((a) => ({ id: a.id, ponderacion: a.ponderacion, maxScore: a.maxScore }));
    const complete100 = weightsComplete(items);

    const students = enrollments.map((enrollment) => {
      const scores: Record<string, number | null> = {};
      const observaciones: Record<string, string | null> = {};
      for (const a of group.assessments) {
        scores[a.id] = null;
        observaciones[a.id] = null;
      }
      for (const grade of enrollment.grades) {
        scores[grade.assessmentId] = grade.score === null ? null : Number(grade.score);
        observaciones[grade.assessmentId] = grade.observaciones;
      }
      const projection = finalGradeOf(items, scores);
      const closed = enrollment.status === "ACREDITADO" || enrollment.status === "REPROBADO";
      const final = closed && enrollment.finalGrade !== null
        ? Number(enrollment.finalGrade)
        : complete100 ? projection.final : null;
      return {
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        matricula: enrollment.student.matricula,
        nombre: fullName(enrollment.student),
        enrollmentStatus: enrollment.status,
        scores,
        observaciones,
        final,
        missing: projection.missing,
        result: closed
          ? (enrollment.status as "ACREDITADO" | "REPROBADO")
          : final !== null && projection.missing === 0 ? resultOf(final, threshold) : null,
      };
    });

    return {
      group: {
        id: group.id,
        nombre: group.nombre,
        courseNombre: group.course.nombre,
        termNombre: group.term.name,
        teacherNombre: group.teacher ? `${group.teacher.nombres} ${group.teacher.apellidos}` : null,
        closedAt: group.closedAt?.toISOString() ?? null,
      },
      assessments: group.assessments.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        tipo: a.tipo,
        ponderacion: Number(a.ponderacion),
        maxScore: Number(a.maxScore),
      })),
      weightsTotal: weightsTotal(items),
      approvalThreshold: threshold,
      complete: complete100 && items.length > 0 && students.every((s) => s.missing === 0),
      students,
    };
  }

  /** Grupo visible para `permission`; fuera del alcance, 404. */
  private async assertVisible(groupId: string, user: UserPermissions, permission: string): Promise<void> {
    const scoped = await groupScope(user, permission);
    const count = await this.db.group.count({ where: { AND: [{ id: groupId }, ...(scoped ? [scoped] : [])] } });
    if (count === 0) throw new HttpError(404, "GROUP_NOT_FOUND");
  }

  async gradebook(groupId: string, user: UserPermissions): Promise<Gradebook> {
    await this.assertVisible(groupId, user, "grades.view");
    // El alumno solo ve su renglón; el profesor, todo su grupo.
    return this.buildGradebook(this.db, groupId, await enrollmentScope(user, "grades.view"));
  }

  /**
   * Cierre del grupo: con ponderaciones al 100 % y todo capturado, escribe la
   * final de cada inscrito y su estatus (ACREDITADO/REPROBADO según el umbral
   * de M11) en una sola transacción. Después, el grupo ya no cambia.
   */
  async close(groupId: string, actor: AuthenticatedUser): Promise<Gradebook> {
    const group = await this.db.group.findUnique({ where: { id: groupId }, select: { closedAt: true, active: true } });
    if (!group) throw new HttpError(404, "GROUP_NOT_FOUND");
    await assertGroupInScope(this.db, actor, "assessments.manage", groupId);
    if (group.closedAt) throw new HttpError(409, "GROUP_CLOSED");
    if (!group.active) throw new HttpError(409, "GROUP_INACTIVE");

    return this.db.$transaction(async (tx) => {
      const book = await this.buildGradebook(tx, groupId, null);
      if (book.assessments.length === 0) throw new HttpError(409, "ASSESSMENTS_REQUIRED");
      if (book.weightsTotal !== 100) throw new HttpError(409, "WEIGHTS_NOT_100", { total: book.weightsTotal });
      const pending = book.students.filter((s) => s.enrollmentStatus === "INSCRITO");
      const missing = pending.reduce((sum, s) => sum + s.missing, 0);
      if (missing > 0) throw new HttpError(409, "GRADES_INCOMPLETE", { missing });

      const results = pending.map((s) => ({
        enrollmentId: s.enrollmentId,
        final: s.final as number,
        status: resultOf(s.final as number, book.approvalThreshold),
      }));
      for (const r of results) {
        await tx.enrollment.update({ where: { id: r.enrollmentId }, data: { status: r.status, finalGrade: r.final } });
      }
      const closed = await tx.group.updateMany({
        where: { id: groupId, closedAt: null },
        data: { closedAt: new Date(), closedBy: actor.id },
      });
      if (closed.count === 0) throw new HttpError(409, "GROUP_CLOSED");
      const acreditados = results.filter((r) => r.status === "ACREDITADO").length;
      await this.audit?.(
        {
          action: "GROUP_CLOSED",
          entityType: "Group",
          entityId: groupId,
          userId: actor.id,
          userName: actor.username,
          previousState: { closedAt: null },
          newState: { results } as unknown as Prisma.InputJsonObject,
          metadata: {
            alumnos: results.length,
            acreditados,
            reprobados: results.length - acreditados,
            promedio: results.length ? round2(results.reduce((s, r) => s + r.final, 0) / results.length) : null,
            umbral: book.approvalThreshold,
          },
        },
        tx
      );
      return this.buildGradebook(tx, groupId, null);
    });
  }

  /** Libro del grupo como .xlsx (alumnos × instrumentos, final y resultado). */
  async export(groupId: string | undefined, user: AuthenticatedUser): Promise<{ buffer: Buffer; filename: string }> {
    if (!groupId) throw new HttpError(400, "FIELD_REQUIRED", { field: "groupId" });
    await this.assertVisible(groupId, user, "grades.export");
    const book = await this.buildGradebook(this.db, groupId, null);
    const sheet = XLSX.utils.json_to_sheet(
      book.students.map((s) => {
        const row: Record<string, string | number | null> = { Matrícula: s.matricula, Nombre: s.nombre };
        for (const a of book.assessments) row[`${a.nombre} (${a.ponderacion}%)`] = s.scores[a.id];
        row.Final = s.final;
        row.Resultado = s.result ?? "EN CURSO";
        return row;
      })
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Calificaciones");
    await this.audit?.({
      action: "GRADES_EXPORTED",
      entityType: "Group",
      entityId: groupId,
      userId: user.id,
      userName: user.username,
      metadata: { rows: book.students.length },
    });
    const slug = `${book.group.courseNombre}-${book.group.nombre}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return {
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
      filename: `calificaciones-${slug}.xlsx`,
    };
  }

  // --- kardex (M06) --------------------------------------------------------------

  /**
   * Renglones académicos del kardex: una fila por inscripción (las de cambio
   * de grupo no cuentan: el alumno sigue en el grupo destino). La final solo
   * aparece cuando el grupo se cerró.
   */
  kardexSource = async (studentId: string): Promise<KardexEntry[]> => {
    const rows = await this.db.enrollment.findMany({
      where: { studentId, transferredToId: null },
      include: {
        group: {
          include: {
            course: { select: { id: true, nombre: true } },
            term: { select: { id: true, name: true, startDate: true } },
            assessments: { where: { active: true }, orderBy: [{ fecha: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] },
          },
        },
        grades: true,
      },
    });
    rows.sort(
      (a, b) =>
        a.group.term.startDate.getTime() - b.group.term.startDate.getTime() ||
        a.group.course.nombre.localeCompare(b.group.course.nombre)
    );
    return rows.map((row) => {
      const byAssessment = new Map(row.grades.map((g) => [g.assessmentId, g.score]));
      const captured = row.group.assessments.filter((a) => {
        const score = byAssessment.get(a.id);
        return score !== undefined && score !== null;
      });
      return {
        termId: row.group.term.id,
        termNombre: row.group.term.name,
        courseId: row.group.course.id,
        courseNombre: row.group.course.nombre,
        grupo: row.group.nombre,
        // En escala 0–100 para que instrumentos con distinto máximo sean comparables.
        calificaciones: captured.map((a) =>
          round2(new Prisma.Decimal(byAssessment.get(a.id) as Prisma.Decimal).div(a.maxScore).times(100))
        ),
        ponderaciones: captured.map((a) => Number(a.ponderacion)),
        calificacionFinal: row.finalGrade === null ? null : Number(row.finalGrade),
        estatus: row.status === "INSCRITO" ? "EN_CURSO" : row.status,
      };
    });
  };
}
