import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITCheckbox, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { NOTIFICATION_CHANNELS, templateApi, type NotificationChannel, type NotificationTemplate } from "@entities/notification";

interface Props {
  isOpen: boolean;
  template: NotificationTemplate | null;
  onClose: () => void;
  onSaved: (template: NotificationTemplate) => void;
}

type Errors = Partial<Record<"clave" | "nombre" | "cuerpo" | "asunto", string>>;

const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const variablesIn = (...texts: string[]): string[] => {
  const found: string[] = [];
  for (const text of texts) for (const match of text.matchAll(VARIABLE)) if (!found.includes(match[1])) found.push(match[1]);
  return found;
};

/** Alta/edición de una plantilla de notificación (M19 §4.1). */
export default function TemplateFormDialog({ isOpen, template, onClose, onSaved }: Props) {
  const { t } = useTranslation(["notifications", "common"]);
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [canal, setCanal] = useState<NotificationChannel>("EMAIL");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [obligatorio, setObligatorio] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setClave(template?.clave ?? "");
    setNombre(template?.nombre ?? "");
    setCanal(template?.canal ?? "EMAIL");
    setAsunto(template?.asunto ?? "");
    setCuerpo(template?.cuerpo ?? "");
    setObligatorio(template?.obligatorio ?? false);
    setErrors({});
    setError(null);
  }, [template, isOpen]);

  const save = async () => {
    const next: Errors = {
      clave: !template && !/^[A-Z][A-Z0-9_]{1,59}$/.test(clave.trim()) ? t("templates.badClave") : undefined,
      nombre: nombre.trim() ? undefined : t("common:validation.required", { label: t("templates.nombre") }),
      cuerpo: cuerpo.trim() ? undefined : t("common:validation.required", { label: t("templates.cuerpo") }),
      asunto: canal !== "EMAIL" || asunto.trim() ? undefined : t("common:validation.required", { label: t("templates.asunto") }),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const variables = variablesIn(asunto, cuerpo);
    setSaving(true);
    setError(null);
    try {
      const data = { nombre: nombre.trim(), asunto: asunto.trim() || null, cuerpo: cuerpo.trim(), variables, obligatorio };
      const saved = template
        ? await templateApi.update(template.id, data)
        : await templateApi.create({ ...data, clave: clave.trim(), canal });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = template ? t("templates.titleEdit") : t("templates.titleNew");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-2xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={4}>
              <ITInput name="clave" label={t("templates.clave")} value={clave} required disabled={!!template} error={errors.clave} maxLength={60} placeholder="ALERTA_INASISTENCIA" onChange={(e) => setClave(e.target.value.toUpperCase())} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="nombre" label={t("templates.nombre")} value={nombre} required error={errors.nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITSelect name="canal" label={t("templates.canal")} value={canal} disabled={!!template}
                options={NOTIFICATION_CHANNELS.map((c) => ({ value: c, label: t(`channels.${c}`) }))}
                onChange={(e) => setCanal(e.target.value as NotificationChannel)} />
            </ITGrid>
            {canal === "EMAIL" && (
              <ITGrid item xs={12}>
                <ITInput name="asunto" label={t("templates.asunto")} value={asunto} required error={errors.asunto} maxLength={200} onChange={(e) => setAsunto(e.target.value)} />
              </ITGrid>
            )}
            <ITGrid item xs={12}>
              <ITTextarea name="cuerpo" label={t("templates.cuerpo")} value={cuerpo} onChange={setCuerpo} rows={5} maxLength={5000} error={errors.cuerpo} />
            </ITGrid>
          </ITGrid>
          <ITText className="text-[11px] text-slate-400">{t("templates.variablesHint")}</ITText>
          <ITCheckbox name="obligatorio" label={t("templates.obligatorio")} checked={obligatorio} onChange={setObligatorio} />
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{t("common:actions.save")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
