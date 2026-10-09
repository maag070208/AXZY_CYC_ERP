import type { Prisma, PrismaClient } from "@prisma/client";
import { registerAreaResolver, scopeOf, scopeWhere, type UserPermissions } from "@core/permissions";
import { HttpError } from "@core/middlewares/error.middleware";

/**
 * Alcance académico (M07). El ámbito `AREA` de un profesor son **sus grupos**
 * (`groups.teacher_id` → `teachers.user_id`); lo `OWN` de un alumno son los
 * grupos donde tiene una inscripción vigente. Todos los recursos académicos
 * (grupos, inscripciones, instrumentos, calificaciones) se filtran contra el
 * mismo resolvedor `groups`, y los alumnos del profesor se publican como el
 * ámbito `AREA` de `students` (expediente, kardex) para los demás módulos.
 */
export const GROUPS_RESOURCE = "groups";

/** Inscripción que cuenta para cupo y alcance. */
export const CURRENT_ENROLLMENT: Prisma.EnrollmentWhereInput = { status: { not: "BAJA" } };

export const registerAcademicScopes = (db: PrismaClient): void => {
  registerAreaResolver(GROUPS_RESOURCE, async (user) => {
    const rows = await db.group.findMany({ where: { teacher: { userId: user.id } }, select: { id: true } });
    return rows.map((r) => r.id);
  });
  registerAreaResolver("students", async (user) => {
    const rows = await db.enrollment.findMany({
      where: { ...CURRENT_ENROLLMENT, group: { teacher: { userId: user.id } } },
      select: { studentId: true },
      distinct: ["studentId"],
    });
    return rows.map((r) => r.studentId);
  });
};

const spec = <W>(permission: string, own: (u: UserPermissions) => W, byIds: (ids: string[]) => W, none: W) => ({
  resource: GROUPS_RESOURCE,
  permission,
  own,
  byIds,
  or: (filters: W[]) => ({ OR: filters }) as W,
  none,
});

export const groupScope = (user: UserPermissions, permission: string) =>
  scopeWhere<Prisma.GroupWhereInput>(
    user,
    spec<Prisma.GroupWhereInput>(
      permission,
      (u) => ({ enrollments: { some: { ...CURRENT_ENROLLMENT, student: { userId: u.id } } } }),
      (ids) => ({ id: { in: ids } }),
      { id: { in: [] } }
    )
  );

export const enrollmentScope = (user: UserPermissions, permission: string) =>
  scopeWhere<Prisma.EnrollmentWhereInput>(
    user,
    spec<Prisma.EnrollmentWhereInput>(
      permission,
      (u) => ({ student: { userId: u.id } }),
      (ids) => ({ groupId: { in: ids } }),
      { id: { in: [] } }
    )
  );

export const courseScope = (user: UserPermissions, permission: string) =>
  scopeWhere<Prisma.CourseWhereInput>(
    user,
    spec<Prisma.CourseWhereInput>(
      permission,
      (u) => ({ groups: { some: { enrollments: { some: { ...CURRENT_ENROLLMENT, student: { userId: u.id } } } } } }),
      (ids) => ({ groups: { some: { id: { in: ids } } } }),
      { id: { in: [] } }
    )
  );

/**
 * Para escrituras: el grupo debe estar dentro del alcance del permiso; fuera
 * de él responde 403 (no 404), como pide M08 §4.7.
 */
export const assertGroupInScope = async (
  db: PrismaClient | Prisma.TransactionClient,
  user: UserPermissions,
  permission: string,
  groupId: string
): Promise<void> => {
  if (scopeOf(user, permission) === "ALL") return;
  const scoped = await groupScope(user, permission);
  const hit = await db.group.count({ where: { AND: [{ id: groupId }, ...(scoped ? [scoped] : [])] } });
  if (hit === 0) throw new HttpError(403, "INSUFFICIENT_PERMISSIONS");
};
