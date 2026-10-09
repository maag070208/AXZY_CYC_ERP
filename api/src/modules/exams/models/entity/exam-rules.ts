import { Prisma } from "@prisma/client";

/**
 * Reglas **puras** del examen en línea (M15–M17): ventana y tiempo del
 * intento, forma de las respuestas, calificación automática, criterio de
 * intentos y normalización a la evaluación de M08.
 */
export type QuestionKind = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "MULTIPLE_ANSWER" | "OPEN";
export type Answer = string | string[] | null | undefined;

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
export const round2 = (v: Prisma.Decimal | number | string): number =>
  D(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();

/** Fin del intento según el servidor: el menor entre inicio + duración y el cierre del examen. */
export const endsAtOf = (startedAt: Date, durationMin: number, closesAt: Date): Date =>
  new Date(Math.min(startedAt.getTime() + durationMin * 60_000, closesAt.getTime()));

export type WindowState = "NOT_PUBLISHED" | "NOT_OPEN" | "CLOSED" | "OPEN";

/** ¿Se puede iniciar ahora? (publicado y `apertura ≤ ahora ≤ cierre`). */
export const windowState = (status: string, apertura: Date, cierre: Date, now: Date = new Date()): WindowState => {
  if (status !== "PUBLISHED") return status === "CLOSED" ? "CLOSED" : "NOT_PUBLISHED";
  if (now < apertura) return "NOT_OPEN";
  if (now > cierre) return "CLOSED";
  return "OPEN";
};

/** ¿La respuesta tiene la forma del tipo? (opción del reactivo, arreglo de opciones o texto). */
export const isValidAnswer = (type: QuestionKind, answer: Answer, optionIds: readonly string[]): boolean => {
  if (answer === null || answer === undefined) return true;
  switch (type) {
    case "MULTIPLE_CHOICE":
    case "TRUE_FALSE":
      return typeof answer === "string" && optionIds.includes(answer);
    case "MULTIPLE_ANSWER":
      return Array.isArray(answer) && answer.length <= optionIds.length && new Set(answer).size === answer.length &&
        answer.every((id) => typeof id === "string" && optionIds.includes(id));
    case "OPEN":
      return typeof answer === "string" && answer.length <= 5000;
  }
};

const isBlank = (answer: Answer): boolean =>
  answer === null || answer === undefined || (typeof answer === "string" && answer.trim() === "") || (Array.isArray(answer) && answer.length === 0);

export interface AutoGrade {
  isCorrect: boolean | null;
  pointsEarned: number | null;
}

/**
 * Calificación automática (M17 §4.1–4.2): cerradas todo o nada contra las
 * opciones correctas; una abierta contestada queda pendiente (`null`); lo no
 * contestado vale 0.
 */
export const autoGrade = (type: QuestionKind, answer: Answer, correctIds: readonly string[], points: number): AutoGrade => {
  if (isBlank(answer)) return { isCorrect: false, pointsEarned: 0 };
  if (type === "OPEN") return { isCorrect: null, pointsEarned: null };
  const chosen = Array.isArray(answer) ? answer : [answer as string];
  const ok = chosen.length === correctIds.length && chosen.every((id) => correctIds.includes(id));
  return { isCorrect: ok, pointsEarned: ok ? round2(points) : 0 };
};

/** Puntaje del intento = Σ puntos obtenidos (pendientes cuentan 0) y cuántos faltan por revisar. */
export const attemptScore = (answers: ReadonlyArray<{ pointsEarned: number | null; isCorrect: boolean | null }>) => ({
  score: round2(answers.reduce((sum, a) => sum.plus(D(a.pointsEarned ?? 0)), D(0))),
  pending: answers.filter((a) => a.isCorrect === null).length,
});

export interface FinishedAttempt {
  id: string;
  score: number;
  pendingCount: number;
  finishedAt: Date;
}

/**
 * Criterio de intentos (M17 §4.4): MEJOR = mayor puntaje entre los ya
 * calificados por completo; ULTIMO = el más reciente, y si aún tiene
 * pendientes no se decide (`null`) hasta revisarlo.
 */
export const pickAttempt = (attempts: readonly FinishedAttempt[], criterion: "BEST" | "LAST"): FinishedAttempt | null => {
  if (attempts.length === 0) return null;
  if (criterion === "LAST") {
    const last = [...attempts].sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime())[0];
    return last.pendingCount === 0 ? last : null;
  }
  const graded = attempts.filter((a) => a.pendingCount === 0);
  if (graded.length === 0) return null;
  return graded.reduce((best, a) => (a.score > best.score ? a : best));
};

/** Puntaje del examen llevado a la escala de la evaluación de M08: `score / total × maxScore`. */
export const toAssessmentScale = (score: number, total: number, maxScore: number): number =>
  total > 0 ? Math.min(round2(D(score).div(total).times(maxScore)), maxScore) : 0;

/** Barajado Fisher–Yates con un generador inyectable (pruebas deterministas). */
export const shuffle = <T>(items: readonly T[], random: () => number = Math.random): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
