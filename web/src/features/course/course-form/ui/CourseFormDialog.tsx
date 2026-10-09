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
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [levelId, setLevelId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [levels, setLevels] = useState<CatalogItem[]>([]);
  const [errors, setErrors] = useState<{ clave?: string; nombre?: string }>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setClave(course?.clave ?? "");
    setNombre(course?.nombre ?? "");
    setLevelId(course?.levelId ?? "");
    setDescripcion(course?.descripcion ?? "");
    setErrors({});
    setError(null);
    catalogApi.options("levels").then(setLevels).catch(() => setLevels([]));
  }, [course, isOpen]);

  const save = async () => {
    const normalized = clave.trim().toUpperCase();
    const next = {
      clave: validateRequired(normalized, t("courses.clave")) ?? (CLAVE.test(normalized) ? undefined : t("courses.claveHint")),
      nombre: validateRequired(nombre, t("courses.nombre")) ?? undefined,
    };
    setErrors(next);
    if (next.clave || next.nombre) return;
    setSaving(true);
    setError(null);
    const data = { clave: normalized, nombre: nombre.trim(), levelId: levelId || null, descripcion: descripcion.trim() || null };
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
              <ITInput name="clave" label={t("courses.clave")} value={clave} required error={errors.clave}
                onChange={(e) => setClave(e.target.value.toUpperCase())} />
            </ITGrid>
            <ITGrid item xs={12} md={7}>
              <ITInput name="nombre" label={t("courses.nombre")} value={nombre} required error={errors.nombre}
                onChange={(e) => setNombre(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITSelect name="levelId" label={t("courses.nivel")} value={levelId} placeholder={t("courses.noLevel")}
                options={levels.map((l) => ({ value: l.id, label: l.name }))} onChange={(e) => setLevelId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="descripcion" label={t("courses.descripcion")} value={descripcion} onChange={setDescripcion} rows={3} maxLength={1000} />
            </ITGrid>
          </ITGrid>
          <ITText className="text-[11px] text-slate-400">{t("courses.claveHint")}</ITText>
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
