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

type Errors = Partial<Record<"recipient" | "body", string>>;
interface Var {
  id: number;
  key: string;
  value: string;
}

/** Envío manual o de prueba por el outbox (M19 §4.3). */
export default function SendDialog({ isOpen, onClose, onSent }: Props) {
  const { t } = useTranslation(["notifications", "common"]);
  const [channel, setChannel] = useState<NotificationChannel>("EMAIL");
  const [recipient, setRecipient] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [variables, setVariables] = useState<Var[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setChannel("EMAIL");
    setRecipient("");
    setTemplateCode("");
    setSubject("");
    setBody("");
    setVariables([]);
    setErrors({});
    setError(null);
    templateApi.table({ page: 1, limit: 100, filters: { active: true } })
      .then((res) => setTemplates([...new Set(res.data.map((tpl) => tpl.code))]))
      .catch(() => setTemplates([]));
  }, [isOpen]);

  const addVar = () => setVariables((prev) => [...prev, { id: Date.now(), key: "", value: "" }]);
  const setVar = (id: number, patch: Partial<Var>) => setVariables((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const save = async () => {
    const next: Errors = {
      recipient: recipient.trim() ? undefined : t("common:validation.required", { label: t("outbox.recipient") }),
      body: templateCode || body.trim() ? undefined : t("common:validation.required", { label: t("outbox.body") }),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const payload = Object.fromEntries(variables.filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value]));
    setSaving(true);
    setError(null);
    try {
      const item = await notificationApi.send({
        channel,
        recipient: recipient.trim(),
        ...(templateCode ? { templateCode } : {}),
        subject: subject.trim() || null,
        body: body.trim() || null,
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
              <ITSelect name="channel" label={t("outbox.channel")} value={channel}
                options={NOTIFICATION_CHANNELS.map((c) => ({ value: c, label: t(`channels.${c}`) }))}
                onChange={(e) => setChannel(e.target.value as NotificationChannel)} />
            </ITGrid>
            <ITGrid item xs={12} md={8}>
              <ITInput name="recipient" label={t("outbox.recipient")} value={recipient} required error={errors.recipient}
                placeholder={channel === "IN_APP" ? "user:<uuid>" : channel === "EMAIL" ? "correo@dominio" : "+526141234567"}
                onChange={(e) => setRecipient(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITText className="text-[11px] text-slate-400">{t(`outbox.recipientHint.${channel}`)}</ITText>
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="templateCode" label={t("outbox.template")} value={templateCode} placeholder={t("outbox.noTemplate")}
                options={[{ value: "", label: t("outbox.noTemplate") }, ...templates.map((c) => ({ value: c, label: c }))]}
                onChange={(e) => setTemplateCode(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput name="subject" label={t("outbox.subject")} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="body" label={t("outbox.body")} value={body} onChange={setBody} rows={4} maxLength={5000} error={errors.body} />
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
