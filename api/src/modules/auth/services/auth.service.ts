import type { PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { env } from "@core/config/env.config";
import { logger } from "@core/utils/logger";
import {
  comparePassword,
  hashPassword,
  hashToken,
  randomToken,
  refreshTokenExpiresAt,
  signRefreshToken,
  signToken,
  verifyRefreshToken,
  type JwtPayload,
} from "@core/utils/security";
import { permissionsOf, type PermissionException, type Scope } from "@core/permissions";
import { systemLanguage, t } from "@core/i18n";
import { HttpError } from "@core/middlewares/error.middleware";
import { sendEmail } from "@core/services/mail";
import type { AuditLogger } from "@modules/audit";
import type { AuthUserEntity } from "../models/entity/auth.entity";
import type { AuthMe, AuthUser, LoginResponse, RefreshResponse } from "../models/dto/auth.dto";

/** Select compartido: usuario + roles activos + excepciones. */
const sessionSelect = () => ({
  id: true,
  username: true,
  email: true,
  name: true,
  active: true,
  passwordHash: true,
  mustChangePassword: true,
  failedAttempts: true,
  lockedUntil: true,
  roles: {
    select: { role: { select: { key: true, active: true, sortOrder: true } } },
    orderBy: { role: { sortOrder: "asc" as const } },
  },
  permissions: {
    select: { permissionKey: true, scope: true, expiresAt: true },
  },
});

type SessionUser = {
  id: string;
  username: string;
  email: string;
  name: string;
  active: boolean;
  passwordHash: string;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  roles: Array<{ role: { key: string; active: boolean; sortOrder: number } }>;
  permissions: Array<{ permissionKey: string; scope: Scope; expiresAt: Date | null }>;
};

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 time.

export class AuthService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  private toEntity(user: SessionUser): AuthUserEntity {
    const roles = user.roles.filter((link) => link.role.active).map((link) => link.role.key);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: roles[0] ?? "",
      roles,
      active: user.active,
      passwordHash: user.passwordHash,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private exceptionsOf(user: SessionUser): PermissionException[] {
    const now = Date.now();
    return user.permissions
      .filter((exception) => !exception.expiresAt || exception.expiresAt.getTime() > now)
      .map((exception) => ({
        permission: exception.permissionKey,
        scope: exception.scope,
        expiresAt: exception.expiresAt,
      }));
  }

  private permissionsOfUser(entity: AuthUserEntity, user: SessionUser): Record<string, Scope> {
    return permissionsOf({
      id: entity.id,
      role: entity.role,
      roles: entity.roles,
      exceptions: this.exceptionsOf(user),
    });
  }

  private toAuthUser(entity: AuthUserEntity, user: SessionUser): AuthUser {
    return {
      id: entity.id,
      username: entity.username,
      name: entity.name,
      role: entity.role,
      roles: entity.roles,
      permissions: this.permissionsOfUser(entity, user),
      mustChangePassword: entity.mustChangePassword,
    };
  }

  /** Emite y persiste (hasheado) un refresh token de un solo uso. */
  private async issueRefresh(entity: AuthUserEntity): Promise<string> {
    const token = signRefreshToken({ id: entity.id, username: entity.username });
    await this.db.refreshToken.create({
      data: {
        userId: entity.id,
        tokenHash: hashToken(token),
        expiresAt: refreshTokenExpiresAt(),
      },
    });
    return token;
  }

  async login(identifier: string, password: string): Promise<LoginResponse> {
    const user = (await this.db.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
      select: sessionSelect(),
    })) as SessionUser | null;

    if (!user) throw new HttpError(401, "INVALID_CREDENTIALS");

    // Bloqueo temporal vigente.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new HttpError(429, "ACCOUNT_LOCKED", {}, { lockedUntil: user.lockedUntil });
    }
    if (!user.active) {
      throw new HttpError(401, "ACCOUNT_DEACTIVATED");
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      const attempts = user.failedAttempts + 1;
      const shouldLock = attempts >= env.MAX_LOGIN_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60 * 1000)
        : null;
      await this.db.user.update({
        where: { id: user.id },
        data: { failedAttempts: attempts, lockedUntil },
      });
      await this.audit?.({
        action: shouldLock ? "AUTH_ACCOUNT_LOCKED" : "AUTH_LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        userName: user.username,
        metadata: { identifier, attempts },
      });
      if (shouldLock) throw new HttpError(429, "ACCOUNT_LOCKED");
      throw new HttpError(401, "INVALID_CREDENTIALS");
    }

    await this.db.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const entity = this.toEntity(user);
    const payload: JwtPayload = {
      id: entity.id,
      username: entity.username,
      role: entity.role,
      roles: entity.roles,
    };
    const token = signToken(payload);
    const refreshToken = await this.issueRefresh(entity);

    await this.audit?.({
      action: "AUTH_LOGIN",
      entityType: "User",
      entityId: entity.id,
      userId: entity.id,
      userName: entity.username,
    });

    return { token, refreshToken, user: this.toAuthUser(entity, user) };
  }

  /** Renueva el access rotando el refresh; un refresh revocado no sirve. */
  async refresh(refreshToken: string): Promise<RefreshResponse> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new HttpError(401, "INVALID_REFRESH_TOKEN");
    }

    const record = await this.db.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (
      !record ||
      record.userId !== payload.id ||
      record.revokedAt !== null ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new HttpError(401, "INVALID_REFRESH_TOKEN");
    }

    const user = (await this.db.user.findUnique({
      where: { id: payload.id },
      select: sessionSelect(),
    })) as SessionUser | null;
    if (!user || !user.active) throw new HttpError(401, "INVALID_SESSION");

    // Rotación: el anterior se revoca y se emite uno nuevo.
    await this.db.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const entity = this.toEntity(user);
    const token = signToken({
      id: entity.id,
      username: entity.username,
      role: entity.role,
      roles: entity.roles,
    });
    return { token, refreshToken: await this.issueRefresh(entity) };
  }

  async me(userId: string): Promise<AuthMe> {
    const user = (await this.db.user.findUnique({
      where: { id: userId },
      select: sessionSelect(),
    })) as SessionUser | null;
    if (!user || !user.active) throw new HttpError(404, "USER_NOT_FOUND");

    const entity = this.toEntity(user);
    return {
      user: {
        id: entity.id,
        username: entity.username,
        name: entity.name,
        role: entity.role,
        mustChangePassword: entity.mustChangePassword,
      },
      roles: entity.roles,
      permissions: this.permissionsOfUser(entity, user),
      language: await systemLanguage(),
    };
  }

  /** Revoca el refresh vigente (o todos si no se indica uno). */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    const revokedAt = new Date();
    await this.db.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(refreshToken ? { tokenHash: hashToken(refreshToken) } : {}),
      },
      data: { revokedAt },
    });
    await this.audit?.({
      action: "AUTH_LOGOUT",
      entityType: "User",
      entityId: userId,
      userId,
    });
  }

  /** Responde siempre 200; solo actúa si el usuario existe y está activo. */
  async forgotPassword(identifier: string): Promise<void> {
    const user = await this.db.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
      select: { id: true, username: true, email: true, name: true, active: true },
    });
    if (!user || !user.active) return;

    const token = randomToken();
    await this.db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    await this.audit?.({
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "User",
      entityId: user.id,
      userId: user.id,
      userName: user.username,
    });

    // La web usa HashRouter: la ruta cuelga de `#`.
    const link = `${env.APP_URL.replace(/\/+$/, "")}/#/reset-password?token=${token}`;
    void sendEmail({
      to: user.email,
      subject: t("emails.passwordReset.subject"),
      html:
        `<p>${t("emails.greeting", { name: user.name })}</p>` +
        `<p>${t("emails.passwordReset.body")}</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p>${t("emails.passwordReset.expiry")}</p>`,
    }).catch((error) => logger.error(`[auth] forgot-password email failed: ${String(error)}`));
  }

  /**
   * Cambio de contraseña propio (incluida la temporal). Exige la actual, revoca
   * todas las sesiones y emite tokens nuevos para la sesión en curso.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<RefreshResponse> {
    const user = (await this.db.user.findUnique({
      where: { id: userId },
      select: sessionSelect(),
    })) as SessionUser | null;
    if (!user || !user.active) throw new HttpError(401, "INVALID_SESSION");

    if (!(await comparePassword(currentPassword, user.passwordHash))) {
      throw new HttpError(422, "CURRENT_PASSWORD_INVALID");
    }
    if (await comparePassword(newPassword, user.passwordHash)) {
      throw new HttpError(422, "PASSWORD_REUSED");
    }

    const passwordHash = await hashPassword(newPassword);
    await this.db.$transaction([
      this.db.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.db.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit?.({
      action: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: userId,
      userId,
      userName: user.username,
    });

    const entity = this.toEntity({ ...user, mustChangePassword: false });
    const token = signToken({
      id: entity.id,
      username: entity.username,
      role: entity.role,
      roles: entity.roles,
    });
    return { token, refreshToken: await this.issueRefresh(entity) };
  }

  /** Restablece con token vigente, no usado; invalida las sesiones. */
  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.db.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(422, "RESET_TOKEN_INVALID");
    }

    const passwordHash = await hashPassword(password);
    await this.db.$transaction([
      this.db.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.db.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.db.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit?.({
      action: "PASSWORD_RESET_COMPLETED",
      entityType: "User",
      entityId: record.userId,
      userId: record.userId,
    });
  }
}
