import { useCallback, useEffect, useState } from "react";
import { settingsApi, type LateFee, type Setting, type SettingKey } from "@entities/config";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";

export interface SettingsValues {
  SCHOOL_NAME: string;
  SCHOOL_ADDRESS: string;
  SCHOOL_PHONE: string;
  SCHOOL_EMAIL: string;
  MIN_PASSING_GRADE: number;
  ATTENDANCE_THRESHOLD: number;
  LATE_FEE: LateFee;
  LANGUAGE: "es" | "en";
}

const DEFAULTS: SettingsValues = {
  SCHOOL_NAME: "",
  SCHOOL_ADDRESS: "",
  SCHOOL_PHONE: "",
  SCHOOL_EMAIL: "",
  MIN_PASSING_GRADE: 70,
  ATTENDANCE_THRESHOLD: 80,
  LATE_FEE: { enabled: false, dailyRate: 0, graceDays: 0 },
  LANGUAGE: "es",
};

const toValues = (settings: Setting[]): SettingsValues => {
  const byKey = new Map(settings.map((s) => [s.key, s.value]));
  const pick = <K extends keyof SettingsValues>(key: K): SettingsValues[K] =>
    (byKey.has(key) ? byKey.get(key) : DEFAULTS[key]) as SettingsValues[K];
  return {
    SCHOOL_NAME: pick("SCHOOL_NAME"),
    SCHOOL_ADDRESS: pick("SCHOOL_ADDRESS"),
    SCHOOL_PHONE: pick("SCHOOL_PHONE"),
    SCHOOL_EMAIL: pick("SCHOOL_EMAIL"),
    MIN_PASSING_GRADE: pick("MIN_PASSING_GRADE"),
    ATTENDANCE_THRESHOLD: pick("ATTENDANCE_THRESHOLD"),
    LATE_FEE: pick("LATE_FEE"),
    LANGUAGE: pick("LANGUAGE"),
  };
};

/** Formulario de parámetros generales: envía solo las claves que cambiaron. */
export const useSettingsForm = (onSaved?: () => void) => {
  const [initial, setInitial] = useState<SettingsValues>(DEFAULTS);
  const [values, setValues] = useState<SettingsValues>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = toValues(await settingsApi.list());
      setInitial(next);
      setValues(next);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.load")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const changedKeys = (Object.keys(values) as Array<keyof SettingsValues>).filter(
    (key) => JSON.stringify(values[key]) !== JSON.stringify(initial[key])
  );

  const save = async () => {
    if (changedKeys.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const body: Partial<Record<SettingKey, unknown>> = {};
      for (const key of changedKeys) body[key] = values[key];
      const next = toValues(await settingsApi.update(body));
      setInitial(next);
      setValues(next);
      onSaved?.();
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  return { values, set, loading, saving, error, dirty: changedKeys.length > 0, save, reset: () => setValues(initial) };
};
