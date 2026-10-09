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
  const [name, setName] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [type, setType] = useState<FeeConceptType>("TUITION");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(concept?.name ?? "");
    setAmountInput(concept ? String(concept.amount) : "");
    setType(concept?.type ?? "TUITION");
    setDescription(concept?.description ?? "");
    setErrors({});
    setError(null);
  }, [concept, isOpen]);

  const save = async () => {
    const amount = Number(amountInput);
    const next = {
      name: validateRequired(name, t("concepts.nombre")) ?? undefined,
      amount: amountInput !== "" && Number.isFinite(amount) && amount >= 0 ? undefined : t("common:validation.required", { label: t("concepts.monto") }),
    };
    setErrors(next);
    if (next.name || next.amount) return;
    setSaving(true);
    setError(null);
    const data = { name: name.trim(), amount: amount, type, description: description.trim() || null };
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
              <ITInput name="name" label={t("concepts.nombre")} value={name} required error={errors.name} onChange={(e) => setName(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput name="amount" type="number" label={t("concepts.monto")} value={amountInput} required error={errors.amount} onChange={(e) => setAmountInput(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="type" label={t("concepts.tipo")} value={type}
                options={EDITABLE_FEE_TYPES.map((x) => ({ value: x, label: t(`concepts.types.${x}`) }))}
                onChange={(e) => setType(e.target.value as FeeConceptType)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="description" label={t("concepts.descripcion")} value={description} onChange={setDescription} rows={2} maxLength={500} />
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
