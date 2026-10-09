import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { E2E_PREFIX } from "./env";

/**
 * Cliente Prisma para preparar/verificar datos que la API no expone y para
 * limpiar lo que creó la suite. Solo toca filas con el prefijo `e2e_`.
 */
export const db = new PrismaClient();

/** Mismo hash que `core/utils/security.hashToken`. */
export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export interface CreateAuthUserInput {
  username: string;
  name: string;
  roleKey: string;
  password: string;
  email?: string;
}

/**
 * Alta idempotente de un usuario E2E con un solo rol. Si ya existe se
 * restablece (contraseña, rol, activo, sin bloqueo) en lugar de borrarlo: un
 * usuario que ya registró historial inmutable (movimientos, documentos) no se
 * puede borrar.
 */
export const createAuthUser = async (input: CreateAuthUserInput): Promise<{ id: string }> => {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const data = {
    email: input.email ?? `${input.username}@e2e.local`,
    passwordHash,
    name: input.name,
    active: true,
    deactivatedAt: null,
    deactivationReason: null,
    failedAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
  };
  const user = await db.user.upsert({
    where: { username: input.username },
    create: { username: input.username, ...data },
    update: data,
    select: { id: true },
  });
  await db.userRole.deleteMany({ where: { userId: user.id } });
  await db.userPermission.deleteMany({ where: { userId: user.id } });
  await db.userRole.create({ data: { userId: user.id, roleKey: input.roleKey } });
  return user;
};

/** Borra los usuarios E2E (roles, tokens y excepciones caen en cascada). */
export const clearAuthE2E = async (): Promise<number> => {
  // Quien firmó historial inmutable fuera de los datos de prueba se conserva.
  const result = await db.user.deleteMany({
    where: {
      username: { startsWith: E2E_PREFIX },
      movements: { none: {} },
      uploadedDocs: { none: {} },
    },
  });
  return result.count;
};

/** Prefijo de roles de prueba (las claves de rol van en MAYÚSCULAS). */
export const E2E_ROLE_PREFIX = "E2E_";
/** Prefijo de nombres en catálogos M11. */
export const E2E_CATALOG_PREFIX = "E2E";

/** Borra roles y políticas de prueba (matriz y vínculos caen en cascada). */
export const clearAccessE2E = async (): Promise<{ roles: number; policies: number }> => {
  const policies = await db.policy.deleteMany({ where: { key: { startsWith: E2E_PREFIX } } });
  const roles = await db.role.deleteMany({ where: { key: { startsWith: E2E_ROLE_PREFIX } } });
  return { roles: roles.count, policies: policies.count };
};

/** Borra los registros de catálogos M11 creados por las suites. */
export const clearCatalogsE2E = async (): Promise<number> => {
  await clearAcademicE2E();
  const where = { nombre: { startsWith: E2E_CATALOG_PREFIX } };
  const counts = await Promise.all([
    db.level.deleteMany({ where }),
    db.term.deleteMany({ where }),
    db.cancellationReason.deleteMany({ where }),
    db.documentType.deleteMany({ where }),
  ]);
  return counts.reduce((total, result) => total + result.count, 0);
};

/** Guarda un token de recuperación conocido (el real solo viaja por correo). */
export const createResetToken = async (userId: string, token: string, expiresInMs = 60 * 60 * 1000) => {
  await db.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + expiresInMs) },
  });
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

/** Da de baja (lógica) a un usuario E2E directo en la base. */
export const deactivateUser = async (username: string): Promise<void> => {
  await db.user.update({
    where: { username },
    data: { active: false, deactivatedAt: new Date(), deactivationReason: "e2e" },
  });
};

/** Último registro de bitácora de una acción para un usuario (o cualquiera). */
export const lastAudit = async (action: string, userId?: string) =>
  db.auditLog.findFirst({
    where: { action, ...(userId ? { userId } : {}) },
    orderBy: { createdAt: "desc" },
  });

/** Borra los alumnos de prueba (`nombres` con prefijo `E2E`) y lo que cuelga de ellos. */
export const clearStudentsE2E = async (): Promise<number> => {
  const students = await db.student.findMany({
    where: { nombres: { startsWith: E2E_CATALOG_PREFIX } },
    select: { id: true },
  });
  const ids = students.map((s) => s.id);
  if (ids.length === 0) return 0;
  // Archivos del driver local de almacenamiento (en S3 quedan a cargo del bucket de pruebas).
  const root = path.resolve(__dirname, "../../..", process.env.STORAGE_LOCAL_DIR ?? "storage/private");
  await Promise.all(ids.map((id) => fs.rm(path.join(root, "students", id), { recursive: true, force: true })));
  await clearEnrollments({ studentId: { in: ids } });
  await db.document.deleteMany({ where: { studentId: { in: ids } } });
  await db.studentMovement.deleteMany({ where: { studentId: { in: ids } } });
  const result = await db.student.deleteMany({ where: { id: { in: ids } } });
  return result.count;
};

/** Inscripciones (y sus calificaciones) que cumplan `where`. */
const clearEnrollments = async (where: Prisma.EnrollmentWhereInput): Promise<void> => {
  await db.grade.deleteMany({ where: { enrollment: where } });
  await db.enrollment.updateMany({ where, data: { transferredToId: null } });
  await db.enrollment.deleteMany({ where });
};

/**
 * Borra la oferta académica de prueba (M07/M08): cursos con clave `E2E…` y
 * todo grupo de esos cursos, de ciclos `E2E…` o de profesores de prueba.
 */
export const clearAcademicE2E = async (): Promise<number> => {
  const groups = await db.group.findMany({
    where: {
      OR: [
        { course: { clave: { startsWith: E2E_CATALOG_PREFIX } } },
        { term: { nombre: { startsWith: E2E_CATALOG_PREFIX } } },
        { teacher: { email: { startsWith: E2E_PREFIX } } },
      ],
    },
    select: { id: true },
  });
  const groupIds = groups.map((g) => g.id);
  await clearEnrollments({ groupId: { in: groupIds } });
  await db.grade.deleteMany({ where: { assessment: { groupId: { in: groupIds } } } });
  await db.assessment.deleteMany({ where: { groupId: { in: groupIds } } });
  const deleted = await db.group.deleteMany({ where: { id: { in: groupIds } } });
  const courses = await db.course.deleteMany({ where: { clave: { startsWith: E2E_CATALOG_PREFIX } } });
  return deleted.count + courses.count;
};

/** Borra los profesores de prueba (correo `e2e_…@e2e.local`); sus cuentas caen con `clearAuthE2E`. */
export const clearTeachersE2E = async (): Promise<number> => {
  await clearAcademicE2E();
  const result = await db.teacher.deleteMany({ where: { email: { startsWith: E2E_PREFIX } } });
  return result.count;
};
