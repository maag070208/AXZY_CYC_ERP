import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { FaPlus, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { notificationApi, NOTIFICATION_CHANNELS, templateApi, type NotificationChannel, type NotificationItem } from "@entities/notification";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSent: (item: NotificationItem) => void;
}

type Errors = Partial<Record<"destinatario" | "cuerpo", string>>;
interface Var {
  id: number;
  key: string;
  value: string;
}

/** Envío manual o de prueba por el outbox (M19 §4.3). */
export default function SendDialog({ isOpen, onClose, onSent }: Props) {
  const { t } = useTranslation(["notifications", "common"]);
  const [canal, setCanal] = useState<NotificationChannel>("EMAIL");
  const [destinatario, setDestinatario] = useState("");
  const [templateClave, setTemplateClave] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [variables, setVariables] = useState<Var[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCanal("EMAIL");
    setDestinatario("");
    setTemplateClave("");
    setAsunto("");
    setCuerpo("");
    setVariables([]);
    setErrors({});
    setError(null);
    templateApi.table({ page: 1, limit: 100, filters: { active: true } })
      .then((res) => setTemplates([...new Set(res.data.map((tpl) => tpl.clave))]))
      .catch(() => setTemplates([]));
  }, [isOpen]);

  const addVar = () => setVariables((prev) => [...prev, { id: Date.now(), key: "", value: "" }]);
  const setVar = (id: number, patch: Partial<Var>) => setVariables((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const save = async () => {
    const next: Errors = {
      destinatario: destinatario.trim() ? undefined : t("common:validation.required", { label: t("outbox.destinatario") }),
      cuerpo: templateClave || cuerpo.trim() ? undefined : t("common:validation.required", { label: t("outbox.cuerpo") }),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const payload = Object.fromEntries(variables.filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value]));
    setSaving(true);
    setError(null);
    try {
      const item = await notificationApi.send({
        canal,
        destinatario: destinatario.trim(),
        ...(templateClave ? { templateClave } : {}),
        asunto: asunto.trim() || null,
        cuerpo: cuerpo.trim() || null,
        payload,
      });
      onSent(item);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = t("outbox.sendTitle");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-2xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={4}>
              <ITSelect name="canal" label={t("outbox.canal")} value={canal}
                options={NOTIFICATION_CHANNELS.map((c) => ({ value: c, label: t(`channels.${c}`) }))}
                onChange={(e) => setCanal(e.target.value as NotificationChannel)} />
            </ITGrid>
            <ITGrid item xs={12} md={8}>
              <ITInput name="destinatario" label={t("outbox.destinatario")} value={destinatario} required error={errors.destinatario}
                placeholder={canal === "INTERNO" ? "user:<uuid>" : canal === "EMAIL" ? "correo@dominio" : "+526141234567"}
                onChange={(e) => setDestinatario(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITText className="text-[11px] text-slate-400">{t(`outbox.recipientHint.${canal}`)}</ITText>
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="templateClave" label={t("outbox.plantilla")} value={templateClave} placeholder={t("outbox.sinPlantilla")}
                options={[{ value: "", label: t("outbox.sinPlantilla") }, ...templates.map((c) => ({ value: c, label: c }))]}
                onChange={(e) => setTemplateClave(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput name="asunto" label={t("outbox.asunto")} value={asunto} maxLength={200} onChange={(e) => setAsunto(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="cuerpo" label={t("outbox.cuerpo")} value={cuerpo} onChange={setCuerpo} rows={4} maxLength={5000} error={errors.cuerpo} />
            </ITGrid>
          </ITGrid>

          <ITFlex direction="column" gap={2}>
            <ITFlex justify="between" align="center">
              <ITText className="text-[11px] font-black uppercase tracking-wide text-slate-400">{t("outbox.variables")}</ITText>
              <ITButton variant="text" color="primary" size="sm" onClick={addVar}><FaPlus size={10} /> {t("common:actions.add")}</ITButton>
            </ITFlex>
            {variables.map((v) => (
              <ITFlex key={v.id} gap={2} align="center">
                <ITInput name={`var-key-${v.id}`} value={v.key} placeholder="variable" onChange={(e) => setVar(v.id, { key: e.target.value })} />
                <ITInput name={`var-value-${v.id}`} value={v.value} placeholder="valor" onChange={(e) => setVar(v.id, { value: e.target.value })} />
                <ITButton variant="text" color="danger" size="sm" ariaLabel={t("common:actions.remove")} onClick={() => setVariables((prev) => prev.filter((x) => x.id !== v.id))}>
                  <FaTrash size={11} />
                </ITButton>
              </ITFlex>
            ))}
          </ITFlex>

          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{t("outbox.send")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
