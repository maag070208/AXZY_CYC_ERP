import { test, expect } from "@playwright/test";
import { SETTING_SCHEMAS, isSecretSetting, isSettingKey } from "../../src/modules/config/models/dto/settings.dto";

/** Validación por clave de los parámetros generales (M11). */

test("las claves sembradas por la migración tienen esquema", () => {
  for (const key of [
    "SCHOOL_NAME",
    "MIN_PASSING_GRADE",
    "ATTENDANCE_THRESHOLD",
    "LATE_FEE",
    "LANGUAGE",
    "SCHOOL_LOGO_PATH",
  ]) {
    expect(isSettingKey(key), key).toBe(true);
  }
  expect(isSettingKey("NO_EXISTE")).toBe(false);
  expect(isSettingKey("toString")).toBe(false);
});

test("MIN_PASSING_GRADE y ATTENDANCE_THRESHOLD van de 0 a 100", () => {
  expect(SETTING_SCHEMAS.MIN_PASSING_GRADE.safeParse(70).success).toBe(true);
  expect(SETTING_SCHEMAS.MIN_PASSING_GRADE.safeParse(101).success).toBe(false);
  expect(SETTING_SCHEMAS.ATTENDANCE_THRESHOLD.safeParse(-1).success).toBe(false);
  expect(SETTING_SCHEMAS.ATTENDANCE_THRESHOLD.safeParse("80").success).toBe(false);
});

test("LATE_FEE exige su forma completa y nada más", () => {
  expect(SETTING_SCHEMAS.LATE_FEE.safeParse({ enabled: false, dailyRate: 0, graceDays: 0 }).success).toBe(true);
  expect(SETTING_SCHEMAS.LATE_FEE.safeParse({ enabled: true, dailyRate: 0.02 }).success).toBe(false);
  expect(SETTING_SCHEMAS.LATE_FEE.safeParse({ enabled: true, dailyRate: 2, graceDays: 1 }).success).toBe(false);
  expect(
    SETTING_SCHEMAS.LATE_FEE.safeParse({ enabled: true, dailyRate: 0.1, graceDays: 1, extra: 1 }).success
  ).toBe(false);
});

test("SCHOOL_EMAIL admite vacío o un correo válido; LANGUAGE solo es|en", () => {
  expect(SETTING_SCHEMAS.SCHOOL_EMAIL.safeParse("").success).toBe(true);
  expect(SETTING_SCHEMAS.SCHOOL_EMAIL.safeParse("contacto@cyc.mx").success).toBe(true);
  expect(SETTING_SCHEMAS.SCHOOL_EMAIL.safeParse("no-es").success).toBe(false);
  expect(SETTING_SCHEMAS.LANGUAGE.safeParse("fr").success).toBe(false);
});

test("los secretos se enmascaran en la bitácora", () => {
  expect(isSecretSetting("SMTP_PASSWORD")).toBe(true);
  expect(isSecretSetting("RESEND_API_KEY")).toBe(true);
  expect(isSecretSetting("SCHOOL_NAME")).toBe(false);
});
