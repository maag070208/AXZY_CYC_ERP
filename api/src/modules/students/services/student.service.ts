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

const ADULT_AGE = 18;
const STATUSES = ["ACTIVO", "BAJA"] as const;
const include = { guardians: { orderBy: { createdAt: "asc" as const } } };

export const fullName = (s: { nombres: string; apellidoPaterno: string; apellidoMaterno: string | null }) =>
  [s.nombres, s.apellidoPaterno, s.apellidoMaterno].filter(Boolean).join(" ");

export const toStudentView = (row: StudentRow): StudentView => ({
  id: row.id,
  matricula: row.matricula,
  nombres: row.nombres,
  apellidoPaterno: row.apellidoPaterno,
  apellidoMaterno: row.apellidoMaterno,
  nombreCompleto: fullName(row),
  curp: row.curp,
  fechaNacimiento: fromDbDay(row.fechaNacimiento),
  genero: row.genero,
  email: row.email,
  telefono: row.telefono,
  direccion: row.direccion,
  status: row.status,
  fechaIngreso: fromDbDay(row.fechaIngreso),
  userId: row.userId,
  guardians: row.guardians.map((g) => ({
    id: g.id,
    nombre: g.nombre,
    parentesco: g.parentesco,
    telefono: g.telefono,
    email: g.email,
    esResponsablePago: g.esResponsablePago,
  })),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Estado auditable del alumno (incluye tutores; sin ids internos). */
const auditState = (view: StudentView): Prisma.InputJsonObject => {
  const { id: _id, createdAt: _c, updatedAt: _u, nombreCompleto: _n, ...rest } = view;
  return {
    ...rest,
    guardians: view.guardians.map(({ id: _gid, ...g }) => g),
  } as unknown as Prisma.InputJsonObject;
};

/** Matrícula `AAAA-NNNN` (el consecutivo crece si pasa de 9999). */
export const formatMatricula = (year: number, consecutive: number): string =>
  `${year}-${String(consecutive).padStart(4, "0")}`;

/**
 * Reglas de tutores (M03 reglas 5 y 6). **Pura**: menor de edad exige al menos
 * un tutor y a lo sumo uno es responsable de pago.
 */
export const assertGuardians = (fechaNacimiento: string, guardians: GuardianInput[], today: string): void => {
  if (ageOn(fechaNacimiento, today) < ADULT_AGE && guardians.length === 0) {
    throw new HttpError(400, "GUARDIAN_REQUIRED");
  }
  if (guardians.filter((g) => g.esResponsablePago).length > 1) {
    throw new HttpError(400, "MULTIPLE_PAYMENT_RESPONSIBLES");
  }
};

/** Filtro de nombre: cada palabra debe aparecer en nombres o apellidos. */
const nameFilter = (filters: TableFilters): Prisma.StudentWhereInput | undefined => {
  const text = filterText(filters, "nombre");
  if (!text) return undefined;
  const words = text.contains.split(/\s+/).filter(Boolean);
  return {
    AND: words.map((word) => ({
      OR: [
        { nombres: { contains: word, mode: "insensitive" as const } },
        { apellidoPaterno: { contains: word, mode: "insensitive" as const } },
        { apellidoMaterno: { contains: word, mode: "insensitive" as const } },
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
    const matricula = filterText(filters, "matricula");
    if (matricula) and.push({ matricula });
    const curp = filterText(filters, "curp");
    if (curp) and.push({ curp });
    const status = filterEnum(filters, "status", STATUSES);
    if (status) and.push({ status });
    const ingreso = filterDayRange(filters, "fechaIngreso");
    if (ingreso) and.push({ fechaIngreso: ingreso });
    const scoped = await this.scope(user);
    if (scoped) and.push(scoped);
    return and.length > 0 ? { AND: and } : {};
  }

  private orderBy(sort: ITDataTableFetchParams["sort"]) {
    return orderByOf(
      sort,
      {
        matricula: "matricula",
        nombre: (direction) => [{ apellidoPaterno: direction }, { apellidoMaterno: direction }, { nombres: direction }],
        curp: "curp",
        status: "status",
        fechaIngreso: "fechaIngreso",
        createdAt: "createdAt",
      },
      [{ apellidoPaterno: "asc" }, { apellidoMaterno: "asc" }, { nombres: "asc" }]
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
  async summary(user: UserPermissions): Promise<{ total: number; activos: number; bajas: number }> {
    const scoped = (await this.scope(user)) ?? {};
    const [activos, bajas] = await Promise.all([
      this.db.student.count({ where: { AND: [scoped, { status: "ACTIVO" }] } }),
      this.db.student.count({ where: { AND: [scoped, { status: "BAJA" }] } }),
    ]);
    return { total: activos + bajas, activos, bajas };
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
      select: { id: true, matricula: true },
    });
    if (taken) throw new HttpError(409, "DUPLICATE_CURP", {}, { matricula: taken.matricula });
  }

  /** Duplicado probable: mismo nombre completo y nacimiento (requiere confirmar). */
  private async assertNotDuplicatePerson(
    input: { nombres: string; apellidoPaterno: string; apellidoMaterno?: string | null; fechaNacimiento: string },
    confirmed: boolean | undefined,
    exceptId?: string
  ): Promise<void> {
    if (confirmed) return;
    const matches = await this.db.student.findMany({
      where: {
        nombres: { equals: input.nombres, mode: "insensitive" },
        apellidoPaterno: { equals: input.apellidoPaterno, mode: "insensitive" },
        apellidoMaterno: input.apellidoMaterno
          ? { equals: input.apellidoMaterno, mode: "insensitive" }
          : null,
        fechaNacimiento: toDbDay(input.fechaNacimiento),
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true, matricula: true, curp: true },
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
    if (input.fechaNacimiento > today) throw new HttpError(400, "FUTURE_DATE", { field: "fechaNacimiento" });
    const guardians = input.guardians ?? [];
    assertGuardians(input.fechaNacimiento, guardians, today);
    await this.assertUniqueCurp(input.curp);
    await this.assertNotDuplicatePerson(input, input.confirmDuplicate);
    if (input.userId) await this.assertLinkableUser(input.userId);

    const fechaIngreso = input.fechaIngreso ?? today;
    const year = Number(fechaIngreso.slice(0, 4));

    const created = await this.db.$transaction(async (tx) => {
      // Consecutivo por año: el UPDATE ... +1 bloquea la fila hasta el commit,
      // así dos altas simultáneas nunca obtienen el mismo número.
      const sequence = await tx.matriculaSequence.upsert({
        where: { year },
        create: { year, last: 1 },
        update: { last: { increment: 1 } },
      });
      const matricula = formatMatricula(year, sequence.last);
      const taken = await tx.student.findUnique({ where: { matricula }, select: { id: true } });
      if (taken) throw new HttpError(409, "DUPLICATE_MATRICULA", { matricula });

      const row = await tx.student.create({
        data: {
          matricula,
          nombres: input.nombres,
          apellidoPaterno: input.apellidoPaterno,
          apellidoMaterno: input.apellidoMaterno ?? null,
          curp: input.curp,
          fechaNacimiento: toDbDay(input.fechaNacimiento),
          genero: input.genero ?? null,
          email: input.email ?? null,
          telefono: input.telefono ?? null,
          direccion: input.direccion ?? null,
          fechaIngreso: toDbDay(fechaIngreso),
          userId: input.userId ?? null,
          guardians: {
            create: guardians.map((g) => ({
              nombre: g.nombre,
              parentesco: g.parentesco,
              telefono: g.telefono,
              email: g.email ?? null,
              esResponsablePago: g.esResponsablePago ?? false,
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
      nombres: input.nombres ?? previous.nombres,
      apellidoPaterno: input.apellidoPaterno ?? previous.apellidoPaterno,
      apellidoMaterno: input.apellidoMaterno !== undefined ? input.apellidoMaterno : previous.apellidoMaterno,
      fechaNacimiento: input.fechaNacimiento ?? previous.fechaNacimiento,
    };
    if (next.fechaNacimiento > today) throw new HttpError(400, "FUTURE_DATE", { field: "fechaNacimiento" });
    const guardians: GuardianInput[] = input.guardians ?? previous.guardians;
    assertGuardians(next.fechaNacimiento, guardians, today);
    if (input.curp && input.curp !== previous.curp) await this.assertUniqueCurp(input.curp, id);

    const identityChanged =
      next.nombres !== previous.nombres ||
      next.apellidoPaterno !== previous.apellidoPaterno ||
      next.apellidoMaterno !== previous.apellidoMaterno ||
      next.fechaNacimiento !== previous.fechaNacimiento;
    if (identityChanged) await this.assertNotDuplicatePerson(next, input.confirmDuplicate, id);
    if (input.userId && input.userId !== previous.userId) await this.assertLinkableUser(input.userId, id);

    const data: Prisma.StudentUpdateInput = {
      ...(input.nombres !== undefined && { nombres: input.nombres }),
      ...(input.apellidoPaterno !== undefined && { apellidoPaterno: input.apellidoPaterno }),
      ...(input.apellidoMaterno !== undefined && { apellidoMaterno: input.apellidoMaterno }),
      ...(input.curp !== undefined && { curp: input.curp }),
      ...(input.fechaNacimiento !== undefined && { fechaNacimiento: toDbDay(input.fechaNacimiento) }),
      ...(input.genero !== undefined && { genero: input.genero }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.telefono !== undefined && { telefono: input.telefono }),
      ...(input.direccion !== undefined && { direccion: input.direccion }),
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
            nombre: g.nombre,
            parentesco: g.parentesco,
            telefono: g.telefono,
            email: g.email ?? null,
            esResponsablePago: g.esResponsablePago ?? false,
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
        const payer = row.guardians.find((g) => g.esResponsablePago) ?? row.guardians[0];
        return {
          Matrícula: row.matricula,
          Nombre: fullName(row),
          CURP: row.curp,
          "Fecha de nacimiento": fromDbDay(row.fechaNacimiento),
          Género: row.genero ?? "",
          Correo: row.email ?? "",
          Teléfono: row.telefono ?? "",
          Estatus: row.status,
          "Fecha de ingreso": fromDbDay(row.fechaIngreso),
          Tutor: payer?.nombre ?? "",
          "Teléfono del tutor": payer?.telefono ?? "",
        };
      })
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Alumnos");
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
