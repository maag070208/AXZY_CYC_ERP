import type { Prisma, PrismaClient, Teacher, User } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { env } from "@core/config/env.config";
import { HttpError } from "@core/middlewares/error.middleware";
import { scopeOf, scopeWhere, type UserPermissions } from "@core/permissions";
import { enforcePolicy } from "@core/policies";
import { paginatedQuery } from "@core/db/table";
import { sendEmail } from "@core/services/mail";
import { logger } from "@core/utils/logger";
import { hashPassword, hashToken, randomToken, type AuthenticatedUser } from "@core/utils/security";
import {
  filterEnum,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
  type TableFilters,
} from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import type { TeacherCreateInput, TeacherUpdateInput, TeacherView } from "../models/dto/teacher.dto";

/** La invitación es un token de restablecimiento de contraseña de vida más larga. */
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const STATUSES = ["ACTIVE", "INACTIVE"] as const;

type AccountFields = Pick<User, "id" | "username" | "active" | "mustChangePassword" | "lastLoginAt">;
type TeacherRow = Teacher & { user: AccountFields | null };

const include = {
  user: { select: { id: true, username: true, active: true, mustChangePassword: true, lastLoginAt: true } },
};

const toView = (row: TeacherRow): TeacherView => ({
  id: row.id,
  firstNames: row.firstNames,
  surnames: row.surnames,
  nombreCompleto: `${row.firstNames} ${row.surnames}`,
  email: row.email,
  phone: row.phone,
  specialty: row.specialty,
  status: row.status,
  account: row.user
    ? {
        userId: row.user.id,
        username: row.user.username,
        active: row.user.active,
        pendingInvitation: row.user.mustChangePassword,
        lastLoginAt: row.user.lastLoginAt?.toISOString() ?? null,
      }
    : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const auditState = (view: TeacherView): Prisma.InputJsonObject => ({
  firstNames: view.firstNames,
  surnames: view.surnames,
  email: view.email,
  phone: view.phone,
  specialty: view.specialty,
  status: view.status,
});

/** Base de username a partir del correo (`ana.ramirez@x.mx` → `ana.ramirez`). */
export const usernameBase = (email: string): string => {
  const local = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return local.length >= 3 ? local.slice(0, 50) : `prof.${local}`.slice(0, 50);
};

/**
 * Profesores (M04). El alta crea, en una sola transacción, el profesor y su
 * cuenta con rol PROFESOR y una invitación (token de un uso, 72 h) para que
 * defina su contraseña; el correo sale después del commit y no bloquea.
 */
export class TeacherService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private scope(user: UserPermissions, permission: string) {
    return scopeWhere<Prisma.TeacherWhereInput>(user, {
      resource: "teachers",
      permission,
      own: (u) => ({ userId: u.id }),
      byIds: (ids) => ({ id: { in: ids } }),
      or: (filters) => ({ OR: filters }),
      none: { id: { in: [] } },
    });
  }

  private async load(id: string, user: UserPermissions, permission: string): Promise<TeacherRow> {
    const scoped = await this.scope(user, permission);
    const row = await this.db.teacher.findFirst({ where: { AND: [{ id }, ...(scoped ? [scoped] : [])] }, include });
    if (!row) throw new HttpError(404, "TEACHER_NOT_FOUND");
    return row;
  }

  private async where(filters: TableFilters, user: UserPermissions): Promise<Prisma.TeacherWhereInput> {
    const and: Prisma.TeacherWhereInput[] = [];
    const name = filterText(filters, "name");
    if (name) {
      for (const word of name.contains.split(/\s+/).filter(Boolean)) {
        and.push({
          OR: [
            { firstNames: { contains: word, mode: "insensitive" } },
            { surnames: { contains: word, mode: "insensitive" } },
          ],
        });
      }
    }
    const email = filterText(filters, "email");
    if (email) and.push({ email });
    const specialty = filterText(filters, "specialty");
    if (specialty) and.push({ specialty });
    const status = filterEnum(filters, "status", STATUSES);
    if (status) and.push({ status });
    const scoped = await this.scope(user, "teachers.view");
    if (scoped) and.push(scoped);
    return and.length ? { AND: and } : {};
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<TeacherView>> {
    const orderBy = orderByOf(
      params.sort,
      {
        name: (direction) => [{ surnames: direction }, { firstNames: direction }],
        email: "email",
        specialty: "specialty",
        status: "status",
        createdAt: "createdAt",
      },
      [{ surnames: "asc" }, { firstNames: "asc" }]
    ).flat();
    const result = await paginatedQuery<TeacherRow>({
      model: this.db.teacher,
      where: (await this.where(params.filters, user)) as Record<string, unknown>,
      orderBy,
      include,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toView), total: result.total };
  }

  async getById(id: string, user: UserPermissions): Promise<TeacherView> {
    return toView(await this.load(id, user, "teachers.view"));
  }

  private async assertEmailFree(email: string, except?: { teacherId?: string; userId?: string | null }): Promise<void> {
    const [teacher, user] = await Promise.all([
      this.db.teacher.findFirst({ where: { email, ...(except?.teacherId ? { NOT: { id: except.teacherId } } : {}) } }),
      this.db.user.findFirst({ where: { email, ...(except?.userId ? { NOT: { id: except.userId } } : {}) } }),
    ]);
    if (teacher || user) throw new HttpError(409, "TEACHER_EMAIL_TAKEN");
  }

  private async freeUsername(email: string, tx: Prisma.TransactionClient): Promise<string> {
    const base = usernameBase(email);
    for (let n = 1; n < 500; n++) {
      const candidate = n === 1 ? base : `${base}${n}`;
      if (!(await tx.user.findUnique({ where: { username: candidate }, select: { id: true } }))) return candidate;
    }
    throw new HttpError(409, "USERNAME_TAKEN");
  }

  private invitationLink(token: string): string {
    return `${env.APP_URL.replace(/\/+$/, "")}/#/reset-password?token=${token}`;
  }

  private sendInvitation(view: TeacherView, token: string): void {
    const link = this.invitationLink(token);
    void sendEmail({
      to: view.email,
      subject: "Invitación al Sistema de Gestión Escolar — CYC",
      html:
        `<p>Hola ${view.firstNames},</p>` +
        `<p>Se creó tu cuenta de profesor con el usuario <b>${view.account?.username ?? ""}</b>.</p>` +
        `<p>Define tu contraseña aquí: <a href="${link}">${link}</a></p>` +
        `<p>El enlace vence en 72 horas y es de un solo uso.</p>`,
    }).catch((error) => logger.error(`[teachers] invitation email failed: ${String(error)}`));
  }

  async create(input: TeacherCreateInput, actor: AuthenticatedUser): Promise<TeacherView & { invitationQueued: boolean }> {
    await this.assertEmailFree(input.email);
    enforcePolicy("users.create", actor, { roles: ["TEACHER"] });
    const token = randomToken();
    // Contraseña inutilizable: la persona la define con la invitación.
    const passwordHash = await hashPassword(randomToken());

    const view = await this.db.$transaction(async (tx) => {
      const username = await this.freeUsername(input.email, tx);
      const user = await tx.user.create({
        data: {
          username,
          email: input.email,
          passwordHash,
          name: `${input.firstNames} ${input.surnames}`,
          phone: input.phone ?? null,
          mustChangePassword: true,
          roles: { create: [{ roleKey: "TEACHER" }] },
        },
      });
      const row = await tx.teacher.create({
        data: {
          firstNames: input.firstNames,
          surnames: input.surnames,
          email: input.email,
          phone: input.phone ?? null,
          specialty: input.specialty ?? null,
          userId: user.id,
        },
        include,
      });
      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITATION_TTL_MS) },
      });
      const created = toView(row);
      const actorFields = { userId: actor.id, userName: actor.username };
      await this.audit?.(
        { action: "USER_CREATED", entityType: "User", entityId: user.id, ...actorFields,
          newState: { username, name: user.name, email: user.email, roles: ["TEACHER"] } },
        tx
      );
      await this.audit?.(
        { action: "TEACHER_CREATED", entityType: "Teacher", entityId: row.id, ...actorFields,
          newState: { ...auditState(created), userId: user.id } },
        tx
      );
      await this.audit?.(
        { action: "TEACHER_INVITATION_SENT", entityType: "Teacher", entityId: row.id, ...actorFields,
          metadata: { userId: user.id, email: input.email } },
        tx
      );
      return created;
    });

    this.sendInvitation(view, token);
    return { ...view, invitationQueued: true };
  }

  async update(id: string, input: TeacherUpdateInput, actor: AuthenticatedUser): Promise<TeacherView> {
    const previous = await this.load(id, actor, "teachers.edit");
    if (input.email && input.email !== previous.email) {
      await this.assertEmailFree(input.email, { teacherId: id, userId: previous.userId });
    }
    const before = toView(previous);
    return this.db.$transaction(async (tx) => {
      const row = await tx.teacher.update({
        where: { id },
        data: {
          ...(input.firstNames !== undefined && { firstNames: input.firstNames }),
          ...(input.surnames !== undefined && { surnames: input.surnames }),
          ...(input.email !== undefined && { email: input.email }),
          ...(input.phone !== undefined && { phone: input.phone }),
          ...(input.specialty !== undefined && { specialty: input.specialty }),
        },
        include,
      });
      // La cuenta sigue los datos de contacto del profesor.
      if (previous.userId) {
        await tx.user.update({
          where: { id: previous.userId },
          data: {
            name: `${row.firstNames} ${row.surnames}`,
            email: row.email,
            phone: row.phone,
          },
        });
      }
      const after = toView(row);
      await this.audit?.(
        {
          action: "TEACHER_UPDATED",
          entityType: "Teacher",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: auditState(before),
          newState: auditState(after),
        },
        tx
      );
      return after;
    });
  }

  /** Solo con `teachers.edit` en ALL: un profesor no se da de baja a sí mismo. */
  private assertManager(actor: AuthenticatedUser): void {
    if (scopeOf(actor, "teachers.edit") !== "ALL") throw new HttpError(403, "INSUFFICIENT_PERMISSIONS");
  }

  async deactivate(id: string, actor: AuthenticatedUser, reason?: string): Promise<TeacherView> {
    this.assertManager(actor);
    const previous = await this.load(id, actor, "teachers.edit");
    if (previous.status === "INACTIVE") throw new HttpError(409, "TEACHER_INACTIVE");
    if (previous.userId === actor.id) throw new HttpError(400, "CANNOT_DEACTIVATE_SELF");
    return this.db.$transaction(async (tx) => {
      const row = await tx.teacher.update({ where: { id }, data: { status: "INACTIVE" }, include });
      if (previous.userId) {
        await tx.user.update({
          where: { id: previous.userId },
          data: { active: false, deactivatedAt: new Date(), deactivationReason: reason ?? "Profesor inactivo" },
        });
        await tx.refreshToken.updateMany({
          where: { userId: previous.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit?.(
        {
          action: "TEACHER_DEACTIVATED",
          entityType: "Teacher",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: { status: "ACTIVE" },
          newState: { status: "INACTIVE" },
          metadata: { reason: reason ?? null, userId: previous.userId },
        },
        tx
      );
      return toView({ ...row, user: row.user ? { ...row.user, active: false } : null });
    });
  }

  async reactivate(id: string, actor: AuthenticatedUser): Promise<TeacherView> {
    this.assertManager(actor);
    const previous = await this.load(id, actor, "teachers.edit");
    if (previous.status === "ACTIVE") throw new HttpError(409, "TEACHER_ALREADY_ACTIVE");
    return this.db.$transaction(async (tx) => {
      if (previous.userId) {
        await tx.user.update({
          where: { id: previous.userId },
          data: { active: true, deactivatedAt: null, deactivationReason: null, failedAttempts: 0, lockedUntil: null },
        });
      }
      const row = await tx.teacher.update({ where: { id }, data: { status: "ACTIVE" }, include });
      await this.audit?.(
        {
          action: "TEACHER_REACTIVATED",
          entityType: "Teacher",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: { status: "INACTIVE" },
          newState: { status: "ACTIVE" },
        },
        tx
      );
      return toView(row);
    });
  }

  /** Reenvía la invitación: invalida las anteriores y emite una nueva (no crea otra cuenta). */
  async resendInvitation(id: string, actor: AuthenticatedUser): Promise<{ ok: true }> {
    const teacher = await this.load(id, actor, "teachers.edit");
    if (teacher.status === "INACTIVE") throw new HttpError(409, "TEACHER_INACTIVE");
    if (!teacher.user) throw new HttpError(409, "TEACHER_HAS_NO_ACCOUNT");
    if (!teacher.user.mustChangePassword) throw new HttpError(409, "INVITATION_NOT_PENDING");
    const userId = teacher.user.id;
    const token = randomToken();
    await this.db.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
      await tx.passwordResetToken.create({
        data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITATION_TTL_MS) },
      });
      await this.audit?.(
        {
          action: "TEACHER_INVITATION_RESENT",
          entityType: "Teacher",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          metadata: { userId, email: teacher.email },
        },
        tx
      );
    });
    this.sendInvitation(toView(teacher), token);
    return { ok: true };
  }
}
