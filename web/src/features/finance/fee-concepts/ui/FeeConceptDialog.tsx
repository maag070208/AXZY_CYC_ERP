import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITTextarea } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { EDITABLE_FEE_TYPES, feeConceptApi, type FeeConcept, type FeeConceptType } from "@entities/finance";
import { errorMessage } from "@app/toast/useNotify";
import { validateRequired } from "@shared/validation";

interface Props {
  isOpen: boolean;
  concept: FeeConcept | null;
  onClose: () => void;
  onSaved: (concept: FeeConcept, created: boolean) => void;
}

export default function FeeConceptDialog({ isOpen, concept, onClose, onSaved }: Props) {
  const { t } = useTranslation(["finance", "common"]);
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [tipo, setTipo] = useState<FeeConceptType>("COLEGIATURA");
  const [descripcion, setDescripcion] = useState("");
  const [errors, setErrors] = useState<{ nombre?: string; monto?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNombre(concept?.nombre ?? "");
    setMonto(concept ? String(concept.monto) : "");
    setTipo(concept?.tipo ?? "COLEGIATURA");
    setDescripcion(concept?.descripcion ?? "");
    setErrors({});
    setError(null);
  }, [concept, isOpen]);

  const save = async () => {
    const amount = Number(monto);
    const next = {
      nombre: validateRequired(nombre, t("concepts.nombre")) ?? undefined,
      monto: monto !== "" && Number.isFinite(amount) && amount >= 0 ? undefined : t("common:validation.required", { label: t("concepts.monto") }),
    };
    setErrors(next);
    if (next.nombre || next.monto) return;
    setSaving(true);
    setError(null);
    const data = { nombre: nombre.trim(), monto: amount, tipo, descripcion: descripcion.trim() || null };
    try {
      if (concept) onSaved(await feeConceptApi.update(concept.id, data), false);
      else onSaved(await feeConceptApi.create(data), true);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = concept ? t("concepts.titleEdit") : t("concepts.titleNew");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12}>
              <ITInput name="nombre" label={t("concepts.nombre")} value={nombre} required error={errors.nombre} onChange={(e) => setNombre(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput name="monto" type="number" label={t("concepts.monto")} value={monto} required error={errors.monto} onChange={(e) => setMonto(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="tipo" label={t("concepts.tipo")} value={tipo}
                options={EDITABLE_FEE_TYPES.map((x) => ({ value: x, label: t(`concepts.types.${x}`) }))}
                onChange={(e) => setTipo(e.target.value as FeeConceptType)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="descripcion" label={t("concepts.descripcion")} value={descripcion} onChange={setDescripcion} rows={2} maxLength={500} />
            </ITGrid>
          </ITGrid>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{saving ? t("common:actions.saving") : t("common:actions.save")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
