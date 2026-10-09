import { useEffect, useState } from "react";
import { studentApi, type Gender, type Guardian, type Student } from "@entities/student";
import { ApiError } from "@shared/api/client";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";
import { toDay } from "@shared/lib/day";
import { validateCurp, validateEmail, validatePhone, validateRequired } from "@shared/validation";

export interface GuardianDraft {
  nombre: string;
  parentesco: string;
  telefono: string;
  email: string;
  esResponsablePago: boolean;
}

export interface StudentFormValues {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  curp: string;
  fechaNacimiento: string;
  genero: Gender | "";
  email: string;
  telefono: string;
  direccion: string;
  fechaIngreso: string;
  guardians: GuardianDraft[];
}

type Field = Exclude<keyof StudentFormValues, "guardians">;
export type FormErrors = Partial<Record<Field | "guardians", string>> & { guardianRows?: Record<number, Partial<Record<keyof GuardianDraft, string>>> };

const emptyGuardian = (): GuardianDraft => ({ nombre: "", parentesco: "", telefono: "", email: "", esResponsablePago: false });

const fromStudent = (s: Student | null): StudentFormValues => ({
  nombres: s?.nombres ?? "",
  apellidoPaterno: s?.apellidoPaterno ?? "",
  apellidoMaterno: s?.apellidoMaterno ?? "",
  curp: s?.curp ?? "",
  fechaNacimiento: s?.fechaNacimiento ?? "",
  genero: s?.genero ?? "",
  email: s?.email ?? "",
  telefono: s?.telefono ?? "",
  direccion: s?.direccion ?? "",
  fechaIngreso: s?.fechaIngreso ?? "",
  guardians: (s?.guardians ?? []).map((g: Guardian) => ({
    nombre: g.nombre,
    parentesco: g.parentesco,
    telefono: g.telefono,
    email: g.email ?? "",
    esResponsablePago: g.esResponsablePago,
  })),
});

const ageOn = (birth: string, today: string): number => {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
};

const label = (key: string) => i18n.t(`students:form.${key}` as "students:form.nombres");

/**
 * Alta/edición de alumno con tutores. Valida lo mismo que la API (CURP con
 * dígito verificador, menor con tutor, un responsable de pago) y, si la API
 * detecta un homónimo, pide confirmación antes de reenviar.
 */
export const useStudentForm = (student: Student | null, onSaved: (student: Student, created: boolean) => void) => {
  const isEdit = !!student;
  const [form, setForm] = useState<StudentFormValues>(fromStudent(student));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<string[] | null>(null);

  useEffect(() => {
    setForm(fromStudent(student));
    setErrors({});
  }, [student]);

  const set = <K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setGuardian = (index: number, patch: Partial<GuardianDraft>) =>
    setForm((prev) => ({
      ...prev,
      guardians: prev.guardians.map((g, i) => {
        if (i === index) return { ...g, ...patch };
        // Marcar a uno como responsable de pago desmarca a los demás.
        return patch.esResponsablePago ? { ...g, esResponsablePago: false } : g;
      }),
    }));

  const addGuardian = () =>
    setForm((prev) => ({
      ...prev,
      guardians: [...prev.guardians, { ...emptyGuardian(), esResponsablePago: prev.guardians.length === 0 }],
    }));

  const removeGuardian = (index: number) =>
    setForm((prev) => ({ ...prev, guardians: prev.guardians.filter((_, i) => i !== index) }));

  const validate = (): boolean => {
    const today = toDay(new Date());
    const next: FormErrors = {};
    const required = (field: Field) => {
      const message = validateRequired(form[field], label(field));
      if (message) next[field] = message;
    };
    required("nombres");
    required("apellidoPaterno");
    required("curp");
    required("fechaNacimiento");
    if (!next.curp) next.curp = validateCurp(form.curp) ?? undefined;
    if (form.fechaNacimiento && form.fechaNacimiento > today) next.fechaNacimiento = i18n.t("students:form.futureDate");
    next.email = validateEmail(form.email) ?? undefined;
    next.telefono = validatePhone(form.telefono) ?? undefined;

    const rows: FormErrors["guardianRows"] = {};
    form.guardians.forEach((g, index) => {
      const row: Partial<Record<keyof GuardianDraft, string>> = {};
      if (!g.nombre.trim()) row.nombre = i18n.t("students:form.required", { label: label("guardianNombre") });
      if (!g.parentesco.trim()) row.parentesco = i18n.t("students:form.required", { label: label("parentesco") });
      row.telefono =
        validateRequired(g.telefono, label("telefono")) ?? validatePhone(g.telefono) ?? undefined;
      row.email = validateEmail(g.email) ?? undefined;
      if (Object.values(row).some(Boolean)) rows[index] = row;
    });
    if (Object.keys(rows).length > 0) next.guardianRows = rows;
    if (form.fechaNacimiento && ageOn(form.fechaNacimiento, today) < 18 && form.guardians.length === 0) {
      next.guardians = i18n.t("students:form.minorNeedsGuardian");
    }
    if (form.guardians.filter((g) => g.esResponsablePago).length > 1) next.guardians = i18n.t("students:form.onePayer");

    for (const key of Object.keys(next) as Array<keyof FormErrors>) if (!next[key]) delete next[key];
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const payload = (confirmDuplicate: boolean) => ({
    nombres: form.nombres.trim(),
    apellidoPaterno: form.apellidoPaterno.trim(),
    apellidoMaterno: form.apellidoMaterno.trim() || null,
    curp: form.curp.trim().toUpperCase(),
    fechaNacimiento: form.fechaNacimiento,
    genero: form.genero || null,
    email: form.email.trim() || null,
    telefono: form.telefono.trim() || null,
    direccion: form.direccion.trim() || null,
    ...(!isEdit && form.fechaIngreso ? { fechaIngreso: form.fechaIngreso } : {}),
    guardians: form.guardians.map((g) => ({
      nombre: g.nombre.trim(),
      parentesco: g.parentesco.trim(),
      telefono: g.telefono.trim(),
      email: g.email.trim() || null,
      esResponsablePago: g.esResponsablePago,
    })),
    ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
  });

  const submit = async (confirmDuplicate = false): Promise<void> => {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = isEdit
        ? await studentApi.update(student.id, payload(confirmDuplicate))
        : await studentApi.create(payload(confirmDuplicate));
      setDuplicates(null);
      onSaved(saved, !isEdit);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_STUDENT") {
        const matches = (err.details as { details?: { matches?: Array<{ matricula: string }> } } | undefined)?.details?.matches ?? [];
        setDuplicates(matches.map((m) => m.matricula));
      } else if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
        const fieldErrors =
          (err.details as { details?: { fieldErrors?: Record<string, string[]> } } | undefined)?.details?.fieldErrors ?? {};
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([key, list]) => [key, list[0]])));
        setError(err.message);
      } else {
        setError(errorMessage(err, i18n.t("common:errors.save")));
      }
    } finally {
      setSaving(false);
    }
  };

  return {
    isEdit,
    form,
    errors,
    saving,
    error,
    duplicates,
    set,
    setGuardian,
    addGuardian,
    removeGuardian,
    submit,
    confirmDuplicate: () => void submit(true),
    cancelDuplicate: () => setDuplicates(null),
  };
};
