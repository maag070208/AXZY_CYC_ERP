import { db, createAuthUser } from "./db";
import { E2E, E2E_PREFIX } from "./env";
import { makeCourse, makeStudent, makeTeacher, makeTerm } from "./academic";

/**
 * Mundo de prueba del examen en línea (M14–M17): ciclo, curso, profesor con
 * grupo, alumno con cuenta inscrito y reactivos de los cuatro tipos.
 */
export interface Pupil {
  username: string;
  userId: string;
  studentId: string;
  enrollmentId: string;
}

export const makePupil = async (run: string, label: string, groupId: string): Promise<Pupil> => {
  const username = `${E2E_PREFIX}${label}_${run}`.toLowerCase();
  const user = await createAuthUser({ username, name: `E2E Alumno ${label}`, roleKey: "STUDENT", password: E2E.password });
  const student = await makeStudent(run, label, user.id);
  const enrollment = await db.enrollment.create({
    data: { studentId: student.id, groupId, date: new Date("2026-08-20T00:00:00Z") },
  });
  return { username, userId: user.id, studentId: student.id, enrollmentId: enrollment.id };
};

export const makeQuestion = async (
  courseId: string,
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "MULTIPLE_ANSWER" | "OPEN",
  points: number,
  options: Array<[string, boolean]> = []
) =>
  db.question.create({
    data: {
      courseId,
      type,
      text: `E2E ${type} ${Math.random().toString(36).slice(2, 7)}`,
      points,
      options: { create: options.map(([text, isCorrect], i) => ({ text, isCorrect, sortOrder: i + 1 })) },
    },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });

export const setupExamWorld = async (run: string, tag: string) => {
  const term = await makeTerm(run, `Examen ${tag}`);
  const course = await makeCourse(run, `Examen ${tag}`);
  const teacher = await makeTeacher(run, `${tag}prof`);
  const group = await db.group.create({
    data: {
      courseId: course.id, termId: term.id, teacherId: teacher.teacher.id, name: `X${tag}`, capacity: 30,
      schedule: [{ day: "SUNDAY", startTime: "07:00", endTime: "08:00" }],
    },
  });
  const om = await makeQuestion(course.id, "MULTIPLE_CHOICE", 2, [["4", true], ["5", false], ["6", false]]);
  const vf = await makeQuestion(course.id, "TRUE_FALSE", 1, [["Verdadero", false], ["Falso", true]]);
  const mr = await makeQuestion(course.id, "MULTIPLE_ANSWER", 3, [["Bujía", true], ["Pistón", true], ["Volante", false]]);
  const ab = await makeQuestion(course.id, "OPEN", 4);
  return { term, course, teacher, group, questions: { om, vf, mr, ab } };
};

/** Ventana abierta ahora: desde hace 1 min hasta dentro de `hours` horas. */
export const openWindow = (hours = 2) => ({
  opensAt: new Date(Date.now() - 60_000).toISOString(),
  closesAt: new Date(Date.now() + hours * 3_600_000).toISOString(),
});
