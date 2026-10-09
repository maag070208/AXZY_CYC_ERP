import { Prisma, type PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { scopeWhere, type UserPermissions } from "@core/permissions";
import { paginatedQuery } from "@core/db/table";
import {
  filterDayRange,
  filterEnum,
  filterText,
  orderByOf,
  type ITDataTableFetchParams,
  type ITDataTableResponse,
  type TableFilters,
} from "@core/utils/table";
import { ageOn, fromDbDay, toDbDay, todayInBusinessZone } from "@core/utils/day";
import type { AuthenticatedUser } from "@core/utils/security";
import type { AuditLogger } from "@modules/audit";
import type {
  GuardianInput,
  StudentCreateInput,
  StudentUpdateInput,
  StudentView,
} from "../models/dto/student.dto";
import type { StudentRow } from "../models/entity/student.entity";
import { t } from "@core/i18n";

const ADULT_AGE = 18;
const STATUSES = ["ACTIVE", "WITHDRAWN"] as const;
const include = { guardians: { orderBy: { createdAt: "asc" as const } } };

export const fullName = (s: { firstNames: string; paternalSurname: string; maternalSurname: string | null }) =>
  [s.firstNames, s.paternalSurname, s.maternalSurname].filter(Boolean).join(" ");

export const toStudentView = (row: StudentRow): StudentView => ({
  id: row.id,
  studentNumber: row.studentNumber,
  firstNames: row.firstNames,
  paternalSurname: row.paternalSurname,
  maternalSurname: row.maternalSurname,
  fullName: fullName(row),
  curp: row.curp,
  birthDate: fromDbDay(row.birthDate),
  gender: row.gender,
  email: row.email,
  phone: row.phone,
  address: row.address,
  status: row.status,
  enrollmentDate: fromDbDay(row.enrollmentDate),
  userId: row.userId,
  guardians: row.guardians.map((g) => ({
    id: g.id,
    name: g.name,
    relationship: g.relationship,
    phone: g.phone,
    email: g.email,
    isPaymentResponsible: g.isPaymentResponsible,
  })),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Estado auditable del alumno (incluye tutores; sin ids internos). */
const auditState = (view: StudentView): Prisma.InputJsonObject => {
  const { id: _id, createdAt: _c, updatedAt: _u, fullName: _n, ...rest } = view;
  return {
    ...rest,
    guardians: view.guardians.map(({ id: _gid, ...g }) => g),
  } as unknown as Prisma.InputJsonObject;
};

/** Matrícula `AAAA-NNNN` (el consecutivo crece si pasa de 9999). */
export const formatStudentNumber = (year: number, consecutive: number): string =>
  `${year}-${String(consecutive).padStart(4, "0")}`;

/**
 * Reglas de tutores (M03 reglas 5 y 6). **Pura**: menor de edad exige al menos
 * un tutor y a lo sumo uno es responsable de pago.
 */
export const assertGuardians = (birthDate: string, guardians: GuardianInput[], today: string): void => {
  if (ageOn(birthDate, today) < ADULT_AGE && guardians.length === 0) {
    throw new HttpError(400, "GUARDIAN_REQUIRED");
  }
  if (guardians.filter((g) => g.isPaymentResponsible).length > 1) {
    throw new HttpError(400, "MULTIPLE_PAYMENT_RESPONSIBLES");
  }
};

/** Filtro de nombre: cada palabra debe aparecer en nombres o apellidos. */
const nameFilter = (filters: TableFilters): Prisma.StudentWhereInput | undefined => {
  const text = filterText(filters, "name");
  if (!text) return undefined;
  const words = text.contains.split(/\s+/).filter(Boolean);
  return {
    AND: words.map((word) => ({
      OR: [
        { firstNames: { contains: word, mode: "insensitive" as const } },
        { paternalSurname: { contains: word, mode: "insensitive" as const } },
        { maternalSurname: { contains: word, mode: "insensitive" as const } },
      ],
    })),
  };
};

/**
 * Alumnos (M03). Alcance por registro con `students.view` (ALL / AREA / OWN);
 * la matrícula se genera en la transacción del alta con un consecutivo por año.
 */
export class StudentService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  /** Filtro de alcance para un permiso de lectura de alumnos. */
  scope(user: UserPermissions, permission = "students.view") {
    return scopeWhere<Prisma.StudentWhereInput>(user, {
      resource: "students",
      permission,
      own: (u) => ({ userId: u.id }),
      byIds: (ids) => ({ id: { in: ids } }),
      or: (filters) => ({ OR: filters }),
      none: { id: { in: [] } },
    });
  }

  private async where(filters: TableFilters, user: UserPermissions): Promise<Prisma.StudentWhereInput> {
    const and: Prisma.StudentWhereInput[] = [];
    const name = nameFilter(filters);
    if (name) and.push(name);
    const studentNumber = filterText(filters, "studentNumber");
    if (studentNumber) and.push({ studentNumber });
    const curp = filterText(filters, "curp");
    if (curp) and.push({ curp });
    const status = filterEnum(filters, "status", STATUSES);
    if (status) and.push({ status });
    const enrollmentDate = filterDayRange(filters, "enrollmentDate");
    if (enrollmentDate) and.push({ enrollmentDate: enrollmentDate });
    const scoped = await this.scope(user);
    if (scoped) and.push(scoped);
    return and.length > 0 ? { AND: and } : {};
  }

  private orderBy(sort: ITDataTableFetchParams["sort"]) {
    return orderByOf(
      sort,
      {
        studentNumber: "studentNumber",
        name: (direction) => [{ paternalSurname: direction }, { maternalSurname: direction }, { firstNames: direction }],
        curp: "curp",
        status: "status",
        enrollmentDate: "enrollmentDate",
        createdAt: "createdAt",
      },
      [{ paternalSurname: "asc" }, { maternalSurname: "asc" }, { firstNames: "asc" }]
    ).flat();
  }

  async table(params: ITDataTableFetchParams, user: UserPermissions): Promise<ITDataTableResponse<StudentView>> {
    const result = await paginatedQuery<StudentRow>({
      model: this.db.student,
      where: (await this.where(params.filters, user)) as Record<string, unknown>,
      orderBy: this.orderBy(params.sort),
      include,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toStudentView), total: result.total };
  }

  /** Totales por estatus dentro del alcance (KPIs del listado). */
  async summary(user: UserPermissions): Promise<{ total: number; active: number; withdrawn: number }> {
    const scoped = (await this.scope(user)) ?? {};
    const [active, withdrawn] = await Promise.all([
      this.db.student.count({ where: { AND: [scoped, { status: "ACTIVE" }] } }),
      this.db.student.count({ where: { AND: [scoped, { status: "WITHDRAWN" }] } }),
    ]);
    return { total: active + withdrawn, active, withdrawn };
  }

  /** Detalle dentro del alcance; fuera de él responde 404 (no revela existencia). */
  async getById(id: string, user: UserPermissions, permission = "students.view"): Promise<StudentView> {
    return toStudentView(await this.loadScoped(id, user, permission));
  }

  async loadScoped(id: string, user: UserPermissions, permission = "students.view"): Promise<StudentRow> {
    const scoped = await this.scope(user, permission);
    const row = await this.db.student.findFirst({
      where: { AND: [{ id }, ...(scoped ? [scoped] : [])] },
      include,
    });
    if (!row) throw new HttpError(404, "STUDENT_NOT_FOUND");
    return row;
  }

  private async assertUniqueCurp(curp: string, exceptId?: string): Promise<void> {
    const taken = await this.db.student.findFirst({
      where: { curp, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true, studentNumber: true },
    });
    if (taken) throw new HttpError(409, "DUPLICATE_CURP", {}, { studentNumber: taken.studentNumber });
  }

  /** Duplicado probable: mismo nombre completo y nacimiento (requiere confirmar). */
  private async assertNotDuplicatePerson(
    input: { firstNames: string; paternalSurname: string; maternalSurname?: string | null; birthDate: string },
    confirmed: boolean | undefined,
    exceptId?: string
  ): Promise<void> {
    if (confirmed) return;
    const matches = await this.db.student.findMany({
      where: {
        firstNames: { equals: input.firstNames, mode: "insensitive" },
        paternalSurname: { equals: input.paternalSurname, mode: "insensitive" },
        maternalSurname: input.maternalSurname
          ? { equals: input.maternalSurname, mode: "insensitive" }
          : null,
        birthDate: toDbDay(input.birthDate),
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true, studentNumber: true, curp: true },
      take: 5,
    });
    if (matches.length > 0) throw new HttpError(409, "DUPLICATE_STUDENT", {}, { matches });
  }

  private async assertLinkableUser(userId: string, exceptStudentId?: string): Promise<void> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new HttpError(400, "USER_NOT_FOUND");
    const linked = await this.db.student.findFirst({
      where: { userId, ...(exceptStudentId ? { NOT: { id: exceptStudentId } } : {}) },
      select: { id: true },
    });
    if (linked) throw new HttpError(409, "USER_ALREADY_LINKED");
  }

  async create(input: StudentCreateInput, actor: AuthenticatedUser): Promise<StudentView> {
    const today = todayInBusinessZone();
    if (input.birthDate > today) throw new HttpError(400, "FUTURE_DATE", { field: "birthDate" });
    const guardians = input.guardians ?? [];
    assertGuardians(input.birthDate, guardians, today);
    await this.assertUniqueCurp(input.curp);
    await this.assertNotDuplicatePerson(input, input.confirmDuplicate);
    if (input.userId) await this.assertLinkableUser(input.userId);

    const enrollmentDate = input.enrollmentDate ?? today;
    const year = Number(enrollmentDate.slice(0, 4));

    const created = await this.db.$transaction(async (tx) => {
      // Consecutivo por año: el UPDATE ... +1 bloquea la fila hasta el commit,
      // así dos altas simultáneas nunca obtienen el mismo número.
      const sequence = await tx.studentNumberSequence.upsert({
        where: { year },
        create: { year, last: 1 },
        update: { last: { increment: 1 } },
      });
      const studentNumber = formatStudentNumber(year, sequence.last);
      const taken = await tx.student.findUnique({ where: { studentNumber }, select: { id: true } });
      if (taken) throw new HttpError(409, "DUPLICATE_STUDENT_NUMBER", { studentNumber });

      const row = await tx.student.create({
        data: {
          studentNumber,
          firstNames: input.firstNames,
          paternalSurname: input.paternalSurname,
          maternalSurname: input.maternalSurname ?? null,
          curp: input.curp,
          birthDate: toDbDay(input.birthDate),
          gender: input.gender ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          enrollmentDate: toDbDay(enrollmentDate),
          userId: input.userId ?? null,
          guardians: {
            create: guardians.map((g) => ({
              name: g.name,
              relationship: g.relationship,
              phone: g.phone,
              email: g.email ?? null,
              isPaymentResponsible: g.isPaymentResponsible ?? false,
            })),
          },
        },
        include,
      });
      const view = toStudentView(row);
      await this.audit?.(
        {
          action: "STUDENT_CREATED",
          entityType: "Student",
          entityId: row.id,
          userId: actor.id,
          userName: actor.username,
          newState: auditState(view),
        },
        tx
      );
      return view;
    });
    return created;
  }

  async update(id: string, input: StudentUpdateInput, actor: AuthenticatedUser): Promise<StudentView> {
    const previous = toStudentView(await this.loadScoped(id, actor, "students.edit"));
    const today = todayInBusinessZone();
    const next = {
      firstNames: input.firstNames ?? previous.firstNames,
      paternalSurname: input.paternalSurname ?? previous.paternalSurname,
      maternalSurname: input.maternalSurname !== undefined ? input.maternalSurname : previous.maternalSurname,
      birthDate: input.birthDate ?? previous.birthDate,
    };
    if (next.birthDate > today) throw new HttpError(400, "FUTURE_DATE", { field: "birthDate" });
    const guardians: GuardianInput[] = input.guardians ?? previous.guardians;
    assertGuardians(next.birthDate, guardians, today);
    if (input.curp && input.curp !== previous.curp) await this.assertUniqueCurp(input.curp, id);

    const identityChanged =
      next.firstNames !== previous.firstNames ||
      next.paternalSurname !== previous.paternalSurname ||
      next.maternalSurname !== previous.maternalSurname ||
      next.birthDate !== previous.birthDate;
    if (identityChanged) await this.assertNotDuplicatePerson(next, input.confirmDuplicate, id);
    if (input.userId && input.userId !== previous.userId) await this.assertLinkableUser(input.userId, id);

    const data: Prisma.StudentUpdateInput = {
      ...(input.firstNames !== undefined && { firstNames: input.firstNames }),
      ...(input.paternalSurname !== undefined && { paternalSurname: input.paternalSurname }),
      ...(input.maternalSurname !== undefined && { maternalSurname: input.maternalSurname }),
      ...(input.curp !== undefined && { curp: input.curp }),
      ...(input.birthDate !== undefined && { birthDate: toDbDay(input.birthDate) }),
      ...(input.gender !== undefined && { gender: input.gender }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.userId !== undefined && {
        user: input.userId ? { connect: { id: input.userId } } : { disconnect: true },
      }),
    };

    return this.db.$transaction(async (tx) => {
      if (input.guardians) {
        await tx.guardian.deleteMany({ where: { studentId: id } });
        await tx.guardian.createMany({
          data: input.guardians.map((g) => ({
            studentId: id,
            name: g.name,
            relationship: g.relationship,
            phone: g.phone,
            email: g.email ?? null,
            isPaymentResponsible: g.isPaymentResponsible ?? false,
          })),
        });
      }
      const row = await tx.student.update({ where: { id }, data, include });
      const view = toStudentView(row);
      await this.audit?.(
        {
          action: "STUDENT_UPDATED",
          entityType: "Student",
          entityId: id,
          userId: actor.id,
          userName: actor.username,
          previousState: auditState(previous),
          newState: auditState(view),
        },
        tx
      );
      return view;
    });
  }

  /** Listado completo (filtros y alcance vigentes) en Excel. */
  async export(filters: TableFilters, sort: ITDataTableFetchParams["sort"], user: AuthenticatedUser): Promise<Buffer> {
    const rows = (await this.db.student.findMany({
      where: await this.where(filters, user),
      orderBy: this.orderBy(sort) as Prisma.StudentOrderByWithRelationInput[],
      include,
      take: 20_000,
    })) as StudentRow[];
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((row) => {
        const payer = row.guardians.find((g) => g.isPaymentResponsible) ?? row.guardians[0];
        return {
          [t("exports.studentNumber")]: row.studentNumber,
          [t("exports.name")]: fullName(row),
          [t("exports.curp")]: row.curp,
          [t("exports.birthDate")]: fromDbDay(row.birthDate),
          [t("exports.gender")]: row.gender ?? "",
          [t("exports.email")]: row.email ?? "",
          [t("exports.phone")]: row.phone ?? "",
          [t("exports.status")]: row.status,
          [t("exports.enrollmentDate")]: fromDbDay(row.enrollmentDate),
          [t("exports.guardian")]: payer?.name ?? "",
          [t("exports.guardianPhone")]: payer?.phone ?? "",
        };
      })
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, t("exports.studentsSheet"));
    await this.audit?.({
      action: "STUDENTS_EXPORTED",
      entityType: "Student",
      userId: user.id,
      userName: user.username,
      metadata: { rows: rows.length, filters: filters as Prisma.InputJsonObject },
    });
    return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }
}
