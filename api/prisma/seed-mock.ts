import { PrismaClient, type Prisma } from "@prisma/client";
import { hashPassword } from "../src/core/utils/security";
import { applyDiscount, buildChargeSchedule, dueDayFor } from "../src/modules/programs/models/entity/program-rules";

/**
 * Datos de DEMO "de verdad" (idempotente y **persistente**): NO usa el prefijo
 * `E2E`/`e2e_`, así que la limpieza de pruebas **no** los borra. El cliente ve un
 * sistema en uso: alumnos, grupos, calificaciones, asistencia y planes de pago.
 *
 * Requiere haber corrido antes `npm run seed:demo` (crea staff + 50 alumnos con
 * cuenta). Se puede reejecutar sin duplicar.
 *
 *   npm run seed:mock
 */
const prisma = new PrismaClient();
const RUN_YEAR = new Date().getFullYear();

const COURSES: Array<{ clave: string; nombre: string; period: number }> = [
  { clave: "MOT-101", nombre: "Motores de Combustión", period: 1 },
  { clave: "MAT-101", nombre: "Matemáticas Aplicadas", period: 1 },
  { clave: "DIB-101", nombre: "Dibujo Técnico", period: 1 },
  { clave: "SEG-101", nombre: "Seguridad e Higiene", period: 1 },
  { clave: "MOT-201", nombre: "Sistemas de Inyección", period: 2 },
  { clave: "ELE-201", nombre: "Electricidad Automotriz", period: 2 },
  { clave: "FRE-201", nombre: "Sistemas de Frenos", period: 2 },
  { clave: "TRA-201", nombre: "Transmisión y Embrague", period: 2 },
  { clave: "DIA-301", nombre: "Diagnóstico por Computadora", period: 3 },
  { clave: "SUS-301", nombre: "Suspensión y Dirección", period: 3 },
  { clave: "CLI-301", nombre: "Práctica en Taller", period: 3 },
  { clave: "EMP-301", nombre: "Emprendimiento Técnico", period: 3 },
];

const PROGRAMS = [
  { code: "MEC-DIESEL", name: "Mecánico Diésel", monthlyFee: 1500, enrollmentFee: 1000 },
  { code: "MEC-GAS", name: "Mecánico Gasolina", monthlyFee: 1000, enrollmentFee: 500 },
  { code: "MEC-ELEC", name: "Mecánico Eléctrico", monthlyFee: 2500, enrollmentFee: 2000 },
];

const TEACHERS = [
  { username: "marco", nombres: "Marco", apellidos: "Demo", email: "marco@axzy.dev" },
  { username: "martin", nombres: "Martín", apellidos: "Demo", email: "martin@axzy.dev" },
  { username: "rlopez", nombres: "Raúl", apellidos: "López", email: "rlopez@cyc.edu.mx" },
  { username: "cgarcia", nombres: "Carmen", apellidos: "García", email: "cgarcia@cyc.edu.mx" },
  { username: "jperez", nombres: "Jorge", apellidos: "Pérez", email: "jperez@cyc.edu.mx" },
];

const PASSWORD = "123123";
const pad = (n: number, size = 2) => String(n).padStart(size, "0");
const day = (d: Date) => d.toISOString().slice(0, 10);

const ensureUser = async (input: { username: string; name: string; email: string; roleKey: string }): Promise<string> => {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { username: input.username },
    create: { username: input.username, email: input.email, passwordHash, name: input.name, mustChangePassword: false, roles: { create: [{ roleKey: input.roleKey }] } },
    update: { email: input.email, passwordHash, name: input.name, active: true, mustChangePassword: false },
    select: { id: true },
  });
  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.userRole.create({ data: { userId: user.id, roleKey: input.roleKey } });
  return user.id;
};

const ensureCourse = async (clave: string, nombre: string, levelId: string): Promise<string> => {
  const row = await prisma.course.upsert({ where: { clave }, create: { clave, nombre, levelId }, update: { nombre, levelId, active: true }, select: { id: true } });
  return row.id;
};

const ensureProgram = async (p: (typeof PROGRAMS)[number]): Promise<string> => {
  const row = await prisma.program.upsert({
    where: { code: p.code },
    create: { code: p.code, name: p.name, periodType: "QUADRIMESTER", periodCount: 3, monthlyFee: p.monthlyFee, enrollmentFee: p.enrollmentFee, description: `Carrera de ${p.name.toLowerCase()}` },
    update: { name: p.name, monthlyFee: p.monthlyFee, enrollmentFee: p.enrollmentFee, active: true },
    select: { id: true },
  });
  return row.id;
};

const ensureGroup = async (courseId: string, termId: string, teacherId: string | null, nombre: string): Promise<string> => {
  const row = await prisma.group.upsert({
    where: { courseId_termId_nombre: { courseId, termId, nombre } },
    create: { courseId, termId, teacherId, nombre, cupo: 30, horario: [{ dia: "LUNES", horaInicio: "08:00", horaFin: "10:00" }, { dia: "MIERCOLES", horaInicio: "08:00", horaFin: "10:00" }] },
    update: { teacherId, active: true },
    select: { id: true },
  });
  return row.id;
};

const ensureEnrollment = async (studentId: string, groupId: string, actorId: string): Promise<void> => {
  const existing = await prisma.enrollment.findFirst({ where: { studentId, groupId }, select: { id: true } });
  if (existing) return;
  await prisma.enrollment.create({ data: { studentId, groupId, fecha: new Date(`${RUN_YEAR}-08-15T00:00:00.000Z`), createdBy: actorId } });
};

const nextFolio = async (tx: Prisma.TransactionClient): Promise<string> => {
  const seq = await tx.receiptSequence.upsert({ where: { year: RUN_YEAR }, create: { year: RUN_YEAR, last: 1 }, update: { last: { increment: 1 } } });
  return `REC-${RUN_YEAR}-${pad(seq.last, 6)}`;
};

/** Crea el plan de pagos + cargos y registra pagos de los primeros cargos. */
const ensurePlan = async (studentId: string, programId: string, termId: string, payCount: number, actor: { id: string; name: string }): Promise<void> => {
  const program = await prisma.program.findUniqueOrThrow({ where: { id: programId } });
  let plan = await prisma.studentPlan.findFirst({ where: { studentId, status: "ACTIVE" }, select: { id: true } });
  if (!plan) {
    const start = `${RUN_YEAR}-09-01`;
    const created = await prisma.studentPlan.create({
      data: {
        studentId, programId, termId, startDate: new Date(`${start}T00:00:00.000Z`),
        periodType: program.periodType, periodCount: program.periodCount,
        monthlyFee: program.monthlyFee, enrollmentFee: program.enrollmentFee, createdBy: actor.id,
      },
      select: { id: true },
    });
    plan = created;
    const concepts = await ensureConcepts();
    const schedule = buildChargeSchedule({ periodCount: program.periodCount, monthsPerPeriod: program.monthsPerPeriod ?? 4, monthlyFee: Number(program.monthlyFee), enrollmentFee: Number(program.enrollmentFee) });
    await prisma.charge.createMany({
      skipDuplicates: true,
      data: schedule.map((seed) => ({
        studentId, termId, planId: created.id, planChargeIndex: seed.index, createdBy: actor.id,
        conceptId: seed.kind === "ENROLLMENT" ? concepts.enrollment : concepts.monthly,
        descripcion: seed.kind === "ENROLLMENT" ? `Reinscripción — Periodo ${seed.period}` : `Colegiatura — Periodo ${seed.period} · Mes ${seed.monthInPeriod}`,
        monto: applyDiscount(seed.amount, {}),
        fechaVencimiento: new Date(`${dueDayFor(start, seed.monthOffset, 5)}T00:00:00.000Z`),
      })),
    });
  }
  if (!plan) return;

  // Pagos: liquida los primeros `payCount` cargos (por índice) si no tienen pago.
  const charges = await prisma.charge.findMany({ where: { planId: plan.id }, orderBy: { planChargeIndex: "asc" }, include: { payments: { select: { id: true } } } });
  let paid = 0;
  for (const charge of charges) {
    if (paid >= payCount) break;
    if (charge.payments.length > 0) { paid += 1; continue; }
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({ data: { chargeId: charge.id, monto: charge.monto, fecha: new Date(`${day(new Date())}T00:00:00.000Z`), metodo: "EFECTIVO", reciboFolio: await nextFolio(tx), registeredBy: actor.id, registeredByName: actor.name } });
      await tx.charge.update({ where: { id: charge.id }, data: { status: "PAGADO" } });
    });
    paid += 1;
  }
};

let conceptsCache: { enrollment: string; monthly: string } | null = null;
const ensureConcepts = async (): Promise<{ enrollment: string; monthly: string }> => {
  if (conceptsCache) return conceptsCache;
  const upsert = async (nombre: string, tipo: "INSCRIPCION" | "COLEGIATURA") =>
    (await prisma.feeConcept.upsert({ where: { nombre }, create: { nombre, descripcion: "Generado por M22", monto: 0, tipo }, update: {}, select: { id: true } })).id;
  conceptsCache = { enrollment: await upsert("Reinscripción", "INSCRIPCION"), monthly: await upsert("Colegiatura", "COLEGIATURA") };
  return conceptsCache;
};

async function main(): Promise<void> {
  // 1) Catálogos base.
  const level = await prisma.level.upsert({ where: { name: "Técnico Superior" }, create: { name: "Técnico Superior", sortOrder: 1 }, update: { active: true }, select: { id: true } });
  const term = await prisma.term.upsert({
    where: { name: `Ciclo ${RUN_YEAR}-${RUN_YEAR + 1}` },
    create: {
      name: `Ciclo ${RUN_YEAR}-${RUN_YEAR + 1}`, startDate: new Date(`${RUN_YEAR}-08-01T00:00:00.000Z`), endDate: new Date(`${RUN_YEAR + 1}-07-31T00:00:00.000Z`), active: true,
      calendar: [
        { name: "Cuatrimestre 1", startDate: `${RUN_YEAR}-09-01`, endDate: `${RUN_YEAR}-12-20` },
        { name: "Cuatrimestre 2", startDate: `${RUN_YEAR + 1}-01-10`, endDate: `${RUN_YEAR + 1}-04-30` },
        { name: "Cuatrimestre 3", startDate: `${RUN_YEAR + 1}-05-05`, endDate: `${RUN_YEAR + 1}-07-15` },
      ],
    },
    update: { active: true },
    select: { id: true },
  });
  await prisma.term.updateMany({ where: { id: { not: term.id }, active: true }, data: { active: false } });

  const admin = await prisma.user.findFirstOrThrow({ where: { username: "admin" }, select: { id: true, name: true } });
  const actor = { id: admin.id, name: admin.name };

  // 2) Cursos + carreras + plan de estudios.
  const courseIds = new Map<string, string>();
  for (const c of COURSES) courseIds.set(c.clave, await ensureCourse(c.clave, c.nombre, level.id));

  const programIds: string[] = [];
  for (const p of PROGRAMS) {
    const id = await ensureProgram(p);
    programIds.push(id);
    const subjects = COURSES.map((c, i) => ({ courseId: courseIds.get(c.clave)!, periodIndex: c.period, sortOrder: i }));
    await prisma.$transaction(async (tx) => {
      await tx.programSubject.deleteMany({ where: { programId: id } });
      await tx.programSubject.createMany({ data: subjects.map((s) => ({ ...s, programId: id })) });
    });
  }

  // 3) Profesores.
  const teacherIds: string[] = [];
  for (const t of TEACHERS) {
    const userId = await ensureUser({ username: t.username, name: `${t.nombres} ${t.apellidos}`, email: t.email, roleKey: "TEACHER" });
    const row = await prisma.teacher.upsert({
      where: { email: t.email },
      create: { nombres: t.nombres, apellidos: t.apellidos, email: t.email, userId },
      update: { nombres: t.nombres, apellidos: t.apellidos, userId, status: "ACTIVO" },
      select: { id: true },
    });
    teacherIds.push(row.id);
  }

  // 4) Grupos de cada materia (periodo 1) por carrera.
  const groupsByProgram: string[][] = [];
  for (let pi = 0; pi < PROGRAMS.length; pi += 1) {
    const period1 = COURSES.filter((c) => c.period === 1);
    const groups: string[] = [];
    for (let gi = 0; gi < period1.length; gi += 1) {
      const teacher = teacherIds[(pi + gi) % teacherIds.length];
      groups.push(await ensureGroup(courseIds.get(period1[gi].clave)!, term.id, teacher, `${PROGRAMS[pi].code}-A`));
    }
    groupsByProgram.push(groups);
  }

  // 5) Alumnos del seed:demo → inscripción, plan y pagos.
  const students = await prisma.student.findMany({ where: { userId: { not: null } }, orderBy: { matricula: "asc" }, select: { id: true } });
  let enrolled = 0;
  for (let i = 0; i < students.length; i += 1) {
    const student = students[i];
    const pi = i % PROGRAMS.length;
    for (const groupId of groupsByProgram[pi]) await ensureEnrollment(student.id, groupId, actor.id);
    await ensurePlan(student.id, programIds[pi], term.id, i % 9, actor);
    enrolled += 1;
  }

  // 6) Calificaciones (instrumento + captura) en los primeros grupos.
  const sampleGroups = [...groupsByProgram[0].slice(0, 2), ...groupsByProgram[1].slice(0, 1)];
  for (const groupId of sampleGroups) {
    const assessment = await prisma.assessment.findFirst({ where: { groupId, nombre: "Parcial 1" }, select: { id: true } });
    const assessmentId = assessment?.id ?? (await prisma.assessment.create({ data: { groupId, nombre: "Parcial 1", tipo: "PARCIAL", ponderacion: 50, maxScore: 10 } })).id;
    const enrollments = await prisma.enrollment.findMany({ where: { groupId, status: "INSCRITO" }, select: { id: true } });
    for (let e = 0; e < enrollments.length; e += 1) {
      const score = 6 + ((e * 7) % 5); // 6..10
      await prisma.grade.upsert({
        where: { assessmentId_enrollmentId: { assessmentId, enrollmentId: enrollments[e].id } },
        create: { assessmentId, enrollmentId: enrollments[e].id, score, capturedBy: actor.id, capturedAt: new Date() },
        update: { score },
      });
    }
  }

  // 7) Asistencia: 4 sesiones por grupo con pase.
  const statuses = ["PRESENTE", "PRESENTE", "PRESENTE", "PRESENTE", "RETARDO", "FALTA"] as const;
  for (let g = 0; g < groupsByProgram.length; g += 1) {
    for (const groupId of groupsByProgram[g]) {
      const enrollments = await prisma.enrollment.findMany({ where: { groupId, status: "INSCRITO" }, select: { id: true } });
      for (let s = 0; s < 4; s += 1) {
        const fecha = new Date(`${RUN_YEAR}-09-${pad(8 + s * 2)}T00:00:00.000Z`);
        let session = await prisma.attendanceSession.findFirst({ where: { groupId, fecha }, select: { id: true } });
        if (!session) session = await prisma.attendanceSession.create({ data: { groupId, fecha, createdBy: actor.id }, select: { id: true } });
        for (let e = 0; e < enrollments.length; e += 1) {
          await prisma.attendance.upsert({
            where: { sessionId_enrollmentId: { sessionId: session.id, enrollmentId: enrollments[e].id } },
            create: { sessionId: session.id, enrollmentId: enrollments[e].id, status: statuses[(e + s) % statuses.length], recordedBy: actor.id },
            update: { status: statuses[(e + s) % statuses.length] },
          });
        }
      }
    }
  }

  console.log(`Seed mock listo: ${PROGRAMS.length} carreras, ${COURSES.length} materias, ${teacherIds.length} profesores, ${students.length} alumnos inscritos con plan (${enrolled}).`);
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
