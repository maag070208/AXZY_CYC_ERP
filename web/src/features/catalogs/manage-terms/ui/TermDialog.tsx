import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDatePicker, ITDialog, ITFlex, ITGrid, ITInput } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { termsApi, type Term } from "@entities/config";
import { errorMessage } from "@app/toast/useNotify";
import { fromDay, toDay } from "../model/day";

interface Props {
  isOpen: boolean;
  term: Term | null;
  onClose: () => void;
  onSaved: (term: Term, created: boolean) => void;
}

export default function TermDialog({ isOpen, term, onClose, onSaved }: Props) {
  const { t } = useTranslation(["config", "common"]);
  const [nombre, setNombre] = useState("");
  const [inicio, setInicio] = useState<Date | undefined>();
  const [fin, setFin] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNombre(term?.nombre ?? "");
    setInicio(term ? fromDay(term.fechaInicio) : undefined);
    setFin(term ? fromDay(term.fechaFin) : undefined);
    setError(null);
  }, [term, isOpen]);

  const save = async () => {
    if (!nombre.trim()) return setError(t("catalogs.nombreRequired"));
    if (!inicio || !fin) return setError(t("terms.datesRequired"));
    if (inicio > fin) return setError(t("terms.datesInvalid"));
    setSaving(true);
    setError(null);
    const data = { nombre: nombre.trim(), fechaInicio: toDay(inicio), fechaFin: toDay(fin) };
    try {
      if (term) onSaved(await termsApi.update(term.id, data), false);
      else onSaved(await termsApi.create(data), true);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const pickDate = (value: unknown): Date | undefined => (value instanceof Date ? value : undefined);

  return (
    <ITDialog
      isOpen={isOpen}
      onClose={onClose}
      title={term ? t("catalogs.editTitle") : t("terms.new")}
      className="w-full max-w-lg"
    >
      <form
        role="dialog"
        aria-label={term ? t("catalogs.editTitle") : t("terms.new")}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITInput
            name="termNombre"
            label={t("terms.nombre")}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              <ITDatePicker
                name="fechaInicio"
                label={t("terms.fechaInicio")}
                value={inicio}
                onChange={(e) => setInicio(pickDate(e.target.value))}
                required
              />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITDatePicker
                name="fechaFin"
                label={t("terms.fechaFin")}
                value={fin}
                minDate={inicio}
                onChange={(e) => setFin(pickDate(e.target.value))}
                required
              />
            </ITGrid>
          </ITGrid>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>
              {t("common:actions.cancel")}
            </ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>
              {saving ? t("common:actions.saving") : t("common:actions.save")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
