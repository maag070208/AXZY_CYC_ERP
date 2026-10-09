import { useEffect, useState } from "react";
import { studentApi, type Gender, type Guardian, type Student } from "@entities/student";
import { ApiError } from "@shared/api/client";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";
import { toDay } from "@shared/lib/day";
import { validateCurp, validateEmail, validatePhone, validateRequired } from "@shared/validation";

export interface GuardianDraft {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  isPaymentResponsible: boolean;
}

export interface StudentFormValues {
  firstNames: string;
  paternalSurname: string;
  maternalSurname: string;
  curp: string;
  birthDate: string;
  gender: Gender | "";
  email: string;
  phone: string;
  address: string;
  enrollmentDate: string;
  guardians: GuardianDraft[];
}

type Field = Exclude<keyof StudentFormValues, "guardians">;
export type FormErrors = Partial<Record<Field | "guardians", string>> & { guardianRows?: Record<number, Partial<Record<keyof GuardianDraft, string>>> };

const emptyGuardian = (): GuardianDraft => ({ name: "", relationship: "", phone: "", email: "", isPaymentResponsible: false });

const fromStudent = (s: Student | null): StudentFormValues => ({
  firstNames: s?.firstNames ?? "",
  paternalSurname: s?.paternalSurname ?? "",
  maternalSurname: s?.maternalSurname ?? "",
  curp: s?.curp ?? "",
  birthDate: s?.birthDate ?? "",
  gender: s?.gender ?? "",
  email: s?.email ?? "",
  phone: s?.phone ?? "",
  address: s?.address ?? "",
  enrollmentDate: s?.enrollmentDate ?? "",
  guardians: (s?.guardians ?? []).map((g: Guardian) => ({
    name: g.name,
    relationship: g.relationship,
    phone: g.phone,
    email: g.email ?? "",
    isPaymentResponsible: g.isPaymentResponsible,
  })),
});

const ageOn = (birth: string, today: string): number => {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
};

const label = (key: string) => i18n.t(`students:form.${key}` as "students:form.firstNames");

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
        return patch.isPaymentResponsible ? { ...g, isPaymentResponsible: false } : g;
      }),
    }));

  const addGuardian = () =>
    setForm((prev) => ({
      ...prev,
      guardians: [...prev.guardians, { ...emptyGuardian(), isPaymentResponsible: prev.guardians.length === 0 }],
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
    required("firstNames");
    required("paternalSurname");
    required("curp");
    required("birthDate");
    if (!next.curp) next.curp = validateCurp(form.curp) ?? undefined;
    if (form.birthDate && form.birthDate > today) next.birthDate = i18n.t("students:form.futureDate");
    next.email = validateEmail(form.email) ?? undefined;
    next.phone = validatePhone(form.phone) ?? undefined;

    const rows: FormErrors["guardianRows"] = {};
    form.guardians.forEach((g, index) => {
      const row: Partial<Record<keyof GuardianDraft, string>> = {};
      if (!g.name.trim()) row.name = i18n.t("students:form.required", { label: label("guardianNombre") });
      if (!g.relationship.trim()) row.relationship = i18n.t("students:form.required", { label: label("relationship") });
      row.phone =
        validateRequired(g.phone, label("phone")) ?? validatePhone(g.phone) ?? undefined;
      row.email = validateEmail(g.email) ?? undefined;
      if (Object.values(row).some(Boolean)) rows[index] = row;
    });
    if (Object.keys(rows).length > 0) next.guardianRows = rows;
    if (form.birthDate && ageOn(form.birthDate, today) < 18 && form.guardians.length === 0) {
      next.guardians = i18n.t("students:form.minorNeedsGuardian");
    }
    if (form.guardians.filter((g) => g.isPaymentResponsible).length > 1) next.guardians = i18n.t("students:form.onePayer");

    for (const key of Object.keys(next) as Array<keyof FormErrors>) if (!next[key]) delete next[key];
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const payload = (confirmDuplicate: boolean) => ({
    firstNames: form.firstNames.trim(),
    paternalSurname: form.paternalSurname.trim(),
    maternalSurname: form.maternalSurname.trim() || null,
    curp: form.curp.trim().toUpperCase(),
    birthDate: form.birthDate,
    gender: form.gender || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    address: form.address.trim() || null,
    ...(!isEdit && form.enrollmentDate ? { enrollmentDate: form.enrollmentDate } : {}),
    guardians: form.guardians.map((g) => ({
      name: g.name.trim(),
      relationship: g.relationship.trim(),
      phone: g.phone.trim(),
      email: g.email.trim() || null,
      isPaymentResponsible: g.isPaymentResponsible,
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
        const matches = (err.details as { details?: { matches?: Array<{ studentNumber: string }> } } | undefined)?.details?.matches ?? [];
        setDuplicates(matches.map((m) => m.studentNumber));
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
