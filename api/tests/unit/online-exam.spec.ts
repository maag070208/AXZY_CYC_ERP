import { test, expect } from "@playwright/test";
import { optionRuleError, parseCsv, readQuestionsCsv } from "../../src/modules/questions/models/entity/question-rules";
import {
  attemptScore,
  autoGrade,
  endsAtOf,
  isValidAnswer,
  pickAttempt,
  shuffle,
  toAssessmentScale,
  windowState,
} from "../../src/modules/exams/models/entity/exam-rules";

/** M14–M17 puros: reglas de opciones, CSV, ventana/tiempo, calificación y criterio. */

const o = (esCorrecta: boolean, texto = "x") => ({ texto, esCorrecta });

test.describe("reactivos (M14)", () => {
  test("una regla por tipo", () => {
    expect(optionRuleError("OPCION_MULTIPLE", [o(true), o(false)])).toBeNull();
    expect(optionRuleError("OPCION_MULTIPLE", [o(true), o(true)])).toBe("QUESTION_MULTIPLE_CORRECT");
    expect(optionRuleError("OPCION_MULTIPLE", [o(true)])).toBe("QUESTION_OPTION_COUNT_INVALID");
    expect(optionRuleError("VERDADERO_FALSO", [o(false), o(true)])).toBeNull();
    expect(optionRuleError("VERDADERO_FALSO", [o(true), o(false), o(false)])).toBe("QUESTION_OPTION_COUNT_INVALID");
    expect(optionRuleError("VERDADERO_FALSO", [o(false), o(false)])).toBe("QUESTION_OPTION_REQUIRED");
    expect(optionRuleError("MULTIPLE_RESPUESTA", [o(true), o(true), o(false)])).toBeNull();
    expect(optionRuleError("MULTIPLE_RESPUESTA", [o(false), o(false)])).toBe("QUESTION_OPTION_REQUIRED");
    expect(optionRuleError("ABIERTA", [])).toBeNull();
    expect(optionRuleError("ABIERTA", [o(true)])).toBe("QUESTION_OPEN_NO_OPTIONS");
  });

  test("CSV con comillas, comas internas, saltos de línea y punto y coma", () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
    expect(parseCsv('a;"x\ny"\r\n', ";")).toEqual([["a", "x\ny"]]);
    const header = "curso;tema;tipo;enunciado;puntos;dificultad;opciones;correctas";
    const { rows, rejected, total } = readQuestionsCsv(`﻿${header}\nmot-101;;Verdadero falso;¿El aceite lubrica?;1,5;;;1\nMOT-101;;OPCION_MULTIPLE;Sin correcta;1;;a|b;`);
    expect(total).toBe(2);
    expect(rows[0]).toMatchObject({ cursoClave: "MOT-101", tipo: "VERDADERO_FALSO", puntos: 1.5 });
    expect(rows[0].options.map((x) => x.texto)).toEqual(["Verdadero", "Falso"]);
    expect(rejected).toEqual([{ row: 3, code: "QUESTION_OPTION_REQUIRED", message: expect.any(String) }]);
    expect(() => readQuestionsCsv("curso,tipo\nA,ABIERTA")).toThrow(/faltan columnas/);
  });
});

test.describe("aplicación (M16)", () => {
  test("ventana y fin del intento calculados en el servidor", () => {
    const apertura = new Date("2026-06-01T15:00:00Z");
    const cierre = new Date("2026-06-01T17:00:00Z");
    expect(windowState("PUBLICADO", apertura, cierre, new Date("2026-06-01T14:59:59Z"))).toBe("NOT_OPEN");
    expect(windowState("PUBLICADO", apertura, cierre, new Date("2026-06-01T16:00:00Z"))).toBe("OPEN");
    expect(windowState("PUBLICADO", apertura, cierre, new Date("2026-06-01T17:00:01Z"))).toBe("CLOSED");
    expect(windowState("BORRADOR", apertura, cierre)).toBe("NOT_PUBLISHED");
    expect(endsAtOf(new Date("2026-06-01T15:00:00Z"), 60, cierre).toISOString()).toBe("2026-06-01T16:00:00.000Z");
    expect(endsAtOf(new Date("2026-06-01T16:30:00Z"), 60, cierre).toISOString()).toBe("2026-06-01T17:00:00.000Z");
  });

  test("forma de la respuesta por tipo", () => {
    const ids = ["a", "b", "c"];
    expect(isValidAnswer("OPCION_MULTIPLE", "b", ids)).toBe(true);
    expect(isValidAnswer("OPCION_MULTIPLE", "z", ids)).toBe(false);
    expect(isValidAnswer("OPCION_MULTIPLE", ["a"], ids)).toBe(false);
    expect(isValidAnswer("MULTIPLE_RESPUESTA", ["a", "c"], ids)).toBe(true);
    expect(isValidAnswer("MULTIPLE_RESPUESTA", ["a", "a"], ids)).toBe(false);
    expect(isValidAnswer("ABIERTA", "texto", [])).toBe(true);
    expect(isValidAnswer("ABIERTA", "x".repeat(5001), [])).toBe(false);
    expect(isValidAnswer("VERDADERO_FALSO", null, ids)).toBe(true);
  });

  test("barajado reproducible con un generador fijo y sin perder elementos", () => {
    const seq = [0.1, 0.9, 0.5, 0.3];
    let i = 0;
    const out = shuffle([1, 2, 3, 4, 5], () => seq[i++ % seq.length]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

test.describe("calificación (M17)", () => {
  test("todo o nada en cerradas; abierta contestada pendiente; en blanco vale 0", () => {
    expect(autoGrade("OPCION_MULTIPLE", "a", ["a"], 2)).toEqual({ esCorrecta: true, puntosObtenidos: 2 });
    expect(autoGrade("VERDADERO_FALSO", "b", ["a"], 1)).toEqual({ esCorrecta: false, puntosObtenidos: 0 });
    expect(autoGrade("MULTIPLE_RESPUESTA", ["a"], ["a", "b"], 3)).toEqual({ esCorrecta: false, puntosObtenidos: 0 });
    expect(autoGrade("MULTIPLE_RESPUESTA", ["b", "a"], ["a", "b"], 3)).toEqual({ esCorrecta: true, puntosObtenidos: 3 });
    expect(autoGrade("ABIERTA", "respuesta", [], 4)).toEqual({ esCorrecta: null, puntosObtenidos: null });
    expect(autoGrade("ABIERTA", "  ", [], 4)).toEqual({ esCorrecta: false, puntosObtenidos: 0 });
    expect(autoGrade("OPCION_MULTIPLE", null, ["a"], 2)).toEqual({ esCorrecta: false, puntosObtenidos: 0 });
  });

  test("puntaje y pendientes; escala de la evaluación", () => {
    expect(attemptScore([{ esCorrecta: true, puntosObtenidos: 2 }, { esCorrecta: null, puntosObtenidos: null }, { esCorrecta: false, puntosObtenidos: 0 }]))
      .toEqual({ score: 2, pending: 1 });
    expect(toAssessmentScale(5, 10, 100)).toBe(50);
    expect(toAssessmentScale(7, 9, 10)).toBe(7.78);
    expect(toAssessmentScale(3, 0, 10)).toBe(0);
  });

  test("criterio de intentos", () => {
    const at = (id: string, score: number, pendingCount: number, minute: number) => ({ id, score, pendingCount, finishedAt: new Date(2026, 0, 1, 10, minute) });
    const attempts = [at("a", 6, 0, 1), at("b", 8, 0, 2), at("c", 9, 1, 3)];
    expect(pickAttempt(attempts, "MEJOR")?.id).toBe("b");
    expect(pickAttempt(attempts, "ULTIMO")).toBeNull();
    expect(pickAttempt(attempts.slice(0, 2), "ULTIMO")?.id).toBe("b");
    expect(pickAttempt([], "MEJOR")).toBeNull();
  });
});
