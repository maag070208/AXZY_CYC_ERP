import { Prisma, type PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { serializable } from "@core/db/serializable";
import { scopeOf, type UserPermissions } from "@core/permissions";
import { t, type MessageKey } from "@core/i18n";
import { logger } from "@core/utils/logger";
import type { AuthenticatedUser } from "@core/utils/security";
import type { AuditLogger } from "@modules/audit";
import { CURRENT_ENROLLMENT, groupScope } from "@modules/courses";
import { fullName } from "@modules/students/services/student.service";
import type { AttemptView, ReviewInput, SaveAnswersInput } from "../models/dto/exam.dto";
import {
  attemptScore,
  autoGrade,
  endsAtOf,
  isValidAnswer,
  pickAttempt,
  round2,
  shuffle,
  toAssessmentScale,
  windowState,
  type Answer,
  type QuestionKind,
} from "../models/entity/exam-rules";
import { totalOf, type ExamService } from "./exam.service";

type Tx = Prisma.TransactionClient;
type Client = PrismaClient | Tx;
type Layout = Array<{ questionId: string; optionIds: string[] }>;
type Actor = { userId: string | null; userName: string | null };

const SYSTEM: Actor = { userId: null, userName: "sistema" };

const attemptInclude = {
  student: { select: { id: true, userId: true, matricula: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true } },
  answers: true,
  exam: {
    include: {
      questions: { include: { question: { include: { options: { orderBy: { orden: "asc" } } } } } },
    },
  },
} satisfies Prisma.ExamAttemptInclude;

type AttemptRow = Prisma.ExamAttemptGetPayload<{ include: typeof attemptInclude }>;

const notAvailable = (reason: "NOT_PUBLISHED" | "NOT_OPEN" | "CLOSED" | "NO_ATTEMPTS" | "NOT_ENROLLED") =>
  new HttpError(409, "EXAM_NOT_AVAILABLE", { reason: t(`exams.reasons.${reason}` as MessageKey) }, { reason });

const asAnswer = (value: Prisma.JsonValue | null): Answer =>
  value === null ? null : Array.isArray(value) ? (value as string[]) : typeof value === "string" ? value : null;

export interface GradeEffect {
  assessmentId: string;
  enrollmentId: string;
  score: number;
}

/**
 * Intentos (M16) y calificación automática (M17). El tiempo lo decide el
 * servidor (`endsAt`); un intento vencido se cierra solo al consultarlo o con
 * el barrido periódico. Al cerrarse se califican las cerradas, las abiertas
 * quedan pendientes y la calificación del criterio (mejor/último) se escribe
 * como `Grade` en la evaluación vinculada de M08.
 */
export class AttemptService {
  constructor(
    private readonly exams: ExamService,
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  // --- utilidades ---------------------------------------------------------------

  private async studentOf(actor: AuthenticatedUser) {
    const student = await this.db.student.findUnique({ where: { userId: actor.id }, select: { id: true, status: true } });
    if (!student) throw new HttpError(403, "STUDENT_PROFILE_REQUIRED");
    return student;
  }

  private async loadAttempt(id: string, client: Client = this.db): Promise<AttemptRow> {
    const row = await client.examAttempt.findUnique({ where: { id }, include: attemptInclude });
    if (!row) throw new HttpError(404, "ATTEMPT_NOT_FOUND");
    return row;
  }

  /** Intento propio del alumno; si ya venció, se cierra antes de devolverlo. */
  private async ownAttempt(id: string, actor: AuthenticatedUser): Promise<AttemptRow> {
    let row = await this.loadAttempt(id);
    if (row.student.userId !== actor.id) throw new HttpError(404, "ATTEMPT_NOT_FOUND");
    if (row.status === "EN_CURSO" && row.endsAt <= new Date()) {
      await this.finalize(row.id, "EXPIRADO", SYSTEM);
      row = await this.loadAttempt(id);
    }
    return row;
  }

  private view(row: AttemptRow, audience: "student" | "staff"): AttemptView {
    const now = new Date();
    const layout = row.layout as unknown as Layout;
    const examQuestions = new Map(row.exam.questions.map((q) => [q.questionId, q]));
    const answers = new Map(row.answers.map((a) => [a.questionId, a]));
    const finished = row.status !== "EN_CURSO";
    const showResult = finished && (audience === "staff" || row.exam.mostrarResultado);
    const total = totalOf(row.exam);
    return {
      attemptId: row.id,
      examId: row.examId,
      titulo: row.exam.titulo,
      instrucciones: row.exam.instrucciones,
      numero: row.numero,
      status: row.status,
      student: { id: row.student.id, matricula: row.student.matricula, nombre: fullName(row.student) },
      startedAt: row.startedAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      remainingSeconds: finished ? 0 : Math.max(0, Math.floor((row.endsAt.getTime() - now.getTime()) / 1000)),
      serverTime: now.toISOString(),
      focusLosses: row.focusLosses,
      questions: layout.flatMap((item, index) => {
        const eq = examQuestions.get(item.questionId);
        if (!eq) return [];
        const options = new Map(eq.question.options.map((o) => [o.id, o]));
        const answer = answers.get(item.questionId);
        return [{
          questionId: item.questionId,
          orden: index + 1,
          tipo: eq.question.tipo,
          enunciado: eq.question.enunciado,
          puntos: Number(eq.puntos),
          // Nunca se envía cuál es la correcta mientras el intento está abierto.
          options: item.optionIds.flatMap((id) => {
            const o = options.get(id);
            return o ? [showResult ? { id, texto: o.texto, esCorrecta: o.esCorrecta } : { id, texto: o.texto }] : [];
          }),
          respuesta: asAnswer(answer?.respuesta ?? null) ?? null,
          ...(showResult
            ? {
                esCorrecta: answer?.esCorrecta ?? null,
                puntosObtenidos: answer?.puntosObtenidos === null || answer?.puntosObtenidos === undefined ? null : Number(answer.puntosObtenidos),
                comentario: answer?.comentario ?? null,
              }
            : {}),
        }];
      }),
      result: showResult
        ? {
            score: Number(row.score ?? 0),
            totalPuntos: total,
            pendingCount: row.pendingCount,
            aprobado: row.pendingCount > 0 ? null : Number(row.score ?? 0) >= Number(row.exam.puntajeAprobatorio),
          }
        : null,
    };
  }

  // --- alumno -------------------------------------------------------------------

  /** Exámenes publicados de mis grupos con mis intentos y si puedo iniciar. */
  async available(actor: AuthenticatedUser) {
    const student = await this.studentOf(actor);
    const exams = await this.db.onlineExam.findMany({
      where: { status: { not: "BORRADOR" }, group: { enrollments: { some: { ...CURRENT_ENROLLMENT, studentId: student.id } } } },
      include: {
        group: { select: { nombre: true, course: { select: { nombre: true } } } },
        questions: { select: { puntos: true } },
        attempts: { where: { studentId: student.id }, orderBy: { numero: "asc" } },
      },
      orderBy: { fechaApertura: "desc" },
    });
    const now = new Date();
    return exams.map((exam) => {
      const open = exam.attempts.find((a) => a.status === "EN_CURSO" && a.endsAt > now);
      const used = exam.attempts.length;
      const state = windowState(exam.status, exam.fechaApertura, exam.fechaCierre, now);
      const last = [...exam.attempts].reverse().find((a) => a.status !== "EN_CURSO");
      return {
        examId: exam.id,
        titulo: exam.titulo,
        curso: exam.group.course.nombre,
        grupo: exam.group.nombre,
        fechaApertura: exam.fechaApertura.toISOString(),
        fechaCierre: exam.fechaCierre.toISOString(),
        duracionMin: exam.duracionMin,
        intentosMax: exam.intentosMax,
        intentosUsados: used,
        totalPuntos: totalOf(exam),
        state,
        inProgressAttemptId: open?.id ?? null,
        canStart: !open && state === "OPEN" && used < exam.intentosMax && student.status === "ACTIVO",
        lastAttempt: last
          ? {
              attemptId: last.id,
              status: last.status,
              finishedAt: last.finishedAt?.toISOString() ?? null,
              score: exam.mostrarResultado && last.score !== null ? Number(last.score) : null,
              pendingCount: exam.mostrarResultado ? last.pendingCount : null,
            }
          : null,
      };
    });
  }

  /**
   * Inicia (o reanuda) un intento (M16 §4.1–4.3). Corre serializable y el
   * índice único parcial impide dos intentos abiertos por doble clic.
   */
  async start(examId: string, actor: AuthenticatedUser): Promise<{ attempt: AttemptView; resumed: boolean }> {
    const student = await this.studentOf(actor);
    const exam = await this.db.onlineExam.findUnique({
      where: { id: examId },
      include: { questions: { orderBy: { orden: "asc" }, include: { question: { include: { options: { orderBy: { orden: "asc" } } } } } } },
    });
    if (!exam || exam.status === "BORRADOR") throw new HttpError(404, "EXAM_NOT_FOUND");
    const enrolled = await this.db.enrollment.count({ where: { studentId: student.id, groupId: exam.groupId, status: "INSCRITO" } });
    if (!enrolled || student.status !== "ACTIVO") throw notAvailable("NOT_ENROLLED");

    const existing = await this.db.examAttempt.findFirst({ where: { examId, studentId: student.id, status: "EN_CURSO" } });
    if (existing) {
      const row = await this.ownAttempt(existing.id, actor);
      if (row.status === "EN_CURSO") return { attempt: this.view(row, "student"), resumed: true };
    }
    const state = windowState(exam.status, exam.fechaApertura, exam.fechaCierre);
    if (state !== "OPEN") throw notAvailable(state);

    const layout: Layout = (exam.aleatorizarPreguntas ? shuffle(exam.questions) : exam.questions).map((q) => {
      const ids = q.question.options.map((o) => o.id);
      return { questionId: q.questionId, optionIds: exam.aleatorizarOpciones ? shuffle(ids) : ids };
    });
    try {
      const id = await serializable(async (tx) => {
        const used = await tx.examAttempt.count({ where: { examId, studentId: student.id } });
        if (used >= exam.intentosMax) throw notAvailable("NO_ATTEMPTS");
        const now = new Date();
        const attempt = await tx.examAttempt.create({
          data: {
            examId,
            studentId: student.id,
            numero: used + 1,
            startedAt: now,
            endsAt: endsAtOf(now, exam.duracionMin, exam.fechaCierre),
            layout: layout as unknown as Prisma.InputJsonArray,
          },
        });
        await this.audit?.(
          { action: "ATTEMPT_STARTED", entityType: "ExamAttempt", entityId: attempt.id, userId: actor.id, userName: actor.username,
            newState: { examId, studentId: student.id, numero: attempt.numero, status: "EN_CURSO", endsAt: attempt.endsAt.toISOString() } },
          tx
        );
        return attempt.id;
      });
      return { attempt: this.view(await this.loadAttempt(id), "student"), resumed: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const open = await this.db.examAttempt.findFirst({ where: { examId, studentId: student.id, status: "EN_CURSO" } });
        if (open) return { attempt: this.view(await this.loadAttempt(open.id), "student"), resumed: true };
      }
      throw error;
    }
  }

  /** Detalle: el dueño ve su intento; el personal con `attempts.view` (AREA/ALL), la revisión completa. */
  async get(id: string, user: AuthenticatedUser): Promise<AttemptView> {
    const row = await this.loadAttempt(id);
    if (row.student.userId === user.id) return this.view(await this.ownAttempt(id, user), "student");
    const scope = scopeOf(user, "attempts.view");
    if (scope !== "ALL" && scope !== "AREA") throw new HttpError(404, "ATTEMPT_NOT_FOUND");
    await this.assertVisibleExamGroup(row.exam.groupId, user, "attempts.view");
    if (row.status === "EN_CURSO" && row.endsAt <= new Date()) await this.finalize(row.id, "EXPIRADO", SYSTEM);
    return this.view(await this.loadAttempt(id), "staff");
  }

  private async saveInto(tx: Tx, row: AttemptRow, answers: SaveAnswersInput["answers"]): Promise<number> {
    const layout = row.layout as unknown as Layout;
    const byQuestion = new Map(layout.map((item, i) => [item.questionId, { ...item, orden: i + 1 }]));
    const kinds = new Map(row.exam.questions.map((q) => [q.questionId, q.question.tipo as QuestionKind]));
    for (const a of answers) {
      const item = byQuestion.get(a.questionId);
      if (!item) throw new HttpError(400, "INVALID_REFERENCE", {}, { questionId: a.questionId });
      if (!isValidAnswer(kinds.get(a.questionId) as QuestionKind, a.respuesta, item.optionIds)) {
        throw new HttpError(400, "INVALID_ANSWER", { orden: item.orden }, { questionId: a.questionId });
      }
    }
    for (const a of answers) {
      const respuesta = a.respuesta === null ? Prisma.DbNull : (a.respuesta as Prisma.InputJsonValue);
      await tx.attemptAnswer.upsert({
        where: { attemptId_questionId: { attemptId: row.id, questionId: a.questionId } },
        create: { attemptId: row.id, questionId: a.questionId, respuesta, answeredAt: new Date() },
        update: { respuesta, answeredAt: new Date() },
      });
    }
    return answers.length;
  }

  /** Guardado automático (upsert por pregunta; sin bitácora por respuesta). */
  async saveAnswers(id: string, input: SaveAnswersInput, actor: AuthenticatedUser) {
    const row = await this.ownAttempt(id, actor);
    if (row.status !== "EN_CURSO") throw new HttpError(409, "ATTEMPT_CLOSED");
    const saved = await this.db.$transaction(async (tx) => {
      const still = await tx.examAttempt.findUnique({ where: { id }, select: { status: true } });
      if (still?.status !== "EN_CURSO") throw new HttpError(409, "ATTEMPT_CLOSED");
      return this.saveInto(tx, row, input.answers);
    });
    return { saved, savedAt: new Date().toISOString(), remainingSeconds: Math.max(0, Math.floor((row.endsAt.getTime() - Date.now()) / 1000)) };
  }

  async submit(id: string, answers: SaveAnswersInput["answers"] | undefined, actor: AuthenticatedUser): Promise<AttemptView> {
    const row = await this.ownAttempt(id, actor);
    if (row.status !== "EN_CURSO") throw new HttpError(409, "ATTEMPT_CLOSED");
    await this.finalize(id, "ENVIADO", { userId: actor.id, userName: actor.username }, answers);
    return this.view(await this.loadAttempt(id), "student");
  }

  /** Cambio de pestaña (M16 §4.8): se cuenta y se guarda la marca, sin invalidar. */
  async event(id: string, type: "TAB_BLUR" | "TAB_FOCUS", actor: AuthenticatedUser) {
    const row = await this.ownAttempt(id, actor);
    if (row.status !== "EN_CURSO") throw new HttpError(409, "ATTEMPT_CLOSED");
    const events = ((row.events as unknown as Array<{ type: string; at: string }>) ?? []).slice(-199);
    events.push({ type, at: new Date().toISOString() });
    const updated = await this.db.examAttempt.update({
      where: { id },
      data: { events: events as unknown as Prisma.InputJsonArray, ...(type === "TAB_BLUR" && { focusLosses: { increment: 1 } }) },
      select: { focusLosses: true },
    });
    return { focusLosses: updated.focusLosses };
  }

  // --- cierre y calificación (M17) --------------------------------------------------

  /**
   * Cierra el intento (ENVIADO o EXPIRADO), califica las cerradas, deja las
   * abiertas pendientes y escribe el `Grade` según el criterio. Idempotente: si
   * ya estaba cerrado no hace nada.
   */
  async finalize(id: string, status: "ENVIADO" | "EXPIRADO", actor: Actor, answers?: SaveAnswersInput["answers"]): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const row = await this.loadAttempt(id, tx);
      if (row.status !== "EN_CURSO") return;
      if (answers?.length) await this.saveInto(tx, row, answers);
      const now = new Date();
      const finishedAt = status === "EXPIRADO" ? (row.endsAt < now ? row.endsAt : now) : now;
      const closed = await tx.examAttempt.updateMany({ where: { id, status: "EN_CURSO" }, data: { status, finishedAt } });
      if (closed.count === 0) return;
      const graded = await this.gradeAnswers(tx, id, false);
      await this.audit?.(
        { action: status === "ENVIADO" ? "ATTEMPT_SUBMITTED" : "ATTEMPT_EXPIRED", entityType: "ExamAttempt", entityId: id, ...actor,
          previousState: { status: "EN_CURSO" }, newState: { status, finishedAt: finishedAt.toISOString() } },
        tx
      );
      await this.audit?.(
        { action: "ATTEMPT_GRADED", entityType: "ExamAttempt", entityId: id, ...actor,
          previousState: { score: null }, newState: { score: graded.score, pendingCount: graded.pending } },
        tx
      );
      await this.writeGrade(tx, row.examId, row.studentId, actor);
    });
  }

  /**
   * Califica las respuestas del intento. Con `keepReviews` se respetan las
   * revisiones manuales de abiertas (regrade); las cerradas siempre se
   * recalculan contra las opciones correctas.
   */
  private async gradeAnswers(tx: Tx, attemptId: string, keepReviews: boolean) {
    const row = await this.loadAttempt(attemptId, tx);
    const layout = row.layout as unknown as Layout;
    const answers = new Map(row.answers.map((a) => [a.questionId, a]));
    const results: Array<{ esCorrecta: boolean | null; puntosObtenidos: number | null }> = [];
    for (const item of layout) {
      const eq = row.exam.questions.find((q) => q.questionId === item.questionId);
      if (!eq) continue;
      const answer = answers.get(item.questionId);
      const tipo = eq.question.tipo as QuestionKind;
      if (keepReviews && tipo === "ABIERTA" && answer?.reviewedAt) {
        results.push({ esCorrecta: answer.esCorrecta, puntosObtenidos: answer.puntosObtenidos === null ? null : Number(answer.puntosObtenidos) });
        continue;
      }
      const correct = eq.question.options.filter((o) => o.esCorrecta).map((o) => o.id);
      const grade = autoGrade(tipo, asAnswer(answer?.respuesta ?? null), correct, Number(eq.puntos));
      results.push(grade);
      await tx.attemptAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: item.questionId } },
        create: { attemptId, questionId: item.questionId, respuesta: Prisma.DbNull, esCorrecta: grade.esCorrecta, puntosObtenidos: grade.puntosObtenidos },
        update: { esCorrecta: grade.esCorrecta, puntosObtenidos: grade.puntosObtenidos },
      });
    }
    const { score, pending } = attemptScore(results);
    await tx.examAttempt.update({ where: { id: attemptId }, data: { score, pendingCount: pending, gradedAt: new Date() } });
    return { score, pending };
  }

  /**
   * Escribe un único `Grade` por (evaluación, inscripción) con el intento del
   * criterio (M17 §4.4), en la escala de la evaluación. No escribe si no hay
   * evaluación vinculada, si el grupo ya cerró calificaciones (M08) o si el
   * intento que decide aún tiene abiertas sin revisar.
   */
  private async writeGrade(tx: Tx, examId: string, studentId: string, actor: Actor): Promise<GradeEffect | null> {
    const exam = await tx.onlineExam.findUniqueOrThrow({
      where: { id: examId },
      include: { questions: { select: { puntos: true } }, assessment: true, group: { select: { closedAt: true } } },
    });
    if (!exam.assessment || !exam.assessment.active || exam.group.closedAt) return null;
    const enrollment = await tx.enrollment.findFirst({ where: { studentId, groupId: exam.groupId, status: "INSCRITO" }, select: { id: true } });
    if (!enrollment) return null;
    const attempts = await tx.examAttempt.findMany({
      where: { examId, studentId, status: { not: "EN_CURSO" } },
      select: { id: true, score: true, pendingCount: true, finishedAt: true },
    });
    const chosen = pickAttempt(
      attempts.map((a) => ({ id: a.id, score: Number(a.score ?? 0), pendingCount: a.pendingCount, finishedAt: a.finishedAt ?? new Date(0) })),
      exam.criterioIntentos
    );
    if (!chosen) return null;
    const score = toAssessmentScale(chosen.score, totalOf(exam), Number(exam.assessment.maxScore));
    const key = { assessmentId_enrollmentId: { assessmentId: exam.assessment.id, enrollmentId: enrollment.id } };
    const previous = await tx.grade.findUnique({ where: key });
    if (previous && previous.score !== null && Number(previous.score) === score) {
      return { assessmentId: exam.assessment.id, enrollmentId: enrollment.id, score };
    }
    const grade = await tx.grade.upsert({
      where: key,
      create: { assessmentId: exam.assessment.id, enrollmentId: enrollment.id, score, capturedBy: actor.userId, capturedAt: new Date(),
        observaciones: `Examen en línea: ${exam.titulo}` },
      update: { score, capturedBy: actor.userId, capturedAt: new Date() },
    });
    await this.audit?.(
      { action: previous ? "GRADE_UPDATED" : "GRADE_CAPTURED", entityType: "Grade", entityId: grade.id, ...actor,
        previousState: previous ? { score: previous.score === null ? null : Number(previous.score) } : undefined,
        newState: { score },
        metadata: { source: "online-exam", examId, attemptId: chosen.id, criterio: exam.criterioIntentos } },
      tx
    );
    return { assessmentId: exam.assessment.id, enrollmentId: enrollment.id, score };
  }

  // --- personal: resultados, revisión, recalificación ---------------------------------

  private async assertVisibleExamGroup(groupId: string, user: UserPermissions, permission: string): Promise<void> {
    const scoped = await groupScope(user, permission);
    const count = await this.db.group.count({ where: { AND: [{ id: groupId }, ...(scoped ? [scoped] : [])] } });
    if (count === 0) throw new HttpError(404, "EXAM_NOT_FOUND");
  }

  /** Cierra los intentos vencidos de un examen (o de todos) y los califica. */
  async sweep(examId?: string): Promise<number> {
    const due = await this.db.examAttempt.findMany({
      where: { status: "EN_CURSO", endsAt: { lte: new Date() }, ...(examId ? { examId } : {}) },
      select: { id: true },
      take: 200,
    });
    for (const a of due) await this.finalize(a.id, "EXPIRADO", SYSTEM);
    return due.length;
  }

  /** Barrido periódico (M16 §4.4): no depende de que el alumno vuelva a la página. */
  startSweeper(intervalMs = 60_000): NodeJS.Timeout {
    const timer = setInterval(() => {
      this.sweep().catch((error) => logger.error(`[attempts] sweep failed: ${String(error)}`));
    }, intervalMs);
    timer.unref();
    return timer;
  }

  /** PUBLICADO → CERRADO: los intentos abiertos se cierran como EXPIRADO y se califican. */
  async closeExam(examId: string, actor: AuthenticatedUser) {
    await this.exams.assertClosable(examId, actor);
    const open = await this.db.examAttempt.findMany({ where: { examId, status: "EN_CURSO" }, select: { id: true } });
    for (const a of open) await this.finalize(a.id, "EXPIRADO", { userId: actor.id, userName: actor.username });
    await this.db.$transaction(async (tx) => {
      await tx.onlineExam.update({ where: { id: examId }, data: { status: "CERRADO", closedAt: new Date() } });
      await this.audit?.(
        { action: "EXAM_CLOSED", entityType: "OnlineExam", entityId: examId, userId: actor.id, userName: actor.username,
          previousState: { status: "PUBLICADO" }, newState: { status: "CERRADO" }, metadata: { closedOpenAttempts: open.length } },
        tx
      );
    });
    return this.exams.detail(await this.exams.load(examId, null));
  }

  /** Resultados por alumno inscrito: intentos, calificación del criterio y pendientes. */
  async results(examId: string, user: UserPermissions) {
    const exam = await this.exams.load(examId, null);
    await this.assertVisibleExamGroup(exam.groupId, user, "attempts.view");
    await this.sweep(examId);
    const [enrollments, attempts] = await Promise.all([
      this.db.enrollment.findMany({
        where: { groupId: exam.groupId, ...CURRENT_ENROLLMENT },
        include: { student: { select: { id: true, matricula: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true } } },
        orderBy: [{ student: { apellidoPaterno: "asc" } }, { student: { nombres: "asc" } }],
      }),
      this.db.examAttempt.findMany({ where: { examId }, orderBy: { numero: "asc" } }),
    ]);
    const total = totalOf(exam);
    const aprobatorio = Number(exam.puntajeAprobatorio);
    const rows = enrollments.map((e) => {
      const mine = attempts.filter((a) => a.studentId === e.studentId);
      const finished = mine.filter((a) => a.status !== "EN_CURSO");
      const chosen = pickAttempt(
        finished.map((a) => ({ id: a.id, score: Number(a.score ?? 0), pendingCount: a.pendingCount, finishedAt: a.finishedAt ?? new Date(0) })),
        exam.criterioIntentos
      );
      return {
        enrollmentId: e.id,
        studentId: e.studentId,
        matricula: e.student.matricula,
        nombre: fullName(e.student),
        intentos: mine.length,
        enCurso: mine.some((a) => a.status === "EN_CURSO"),
        pendientes: finished.reduce((s, a) => s + a.pendingCount, 0),
        calificacion: chosen ? chosen.score : null,
        aprobado: chosen ? chosen.score >= aprobatorio : null,
        attempts: mine.map((a) => ({
          attemptId: a.id,
          numero: a.numero,
          status: a.status,
          score: a.score === null ? null : Number(a.score),
          pendingCount: a.pendingCount,
          focusLosses: a.focusLosses,
          startedAt: a.startedAt.toISOString(),
          finishedAt: a.finishedAt?.toISOString() ?? null,
        })),
      };
    });
    const graded = rows.filter((r) => r.calificacion !== null);
    return {
      exam: this.exams.detail(exam),
      kpis: {
        inscritos: rows.length,
        presentaron: rows.filter((r) => r.intentos > 0).length,
        promedio: graded.length ? round2(graded.reduce((s, r) => s + (r.calificacion as number), 0) / graded.length) : null,
        aprobados: graded.filter((r) => r.aprobado).length,
        pendientesRevision: rows.reduce((s, r) => s + r.pendientes, 0),
        totalPuntos: total,
      },
      rows,
    };
  }

  private async staffAttempt(id: string, actor: AuthenticatedUser): Promise<AttemptRow> {
    const row = await this.loadAttempt(id);
    const exam = await this.db.onlineExam.findUniqueOrThrow({ where: { id: row.examId }, select: { groupId: true } });
    const scoped = await groupScope(actor, "attempts.review");
    const visible = await this.db.group.count({ where: { AND: [{ id: exam.groupId }, ...(scoped ? [scoped] : [])] } });
    if (!visible) throw new HttpError(403, "INSUFFICIENT_PERMISSIONS");
    if (row.status === "EN_CURSO") throw new HttpError(409, "ATTEMPT_OPEN");
    return row;
  }

  /** Revisión manual de una abierta (M17 §4.6): recalcula y, completa, reescribe el Grade. */
  async review(id: string, input: ReviewInput, actor: AuthenticatedUser) {
    const row = await this.staffAttempt(id, actor);
    const eq = row.exam.questions.find((q) => q.questionId === input.questionId);
    if (!eq || !(row.layout as unknown as Layout).some((item) => item.questionId === input.questionId)) {
      throw new HttpError(400, "INVALID_REFERENCE");
    }
    if (eq.question.tipo !== "ABIERTA") throw new HttpError(400, "REVIEW_ONLY_OPEN");
    if (input.puntosObtenidos > Number(eq.puntos)) throw new HttpError(400, "SCORE_OUT_OF_RANGE", { max: Number(eq.puntos) });
    const actorFields = { userId: actor.id, userName: actor.username };
    return this.db.$transaction(async (tx) => {
      const previous = row.answers.find((a) => a.questionId === input.questionId);
      const esCorrecta = input.esCorrecta ?? input.puntosObtenidos > 0;
      await tx.attemptAnswer.upsert({
        where: { attemptId_questionId: { attemptId: id, questionId: input.questionId } },
        create: { attemptId: id, questionId: input.questionId, respuesta: Prisma.DbNull, esCorrecta, puntosObtenidos: input.puntosObtenidos,
          comentario: input.comentario ?? null, reviewedAt: new Date() },
        update: { esCorrecta, puntosObtenidos: input.puntosObtenidos, comentario: input.comentario ?? null, reviewedAt: new Date() },
      });
      const { score, pending } = await this.gradeAnswers(tx, id, true);
      if (pending === 0) await tx.examAttempt.update({ where: { id }, data: { reviewedBy: actor.id, reviewedAt: new Date() } });
      await this.audit?.(
        { action: "ATTEMPT_REVIEWED", entityType: "AttemptAnswer", entityId: previous?.id ?? id, ...actorFields,
          previousState: { esCorrecta: previous?.esCorrecta ?? null, puntosObtenidos: previous?.puntosObtenidos === null || previous?.puntosObtenidos === undefined ? null : Number(previous.puntosObtenidos) },
          newState: { esCorrecta, puntosObtenidos: input.puntosObtenidos },
          metadata: { attemptId: id, questionId: input.questionId } },
        tx
      );
      const grade = await this.writeGrade(tx, row.examId, row.studentId, actorFields);
      return { attemptId: id, score, pendingCount: pending, grade };
    });
  }

  /** Recalifica (p. ej. tras corregir una clave) y reescribe el Grade; idempotente. */
  async regrade(id: string, actor: AuthenticatedUser) {
    const row = await this.staffAttempt(id, actor);
    const actorFields = { userId: actor.id, userName: actor.username };
    return this.db.$transaction(async (tx) => {
      const before = { score: row.score === null ? null : Number(row.score), pendingCount: row.pendingCount };
      const { score, pending } = await this.gradeAnswers(tx, id, true);
      if (before.score !== score || before.pendingCount !== pending) {
        await this.audit?.(
          { action: "ATTEMPT_REGRADED", entityType: "ExamAttempt", entityId: id, ...actorFields,
            previousState: before, newState: { score, pendingCount: pending } },
          tx
        );
      }
      const grade = await this.writeGrade(tx, row.examId, row.studentId, actorFields);
      return { attemptId: id, score, pendingCount: pending, grade };
    });
  }
}
