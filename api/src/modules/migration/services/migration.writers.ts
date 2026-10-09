import type { Prisma } from "@prisma/client";
import { toDbDay } from "@core/utils/day";
import { hashPassword, randomToken } from "@core/utils/security";
import { formatMatricula } from "@modules/students";
import { usernameBase } from "@modules/teachers";

type Tx = Prisma.TransactionClient;

export interface StudentMigrationData {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  curp: string;
  fechaNacimiento: string;
  fechaIngreso: string;
  genero: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  matricula: string | null;
  guardians: Array<{ nombre: string; parentesco: string; telefono: string; email: string | null; esResponsablePago: boolean }>;
}

export interface TeacherMigrationData {
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  especialidad: string | null;
}

/** Busca el siguiente username libre a partir del correo (colisiones con sufijo). */
const freeUsername = async (tx: Tx, email: string): Promise<string> => {
  const base = usernameBase(email);
  let username = base;
  let n = 1;
  while (await tx.user.findUnique({ where: { username }, select: { id: true } })) {
    username = `${base}${n++}`.slice(0, 50);
  }
  return username;
};

/** Upsert idempotente de un alumno por CURP; matrícula histórica si viene, si no se genera. */
export const applyStudent = async (tx: Tx, raw: Record<string, unknown>): Promise<"inserted" | "updated"> => {
  const data = raw as unknown as StudentMigrationData;
  const existing = await tx.student.findUnique({ where: { curp: data.curp }, select: { id: true } });
  if (existing) {
    await tx.student.update({
      where: { id: existing.id },
      data: {
        nombres: data.nombres,
        apellidoPaterno: data.apellidoPaterno,
        apellidoMaterno: data.apellidoMaterno,
        genero: data.genero,
        email: data.email,
        telefono: data.telefono,
        direccion: data.direccion,
      },
    });
    return "updated";
  }

  let matricula = data.matricula;
  if (!matricula) {
    const year = Number(data.fechaIngreso.slice(0, 4));
    const sequence = await tx.matriculaSequence.upsert({
      where: { year },
      create: { year, last: 1 },
      update: { last: { increment: 1 } },
    });
    matricula = formatMatricula(year, sequence.last);
  }

  await tx.student.create({
    data: {
      matricula,
      nombres: data.nombres,
      apellidoPaterno: data.apellidoPaterno,
      apellidoMaterno: data.apellidoMaterno,
      curp: data.curp,
      fechaNacimiento: toDbDay(data.fechaNacimiento),
      fechaIngreso: toDbDay(data.fechaIngreso),
      genero: data.genero,
      email: data.email,
      telefono: data.telefono,
      direccion: data.direccion,
      guardians: { create: data.guardians },
    },
  });
  return "inserted";
};

/**
 * Upsert idempotente de un profesor por email. Si no existe, crea su cuenta
 * PROFESOR en estado de contraseña temporal (sin enviar la invitación: la
 * operación pone al día y control escolar reenvía cuando corresponda).
 */
export const applyTeacher = async (tx: Tx, raw: Record<string, unknown>): Promise<"inserted" | "updated"> => {
  const data = raw as unknown as TeacherMigrationData;
  const existing = await tx.teacher.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    await tx.teacher.update({
      where: { id: existing.id },
      data: { nombres: data.nombres, apellidos: data.apellidos, telefono: data.telefono, especialidad: data.especialidad, status: "ACTIVO" },
    });
    return "updated";
  }

  const username = await freeUsername(tx, data.email);
  const passwordHash = await hashPassword(randomToken());
  const user = await tx.user.create({
    data: {
      username,
      email: data.email,
      passwordHash,
      name: `${data.nombres} ${data.apellidos}`,
      phone: data.telefono,
      mustChangePassword: true,
      roles: { create: [{ roleKey: "TEACHER" }] },
    },
  });
  await tx.teacher.create({
    data: {
      nombres: data.nombres,
      apellidos: data.apellidos,
      email: data.email,
      telefono: data.telefono,
      especialidad: data.especialidad,
      userId: user.id,
    },
  });
  return "inserted";
};
