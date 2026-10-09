import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITGrid, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { teacherApi, type Teacher } from "@entities/teacher";
import { errorMessage } from "@app/toast/useNotify";
import { validateEmail, validatePhone, validateRequired } from "@shared/validation";

interface Props {
  isOpen: boolean;
  teacher: Teacher | null;
  onClose: () => void;
  onSaved: (teacher: Teacher, created: boolean) => void;
}

type Field = "firstNames" | "surnames" | "email" | "phone" | "specialty";

/** Alta (crea cuenta + invitación) y edición de un profesor. */
export default function TeacherFormDialog({ isOpen, teacher, onClose, onSaved }: Props) {
  const { t } = useTranslation(["teachers", "common"]);
  const [values, setValues] = useState<Record<Field, string>>({ firstNames: "", surnames: "", email: "", phone: "", specialty: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues({
      firstNames: teacher?.firstNames ?? "",
      surnames: teacher?.surnames ?? "",
      email: teacher?.email ?? "",
      phone: teacher?.phone ?? "",
      specialty: teacher?.specialty ?? "",
    });
    setErrors({});
    setError(null);
  }, [teacher, isOpen]);

  const set = (field: Field, value: string) => setValues((prev) => ({ ...prev, [field]: value }));

  const save = async () => {
    const next: Partial<Record<Field, string>> = {
      firstNames: validateRequired(values.firstNames, t("form.firstNames")) ?? undefined,
      surnames: validateRequired(values.surnames, t("form.surnames")) ?? undefined,
      email: validateRequired(values.email, t("form.email")) ?? validateEmail(values.email) ?? undefined,
      phone: validatePhone(values.phone) ?? undefined,
    };
    for (const key of Object.keys(next) as Field[]) if (!next[key]) delete next[key];
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setError(null);
    const data = {
      firstNames: values.firstNames.trim(),
      surnames: values.surnames.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() || null,
      specialty: values.specialty.trim() || null,
    };
    try {
      if (teacher) onSaved(await teacherApi.update(teacher.id, data), false);
      else onSaved(await teacherApi.create(data), true);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = teacher ? t("form.titleEdit") : t("form.titleNew");
  const input = (field: Field, required = false, type: "text" | "email" = "text") => (
    <ITInput name={field} type={type} label={t(`form.${field}`)} value={values[field]} required={required}
      error={errors[field]} onChange={(e) => set(field, e.target.value)} />
  );

  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-2xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          {!teacher && <ITText className="text-[12px] text-slate-500">{t("form.newHint")}</ITText>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>{input("firstNames", true)}</ITGrid>
            <ITGrid item xs={12} md={6}>{input("surnames", true)}</ITGrid>
            <ITGrid item xs={12} md={6}>{input("email", true, "email")}</ITGrid>
            <ITGrid item xs={12} md={6}>{input("phone")}</ITGrid>
            <ITGrid item xs={12}>{input("specialty")}</ITGrid>
          </ITGrid>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>
              {saving ? t("common:actions.saving") : t("common:actions.save")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
