import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { E2E_PREFIX } from "./env";

/**
 * Cliente Prisma para preparar/verificar datos que la API no expone y para
 * limpiar lo que creó la suite. Solo toca filas con el prefijo `e2e_`.
 */
export const db = new PrismaClient();

export interface CreateAuthUserInput {
  username: string;
  name: string;
  roleKey: string;
  password: string;
  email?: string;
}

/** Alta idempotente de un usuario E2E con un solo rol. */
export const createAuthUser = async (input: CreateAuthUserInput): Promise<{ id: string }> => {
  await db.user.deleteMany({ where: { username: input.username } });
  const passwordHash = await bcrypt.hash(input.password, 10);
  return db.user.create({
    data: {
      username: input.username,
      email: input.email ?? `${input.username}@e2e.local`,
      passwordHash,
      name: input.name,
      roles: { create: [{ roleKey: input.roleKey }] },
    },
    select: { id: true },
  });
};

/** Borra los usuarios E2E (roles, tokens y excepciones caen en cascada). */
export const clearAuthE2E = async (): Promise<number> => {
  const result = await db.user.deleteMany({
    where: { username: { startsWith: E2E_PREFIX } },
  });
  return result.count;
};

/** Estado de bloqueo del usuario, leído directo de la base. */
export const lockState = async (
  username: string
): Promise<{ failedAttempts: number; lockedUntil: Date | null; active: boolean } | null> => {
  return db.user.findUnique({
    where: { username },
    select: { failedAttempts: true, lockedUntil: true, active: true },
  });
};

/** Cuenta los refresh tokens vigentes (no revocados) de un usuario. */
export const activeRefreshTokens = async (userId: string): Promise<number> => {
  return db.refreshToken.count({ where: { userId, revokedAt: null } });
};
