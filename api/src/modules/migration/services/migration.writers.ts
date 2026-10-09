import type { Prisma } from "@prisma/client";
import { toDbDay } from "@core/utils/day";
import { hashPassword, randomToken } from "@core/utils/security";
import { formatStudentNumber } from "@modules/students";
import { usernameBase } from "@modules/teachers";

type Tx = Prisma.TransactionClient;

export interface StudentMigrationData {
  firstNames: string;
  paternalSurname: string;
  maternalSurname: string | null;
  curp: string;
  birthDate: string;
  enrollmentDate: string;
  gender: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  studentNumber: string | null;
  guardians: Array<{ name: string; relationship: string; phone: string; email: string | null; isPaymentResponsible: boolean }>;
}

export interface TeacherMigrationData {
  firstNames: string;
  surnames: string;
  email: string;
  phone: string | null;
  specialty: string | null;
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
        firstNames: data.firstNames,
        paternalSurname: data.paternalSurname,
        maternalSurname: data.maternalSurname,
        gender: data.gender,
        email: data.email,
        phone: data.phone,
        address: data.address,
      },
    });
    return "updated";
  }

  let studentNumber = data.studentNumber;
  if (!studentNumber) {
    const year = Number(data.enrollmentDate.slice(0, 4));
    const sequence = await tx.studentNumberSequence.upsert({
      where: { year },
      create: { year, last: 1 },
      update: { last: { increment: 1 } },
    });
    studentNumber = formatStudentNumber(year, sequence.last);
  }

  await tx.student.create({
    data: {
      studentNumber,
      firstNames: data.firstNames,
      paternalSurname: data.paternalSurname,
      maternalSurname: data.maternalSurname,
      curp: data.curp,
      birthDate: toDbDay(data.birthDate),
      enrollmentDate: toDbDay(data.enrollmentDate),
      gender: data.gender,
      email: data.email,
      phone: data.phone,
      address: data.address,
      guardians: { create: data.guardians },
    },
  });
  return "inserted";
};

/**
 * Upsert idempotente de un profesor por email. Si no existe, crea su cuenta
 * TEACHER en estado de contraseña temporal (sin enviar la invitación: la
 * operación pone al día y control escolar reenvía cuando corresponda).
 */
export const applyTeacher = async (tx: Tx, raw: Record<string, unknown>): Promise<"inserted" | "updated"> => {
  const data = raw as unknown as TeacherMigrationData;
  const existing = await tx.teacher.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    await tx.teacher.update({
      where: { id: existing.id },
      data: { firstNames: data.firstNames, surnames: data.surnames, phone: data.phone, specialty: data.specialty, status: "ACTIVE" },
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
      name: `${data.firstNames} ${data.surnames}`,
      phone: data.phone,
      mustChangePassword: true,
      roles: { create: [{ roleKey: "TEACHER" }] },
    },
  });
  await tx.teacher.create({
    data: {
      firstNames: data.firstNames,
      surnames: data.surnames,
      email: data.email,
      phone: data.phone,
      specialty: data.specialty,
      userId: user.id,
    },
  });
  return "inserted";
};
