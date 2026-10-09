import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDatePicker, ITDialog, ITFlex, ITGrid, ITInput, ITSelect } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { ASSESSMENT_TYPES, assessmentApi, type Assessment, type AssessmentType } from "@entities/grade";
import { errorMessage } from "@app/toast/useNotify";
import { fromDay, toDay } from "@shared/lib/day";
import { validateRequired } from "@shared/validation";

interface Props {
  isOpen: boolean;
  groupId: string;
  assessment: Assessment | null;
  /** Porcentaje que aún queda libre (para sugerir y validar). */
  available: number;
  onClose: () => void;
  onSaved: (assessment: Assessment, created: boolean) => void;
}

const pickDay = (value: unknown): string => (value instanceof Date && !Number.isNaN(value.getTime()) ? toDay(value) : "");
const twoDecimals = (v: number) => Math.abs(Math.round(v * 100) - v * 100) < 1e-9;

/** Alta/edición de un instrumento: nombre, tipo, ponderación (%), máximo y fecha. */
export default function AssessmentFormDialog({ isOpen, groupId, assessment, available, onClose, onSaved }: Props) {
  const { t } = useTranslation(["grades", "common"]);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<AssessmentType>("PARCIAL");
  const [ponderacion, setPonderacion] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [fecha, setFecha] = useState("");
  const [errors, setErrors] = useState<{ nombre?: string; ponderacion?: string; maxScore?: string }>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNombre(assessment?.nombre ?? "");
    setTipo(assessment?.tipo ?? "PARCIAL");
    setPonderacion(assessment ? String(assessment.ponderacion) : available > 0 ? String(available) : "");
    setMaxScore(String(assessment?.maxScore ?? 100));
    setFecha(assessment?.fecha ?? "");
    setErrors({});
    setError(null);
  }, [assessment, isOpen, available]);

  const save = async () => {
    const weight = Number(ponderacion);
    const max = Number(maxScore);
    const next = {
      nombre: validateRequired(nombre, t("assessments.nombre")) ?? undefined,
      ponderacion: weight > 0 && weight <= 100 && twoDecimals(weight) ? undefined : "0 < % ≤ 100",
      maxScore: max > 0 && twoDecimals(max) ? undefined : "> 0",
    };
    setErrors(next);
    if (next.nombre || next.ponderacion || next.maxScore) return;
    setSaving(true);
    setError(null);
    const data = { nombre: nombre.trim(), tipo, ponderacion: weight, maxScore: max, fecha: fecha || null };
    try {
      if (assessment) onSaved(await assessmentApi.update(assessment.id, data), false);
      else onSaved(await assessmentApi.create({ ...data, groupId }), true);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = assessment ? t("assessments.titleEdit") : t("assessments.titleNew");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={8}>
              <ITInput name="nombre" label={t("assessments.nombre")} value={nombre} required error={errors.nombre}
                onChange={(e) => setNombre(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITSelect name="tipo" label={t("assessments.tipo")} value={tipo}
                options={ASSESSMENT_TYPES.map((x) => ({ value: x, label: t(`assessments.types.${x}`) }))}
                onChange={(e) => setTipo(e.target.value as AssessmentType)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="ponderacion" type="number" label={t("assessments.ponderacion")} value={ponderacion} required
                error={errors.ponderacion} onChange={(e) => setPonderacion(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="maxScore" type="number" label={t("assessments.maxScore")} value={maxScore} required
                error={errors.maxScore} onChange={(e) => setMaxScore(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITDatePicker name="fecha" label={t("assessments.fecha")} value={fecha ? fromDay(fecha) : undefined}
                onChange={(e) => setFecha(pickDay(e.target.value))} />
            </ITGrid>
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
