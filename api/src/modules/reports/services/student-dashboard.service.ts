import type { PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { scopeOf, type UserPermissions } from "@core/permissions";
import type { AuthenticatedUser } from "@core/utils/security";
import { average } from "../models/entity/report";

/**
 * Inicio del alumno (M21 ampliado): junta en una sola respuesta lo que la
 * persona necesita para saber cómo va —exámenes por presentar, pagos, horario,
 * avance académico, expediente y avisos—.
 *
 * Todo se resuelve desde la **sesión** (el alumno ligado a la cuenta), nunca por
 * un id de la URL: no hay forma de pedir el tablero de otro. Cada bloque se
 * omite (`null`) si la persona no tiene el permiso que lo gobierna, y el trabajo
 * pesado lo siguen haciendo los módulos dueños de cada regla por estos puertos
 * (M16 exámenes, M09 cobranza, M06 kardex/expediente, M18 asistencia, M19
 * avisos), conectados en `api.router.ts`.
 */

/** Un renglón del horario de un grupo (`Group.schedule` en JSON). */
export interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
}

export interface StudentGroup {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  courseName: string;
  teacherName: string | null;
  classroom: string | null;
  schedule: ScheduleSlot[];
}

export interface StudentExam {
  examId: string;
  title: string;
  courseName: string;
  groupName: string;
  opensAt: string;
  closesAt: string;
  durationMin: number;
  maxAttempts: number;
  attemptsUsed: number;
  state: "NOT_PUBLISHED" | "NOT_OPEN" | "CLOSED" | "OPEN";
  inProgressAttemptId: string | null;
  canStart: boolean;
}

export interface StudentPaymentRow {
  id: string;
  concept: string;
  description: string | null;
  dueDate: string;
  total: number;
  paid: number;
  balance: number;
  overdue: boolean;
}

export interface StudentSubject {
  courseName: string;
  groupName: string;
  finalGrade: number | null;
  /** Promedio de las calificaciones capturadas (la final manda cuando existe). */
  average: number | null;
  status: "PASSED" | "FAILED" | "IN_PROGRESS" | "WITHDRAWN";
  attendanceRate: number | null;
  absences: number;
  sessions: number;
}

export interface StudentDashboard {
  student: {
    id: string;
    studentNumber: string;
    name: string;
    status: "ACTIVE" | "WITHDRAWN";
    enrollmentDate: string;
    levelName: string | null;
  };
  groups: StudentGroup[];
  /** `null` sin `attempts.take`. */
  exams: { toTake: number; open: number; upcoming: number; next: StudentExam | null } | null;
  /** `null` sin `charges.view`. */
  payments: {
    paid: number;
    balance: number;
    overdue: number;
    pending: StudentPaymentRow[];
  } | null;
  /** `null` sin `kardex.view` ni `attendance.view`. */
  academic: { overallAverage: number | null; attendanceRate: number | null; subjects: StudentSubject[] } | null;
  /** `null` sin `documents.view`. */
  documents: { pending: number; missing: Array<{ id: string; name: string }>; requiredCount: number } | null;
  /** `null` sin bandeja (siempre disponible, pero se omite si no hay ninguna). */
  notifications: { unread: number; latest: Array<{ id: string; subject: string | null; body: string | null; createdAt: string; read: boolean }> } | null;
  generatedAt: string;
}

// --- puertos (los conecta `api.router.ts`) -------------------------------------

export type ExamSource = (actor: AuthenticatedUser) => Promise<StudentExam[]>;
export type StatementSource = (
  studentId: string,
  actor: AuthenticatedUser
) => Promise<{
  charges: Array<{ id: string; conceptName: string; description: string | null; dueDate: string; total: number; paid: number; balance: number; overdue: boolean }>;
  totals: { paid: number; balance: number; overdue: number };
}>;
export type KardexSource = (
  studentId: string,
  actor: AuthenticatedUser,
  permission?: string
) => Promise<{
  entries: Array<{
    courseName: string;
    groupName: string;
    grades: number[];
    finalGrade: number | null;
    status: "PASSED" | "FAILED" | "IN_PROGRESS" | "WITHDRAWN";
  }>;
  overallAverage: number | null;
}>;
export type AttendanceSource = (
  studentId: string,
  user: UserPermissions
) => Promise<{
  groups: Array<{ groupName: string; courseName: string; sessions: number; absences: number; percentage: number | null }>;
}>;
export type DocumentsSource = (
  studentId: string,
  actor: AuthenticatedUser
) => Promise<{
  documents: Array<{ id: string; status: "PENDING" | "VALIDATED" | "REJECTED" }>;
  missing: Array<{ id: string; name: string }>;
  requiredCount: number;
}>;
export type InboxSource = (
  userId: string,
  limit?: number
) => Promise<{
  unread: number;
  data: Array<{ id: string; subject: string | null; body: string | null; createdAt: string; readAt: string | null }>;
}>;

/**
 * Horario guardado en `Group.schedule`: se descartan los tramos incompletos en
 * vez de romper el tablero por un JSON viejo. **Pura.**
 */
export const parseSchedule = (value: unknown): ScheduleSlot[] => {
  if (!Array.isArray(value)) return [];
  const slots: ScheduleSlot[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { day, startTime, endTime } = item as Record<string, unknown>;
    if (typeof day !== "string" || typeof startTime !== "string" || typeof endTime !== "string") continue;
    slots.push({ day, startTime, endTime });
  }
  return slots;
};

/**
 * Cargos con saldo, del más viejo al más nuevo. **Pura.** Mapea campo por campo:
 * el estado de cuenta trae más datos de los que el alumno necesita y no se
 * reexponen tal cual.
 */
export const pendingCharges = (
  charges: ReadonlyArray<{
    id: string;
    conceptName: string;
    description: string | null;
    dueDate: string;
    total: number;
    paid: number;
    balance: number;
    overdue: boolean;
  }>
): StudentPaymentRow[] =>
  charges
    .filter((charge) => charge.balance > 0)
    .map((charge) => ({
      id: charge.id,
      concept: charge.conceptName,
      description: charge.description,
      dueDate: charge.dueDate,
      total: charge.total,
      paid: charge.paid,
      balance: charge.balance,
      overdue: charge.overdue,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

export class StudentDashboardService {
  private examsSource: ExamSource | null = null;
  private statementSource: StatementSource | null = null;
  private kardexSource: KardexSource | null = null;
  private attendanceSource: AttendanceSource | null = null;
  private documentsSource: DocumentsSource | null = null;
  private inboxSource: InboxSource | null = null;

  constructor(private readonly db: PrismaClient = prismaClient) {}

  setExamSource(source: ExamSource): void {
    this.examsSource = source;
  }
  setStatementSource(source: StatementSource): void {
    this.statementSource = source;
  }
  setKardexSource(source: KardexSource): void {
    this.kardexSource = source;
  }
  setAttendanceSource(source: AttendanceSource): void {
    this.attendanceSource = source;
  }
  setDocumentsSource(source: DocumentsSource): void {
    this.documentsSource = source;
  }
  setInboxSource(source: InboxSource): void {
    this.inboxSource = source;
  }

  /** El alumno de la sesión; si la cuenta no tiene expediente, no hay tablero. */
  private async studentOf(actor: AuthenticatedUser) {
    const student = await this.db.student.findUnique({
      where: { userId: actor.id },
      select: {
        id: true,
        studentNumber: true,
        firstNames: true,
        paternalSurname: true,
        status: true,
        enrollmentDate: true,
      },
    });
    if (!student) throw new HttpError(403, "NOT_A_STUDENT");
    return student;
  }

  private async groupsOf(studentId: string): Promise<StudentGroup[]> {
    const rows = await this.db.enrollment.findMany({
      where: { studentId, status: { not: "WITHDRAWN" } },
      select: {
        id: true,
        group: {
          select: {
            id: true,
            name: true,
            classroom: true,
            schedule: true,
            course: { select: { name: true } },
            teacher: { select: { firstNames: true, surnames: true } },
          },
        },
      },
      orderBy: { group: { course: { name: "asc" } } },
    });
    return rows.map((row) => ({
      enrollmentId: row.id,
      groupId: row.group.id,
      groupName: row.group.name,
      courseName: row.group.course.name,
      teacherName: row.group.teacher ? `${row.group.teacher.firstNames} ${row.group.teacher.surnames}` : null,
      classroom: row.group.classroom,
      schedule: parseSchedule(row.group.schedule),
    }));
  }

  private async examsBlock(actor: AuthenticatedUser, user: UserPermissions) {
    if (!this.examsSource || scopeOf(user, "attempts.take") === "NONE") return null;
    const exams = await this.examsSource(actor);
    const toTake = exams.filter((exam) => exam.canStart || exam.inProgressAttemptId !== null);
    const open = exams.filter((exam) => exam.state === "OPEN");
    const upcoming = exams.filter((exam) => exam.state === "NOT_OPEN");
    // Lo siguiente por hacer: primero lo que ya puedo presentar, luego lo que abre antes.
    const next =
      toTake.find((exam) => exam.state === "OPEN") ??
      [...upcoming].sort((a, b) => a.opensAt.localeCompare(b.opensAt))[0] ??
      null;
    return { toTake: toTake.length, open: open.length, upcoming: upcoming.length, next };
  }

  private async paymentsBlock(studentId: string, actor: AuthenticatedUser, user: UserPermissions) {
    if (!this.statementSource || scopeOf(user, "charges.view") === "NONE") return null;
    const statement = await this.statementSource(studentId, actor);
    return {
      paid: statement.totals.paid,
      balance: statement.totals.balance,
      overdue: statement.totals.overdue,
      pending: pendingCharges(statement.charges),
    };
  }

  private async academicBlock(studentId: string, actor: AuthenticatedUser, user: UserPermissions) {
    const canKardex = scopeOf(user, "kardex.view") !== "NONE" && this.kardexSource !== null;
    const canAttendance = scopeOf(user, "attendance.view") !== "NONE" && this.attendanceSource !== null;
    if (!canKardex && !canAttendance) return null;
    const [kardex, attendance] = await Promise.all([
      canKardex ? this.kardexSource!(studentId, actor, "kardex.view") : null,
      canAttendance ? this.attendanceSource!(studentId, user) : null,
    ]);
    const attendanceByGroup = new Map((attendance?.groups ?? []).map((group) => [`${group.courseName}|${group.groupName}`, group]));
    const subjects: StudentSubject[] = (kardex?.entries ?? []).map((entry) => {
      const group = attendanceByGroup.get(`${entry.courseName}|${entry.groupName}`);
      return {
        courseName: entry.courseName,
        groupName: entry.groupName,
        finalGrade: entry.finalGrade,
        average: entry.finalGrade ?? average(entry.grades),
        status: entry.status,
        attendanceRate: group?.percentage ?? null,
        absences: group?.absences ?? 0,
        sessions: group?.sessions ?? 0,
      };
    });
    return {
      // El promedio del ciclo prefiere los cierres; si aún no hay, promedia lo
      // capturado por materia (misma regla que el tablero ejecutivo).
      overallAverage:
        kardex?.overallAverage ??
        average(subjects.map((subject) => subject.average).filter((value): value is number => value !== null)),
      // Asistencia del ciclo: promedio de sus grupos con registros.
      attendanceRate: average(
        (attendance?.groups ?? []).map((group) => group.percentage).filter((value): value is number => value !== null)
      ),
      subjects,
    };
  }

  private async documentsBlock(studentId: string, actor: AuthenticatedUser, user: UserPermissions) {
    if (!this.documentsSource || scopeOf(user, "documents.view") === "NONE") return null;
    const result = await this.documentsSource(studentId, actor);
    return {
      pending: result.documents.filter((doc) => doc.status !== "VALIDATED").length,
      missing: result.missing,
      requiredCount: result.requiredCount,
    };
  }

  private async notificationsBlock(actor: AuthenticatedUser) {
    if (!this.inboxSource) return null;
    const inbox = await this.inboxSource(actor.id, 5);
    return {
      unread: inbox.unread,
      latest: inbox.data.map((notice) => ({
        id: notice.id,
        subject: notice.subject,
        body: notice.body,
        createdAt: notice.createdAt,
        read: notice.readAt !== null,
      })),
    };
  }

  /** Tablero del alumno de la sesión. */
  async dashboard(actor: AuthenticatedUser, user: UserPermissions): Promise<StudentDashboard> {
    const student = await this.studentOf(actor);
    const [groups, levelName] = await Promise.all([
      this.groupsOf(student.id),
      this.levelOf(student.id),
    ]);
    const [exams, payments, academic, documents, notifications] = await Promise.all([
      this.examsBlock(actor, user),
      this.paymentsBlock(student.id, actor, user),
      this.academicBlock(student.id, actor, user),
      this.documentsBlock(student.id, actor, user),
      this.notificationsBlock(actor),
    ]);
    return {
      student: {
        id: student.id,
        studentNumber: student.studentNumber,
        name: `${student.firstNames} ${student.paternalSurname}`,
        status: student.status,
        enrollmentDate: student.enrollmentDate.toISOString().slice(0, 10),
        levelName,
      },
      groups,
      exams,
      payments,
      academic,
      documents,
      notifications,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Nivel educativo del alumno, vía el curso de su inscripción vigente. */
  private async levelOf(studentId: string): Promise<string | null> {
    const row = await this.db.enrollment.findFirst({
      where: { studentId, status: { not: "WITHDRAWN" }, group: { course: { levelId: { not: null } } } },
      select: { group: { select: { course: { select: { level: { select: { name: true } } } } } } },
      orderBy: { date: "desc" },
    });
    return row?.group.course.level?.name ?? null;
  }
}
