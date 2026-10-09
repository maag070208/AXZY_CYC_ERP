import { test, expect } from "@playwright/test";
import {
  firstConflict,
  hasInternalOverlap,
  minutesOf,
  parseSchedule,
  slotsOverlap,
  sortSchedule,
  type ScheduleSlot,
} from "../../src/modules/courses/models/entity/schedule";
import { GroupCreateDto } from "../../src/modules/courses/models/dto/course.dto";
import {
  finalGradeOf,
  hasTwoDecimalsAtMost,
  resultOf,
  round2,
  scoreInRange,
  weightsComplete,
  weightsTotal,
} from "../../src/modules/grades/models/entity/grading";
import { GradeCaptureDto } from "../../src/modules/grades/models/dto/grade.dto";

/** M07/M08 puros: empalme de horarios, ponderaciones y calificación final. */

const s = (day: ScheduleSlot["day"], startTime: string, endTime: string): ScheduleSlot => ({ day, startTime, endTime });

test.describe("horario (M07)", () => {
  test("intervalos semiabiertos: contiguos no chocan, traslapes sí", () => {
    expect(minutesOf("07:30")).toBe(450);
    expect(slotsOverlap(s("MONDAY", "08:00", "10:00"), s("MONDAY", "09:59", "11:00"))).toBe(true);
    expect(slotsOverlap(s("MONDAY", "08:00", "10:00"), s("MONDAY", "10:00", "11:00"))).toBe(false);
    expect(slotsOverlap(s("MONDAY", "08:00", "10:00"), s("TUESDAY", "08:00", "10:00"))).toBe(false);
    expect(slotsOverlap(s("MONDAY", "08:00", "12:00"), s("MONDAY", "09:00", "10:00"))).toBe(true);
  });

  test("primer empalme entre dos horarios y empalme interno", () => {
    const a = [s("MONDAY", "08:00", "09:00"), s("WEDNESDAY", "08:00", "09:00")];
    const b = [s("TUESDAY", "08:00", "09:00"), s("WEDNESDAY", "08:30", "09:30")];
    expect(firstConflict(a, b)?.theirs).toEqual(b[1]);
    expect(firstConflict(a, [s("MONDAY", "09:00", "10:00")])).toBeNull();
    expect(hasInternalOverlap(a)).toBe(false);
    expect(hasInternalOverlap([...a, s("MONDAY", "08:45", "09:15")])).toBe(true);
  });

  test("orden estable y lectura defensiva del JSON guardado", () => {
    const sorted = sortSchedule([s("FRIDAY", "07:00", "08:00"), s("MONDAY", "10:00", "11:00"), s("MONDAY", "08:00", "09:00")]);
    expect(sorted.map((x) => `${x.day} ${x.startTime}`)).toEqual(["MONDAY 08:00", "MONDAY 10:00", "FRIDAY 07:00"]);
    expect(parseSchedule([s("MONDAY", "08:00", "09:00"), { day: "FERIADO", startTime: "x" }, null])).toHaveLength(1);
    expect(parseSchedule({ no: "array" })).toEqual([]);
  });

  test("el DTO de grupo rechaza horas mal formadas, fin ≤ inicio y empalmes internos", () => {
    const base = { courseId: crypto.randomUUID(), termId: crypto.randomUUID(), name: "A", capacity: 10 };
    expect(GroupCreateDto.safeParse({ ...base, schedule: [s("MONDAY", "08:00", "09:00")] }).success).toBe(true);
    expect(GroupCreateDto.safeParse({ ...base, schedule: [s("MONDAY", "9:00", "10:00")] }).success).toBe(false);
    expect(GroupCreateDto.safeParse({ ...base, schedule: [s("MONDAY", "10:00", "10:00")] }).success).toBe(false);
    expect(
      GroupCreateDto.safeParse({ ...base, schedule: [s("MONDAY", "08:00", "10:00"), s("MONDAY", "09:00", "11:00")] }).success
    ).toBe(false);
    expect(GroupCreateDto.safeParse({ ...base, capacity: 0, schedule: [s("MONDAY", "08:00", "09:00")] }).success).toBe(false);
  });
});

test.describe("calificaciones (M08)", () => {
  const items = [
    { id: "p1", weight: 30, maxScore: 10 },
    { id: "fin", weight: 60, maxScore: 100 },
    { id: "t", weight: 10, maxScore: 100 },
  ];

  test("suma de ponderaciones exacta en decimal (0.1 + 0.2 no es 0.30000000000000004)", () => {
    expect(weightsTotal(items)).toBe(100);
    expect(weightsComplete(items)).toBe(true);
    expect(weightsTotal([{ weight: 0.1 }, { weight: 0.2 }])).toBe(0.3);
    expect(weightsComplete([{ weight: 33.33 }, { weight: 33.33 }, { weight: 33.33 }])).toBe(false);
    expect(weightsComplete([{ weight: 33.33 }, { weight: 33.33 }, { weight: 33.34 }])).toBe(true);
  });

  test("final ponderada normalizada por maxScore y redondeo ROUND_HALF_UP a 2 decimales", () => {
    expect(finalGradeOf(items, { p1: 9, fin: 85, t: 100 })).toEqual({ final: 88, missing: 0 });
    expect(finalGradeOf(items, { p1: 7, fin: 69.99, t: 100 }).final).toBe(72.99);
    expect(round2(72.995)).toBe(73);
    expect(round2("1.005")).toBe(1.01);
  });

  test("lo no capturado cuenta 0 en la proyección y se reporta como faltante", () => {
    expect(finalGradeOf(items, { p1: 10, fin: null })).toEqual({ final: 30, missing: 2 });
    expect(finalGradeOf([], {})).toEqual({ final: 0, missing: 0 });
  });

  test("umbral configurable: >= acredita", () => {
    expect(resultOf(70, 70)).toBe("PASSED");
    expect(resultOf(69.99, 70)).toBe("FAILED");
    expect(resultOf(6, 6)).toBe("PASSED");
  });

  test("rango [0, maxScore] y máximo dos decimales", () => {
    expect(scoreInRange(0, 10)).toBe(true);
    expect(scoreInRange(10, 10)).toBe(true);
    expect(scoreInRange(10.01, 10)).toBe(false);
    expect(scoreInRange(-0.01, 10)).toBe(false);
    expect(hasTwoDecimalsAtMost(8.25)).toBe(true);
    expect(hasTwoDecimalsAtMost(8.255)).toBe(false);
    expect(hasTwoDecimalsAtMost(Number.NaN)).toBe(false);
  });

  test("captura en lote: no vacía, sin inscripciones repetidas", () => {
    const id = crypto.randomUUID();
    expect(GradeCaptureDto.safeParse({ grades: [{ enrollmentId: id, score: 9.5 }] }).success).toBe(true);
    expect(GradeCaptureDto.safeParse({ grades: [{ enrollmentId: id, score: null }] }).success).toBe(true);
    expect(GradeCaptureDto.safeParse({ grades: [] }).success).toBe(false);
    expect(
      GradeCaptureDto.safeParse({ grades: [{ enrollmentId: id, score: 1 }, { enrollmentId: id, score: 2 }] }).success
    ).toBe(false);
  });
});
