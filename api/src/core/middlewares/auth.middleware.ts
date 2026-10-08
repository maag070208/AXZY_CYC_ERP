import { Request, Response, NextFunction } from "express";
import {
  verifyToken,
  isRefreshToken,
  type JwtPayload,
  type AuthenticatedUser,
} from "@core/utils/security";
import { HttpError } from "./error.middleware";
import { prismaClient } from "@core/config/database";
import { isPermission, permissionsOf, scopeOf, type Scope } from "@core/permissions";
import { logger } from "@core/utils/logger";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifica la firma del token y, además, que el usuario siga existiendo y
 * activo en la base de datos. El JWT solo identifica: rol, roles y permisos se
 * releen frescos de la BD en cada petición.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const header = req.headers.authorization;
    if (!header) throw new HttpError(401, "TOKEN_MISSING");
    const parts = header.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new HttpError(401, "INVALID_AUTHORIZATION_HEADER");
    }

    let payload: JwtPayload;
    try {
      payload = verifyToken(parts[1]);
      // Un refresh token no sirve como access: solo identifica para renovar.
      if (isRefreshToken(payload)) throw new Error("NOT_AN_ACCESS_TOKEN");
    } catch {
      throw new HttpError(401, "INVALID_TOKEN");
    }

    prismaClient.user
      .findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          username: true,
          active: true,
          roles: {
            select: {
              role: { select: { key: true, active: true, sortOrder: true } },
            },
            orderBy: { role: { sortOrder: "asc" } },
          },
          permissions: {
            where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            select: { permissionKey: true, scope: true, expiresAt: true },
          },
        },
      })
      .then((user) => {
        if (!user || !user.active) {
          next(new HttpError(401, "INVALID_SESSION"));
          return;
        }
        const roles = user.roles.filter((link) => link.role.active).map((link) => link.role.key);
        const role = roles[0] ?? "";
        const exceptions = user.permissions.map((exception) => ({
          permission: exception.permissionKey,
          scope: exception.scope as Scope,
          expiresAt: exception.expiresAt,
        }));
        req.user = {
          id: user.id,
          username: user.username,
          role,
          roles,
          exceptions,
          permissions: permissionsOf({ id: user.id, role, roles, exceptions }),
        } satisfies AuthenticatedUser;
        next();
      })
      .catch(next);
  } catch (err) {
    next(err);
  }
};

/**
 * Exige un permiso con cualquier alcance distinto de NONE. El alcance por
 * registro lo aplica el servicio correspondiente.
 *
 * Si la clave no está en el catálogo activo, la ruta queda cerrada (403) y se
 * avisa una sola vez por clave: un permiso mal escrito no abre nada.
 */
const warnedPermissions = new Set<string>();

/**
 * Auditoría de intentos denegados. Se escribe en segundo plano: un fallo al
 * registrar nunca cambia la respuesta (que ya es 403).
 */
const recordDeniedAccess = (req: Request, permission: string): void => {
  const user = req.user;
  void prismaClient.auditLog
    .create({
      data: {
        action: "ACCESS_DENIED",
        entityType: "Permission",
        entityId: permission,
        userId: user?.id ?? null,
        userName: user?.username ?? null,
        metadata: { path: req.originalUrl, method: req.method },
      },
    })
    .catch(() => undefined);
};

export const requiresPermission = (permission: string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    if (!isPermission(permission)) {
      if (!warnedPermissions.has(permission)) {
        warnedPermissions.add(permission);
        logger.warn(`Unknown permission "${permission}": the route stays closed (403)`);
      }
      recordDeniedAccess(req, permission);
      throw new HttpError(403, "INSUFFICIENT_PERMISSIONS");
    }
    if (scopeOf(req.user, permission) === "NONE") {
      recordDeniedAccess(req, permission);
      throw new HttpError(403, "INSUFFICIENT_PERMISSIONS");
    }
    next();
  };
};

/**
 * Exige **al menos uno** de los permisos. Cada clave se evalúa de forma
 * independiente.
 */
export const requiresAnyPermission = (permissions: readonly string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) throw new HttpError(401, "UNAUTHENTICATED");
    const allowed = permissions.some(
      (permission) => isPermission(permission) && scopeOf(user, permission) !== "NONE"
    );
    if (!allowed) {
      recordDeniedAccess(req, permissions.join("|"));
      throw new HttpError(403, "INSUFFICIENT_PERMISSIONS");
    }
    next();
  };
};
