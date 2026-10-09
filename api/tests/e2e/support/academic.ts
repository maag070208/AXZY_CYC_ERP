import { db, createAuthUser } from "./db";
import { E2E, E2E_PREFIX } from "./env";
import { makeCurp, yearsAgo } from "./people";

/**
 * Datos académicos de prueba (M07/M08) creados directo en la base para que
 * cada suite arranque rápido: ciclos y cursos con prefijo `E2E`, alumnos con
 * `nombres` `E2E…` y profesores con correo `e2e_…`. Se limpian con
 * `clearAcademicE2E`, `clearStudentsE2E` y `clearTeachersE2E`.
 */
let sequence = 0;
const next = () => `${Date.now().toString(36)}${(sequence += 1)}`;

export const makeTerm = async (run: string, label = "T", days?: [string, string]) =>
  db.term.create({
    data: {
      nombre: `E2E ${label} ${run} ${next()}`,
      fechaInicio: new Date(`${days?.[0] ?? "2026-08-01"}T00:00:00.000Z`),
      fechaFin: new Date(`${days?.[1] ?? "2026-12-15"}T00:00:00.000Z`),
    },
  });

export const makeCourse = async (run: string, nombre = "Curso") =>
  db.course.create({ data: { clave: `E2E-${run}-${next()}`.toUpperCase(), nombre: `E2E ${nombre} ${run}` } });

/** Alumno ACTIVO (adulto: no exige tutor); `userId` lo vincula a una cuenta ALUMNO. */
export const makeStudent = async (run: string, label: string, userId?: string) => {
  const birth = yearsAgo(20);
  return db.student.create({
    data: {
      matricula: `E2E${next()}`.slice(0, 20),
      nombres: `E2E ${label} ${run}`,
      apellidoPaterno: "Academico",
      apellidoMaterno: label,
      curp: makeCurp(birth),
      fechaNacimiento: new Date(`${birth}T00:00:00.000Z`),
      fechaIngreso: new Date("2026-08-01T00:00:00.000Z"),
      ...(userId ? { userId } : {}),
    },
  });
};

/** Profesor con cuenta PROFESOR de contraseña conocida. */
export const makeTeacher = async (run: string, label: string) => {
  const username = `${E2E_PREFIX}${label}_${run}`;
  const user = await createAuthUser({ username, name: `E2E Prof ${label}`, roleKey: "PROFESOR", password: E2E.password });
  const teacher = await db.teacher.create({
    data: { nombres: "E2E Prof", apellidos: `${label} ${run}`, email: `${username}@e2e.local`, userId: user.id },
  });
  return { username, userId: user.id, teacher };
};

export const slot = (dia: string, horaInicio: string, horaFin: string) => ({ dia, horaInicio, horaFin });
