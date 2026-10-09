import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { courseApi, type Course } from "@entities/course";
import { catalogApi, type CatalogItem } from "@entities/config";
import { errorMessage } from "@app/toast/useNotify";
import { validateRequired } from "@shared/validation";

interface Props {
  isOpen: boolean;
  course: Course | null;
  onClose: () => void;
  onSaved: (course: Course, created: boolean) => void;
}

const CLAVE = /^[A-Z0-9][A-Z0-9._-]*$/;

/** Alta y edición de un curso (clave, nombre, nivel, descripción). */
export default function CourseFormDialog({ isOpen, course, onClose, onSaved }: Props) {
  const { t } = useTranslation(["courses", "common"]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [levelId, setLevelId] = useState("");
  const [description, setDescription] = useState("");
  const [levels, setLevels] = useState<CatalogItem[]>([]);
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCode(course?.code ?? "");
    setName(course?.name ?? "");
    setLevelId(course?.levelId ?? "");
    setDescription(course?.description ?? "");
    setErrors({});
    setError(null);
    catalogApi.options("levels").then(setLevels).catch(() => setLevels([]));
  }, [course, isOpen]);

  const save = async () => {
    const normalized = code.trim().toUpperCase();
    const next = {
      code: validateRequired(normalized, t("courses.code")) ?? (CLAVE.test(normalized) ? undefined : t("courses.codeHint")),
      name: validateRequired(name, t("courses.name")) ?? undefined,
    };
    setErrors(next);
    if (next.code || next.name) return;
    setSaving(true);
    setError(null);
    const data = { code: normalized, name: name.trim(), levelId: levelId || null, description: description.trim() || null };
    try {
      if (course) onSaved(await courseApi.update(course.id, data), false);
      else onSaved(await courseApi.create(data), true);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = course ? t("courses.titleEdit") : t("courses.titleNew");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={5}>
              <ITInput name="code" label={t("courses.code")} value={code} required error={errors.code}
                onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </ITGrid>
            <ITGrid item xs={12} md={7}>
              <ITInput name="name" label={t("courses.name")} value={name} required error={errors.name}
                onChange={(e) => setName(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITSelect name="levelId" label={t("courses.level")} value={levelId} placeholder={t("courses.noLevel")}
                options={levels.map((l) => ({ value: l.id, label: l.name }))} onChange={(e) => setLevelId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="description" label={t("courses.descriptionField")} value={description} onChange={setDescription} rows={3} maxLength={1000} />
            </ITGrid>
          </ITGrid>
          <ITText className="text-[11px] text-slate-400">{t("courses.codeHint")}</ITText>
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
