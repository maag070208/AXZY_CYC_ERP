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

type Errors = Partial<Record<"code" | "name" | "body" | "subject", string>>;

const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const variablesIn = (...texts: string[]): string[] => {
  const found: string[] = [];
  for (const text of texts) for (const match of text.matchAll(VARIABLE)) if (!found.includes(match[1])) found.push(match[1]);
  return found;
};

/** Alta/edición de una plantilla de notificación (M19 §4.1). */
export default function TemplateFormDialog({ isOpen, template, onClose, onSaved }: Props) {
  const { t } = useTranslation(["notifications", "common"]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<NotificationChannel>("EMAIL");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [required, setRequired] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCode(template?.code ?? "");
    setName(template?.name ?? "");
    setChannel(template?.channel ?? "EMAIL");
    setSubject(template?.subject ?? "");
    setBody(template?.body ?? "");
    setRequired(template?.required ?? false);
    setErrors({});
    setError(null);
  }, [template, isOpen]);

  const save = async () => {
    const next: Errors = {
      code: !template && !/^[A-Z][A-Z0-9_]{1,59}$/.test(code.trim()) ? t("templates.badCodeFormat") : undefined,
      name: name.trim() ? undefined : t("common:validation.required", { label: t("templates.name") }),
      body: body.trim() ? undefined : t("common:validation.required", { label: t("templates.body") }),
      subject: channel !== "EMAIL" || subject.trim() ? undefined : t("common:validation.required", { label: t("templates.subject") }),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const variables = variablesIn(subject, body);
    setSaving(true);
    setError(null);
    try {
      const data = { name: name.trim(), subject: subject.trim() || null, body: body.trim(), variables, required };
      const saved = template
        ? await templateApi.update(template.id, data)
        : await templateApi.create({ ...data, code: code.trim(), channel });
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
              <ITInput name="code" label={t("templates.code")} value={code} required disabled={!!template} error={errors.code} maxLength={60} placeholder="ABSENCE_ALERT" onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="name" label={t("templates.name")} value={name} required error={errors.name} maxLength={150} onChange={(e) => setName(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITSelect name="channel" label={t("templates.channel")} value={channel} disabled={!!template}
                options={NOTIFICATION_CHANNELS.map((c) => ({ value: c, label: t(`channels.${c}`) }))}
                onChange={(e) => setChannel(e.target.value as NotificationChannel)} />
            </ITGrid>
            {channel === "EMAIL" && (
              <ITGrid item xs={12}>
                <ITInput name="subject" label={t("templates.subject")} value={subject} required error={errors.subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
              </ITGrid>
            )}
            <ITGrid item xs={12}>
              <ITTextarea name="body" label={t("templates.body")} value={body} onChange={setBody} rows={5} maxLength={5000} error={errors.body} />
            </ITGrid>
          </ITGrid>
          <ITText className="text-[11px] text-slate-400">{t("templates.variablesHint")}</ITText>
          <ITCheckbox name="required" label={t("templates.required")} checked={required} onChange={setRequired} />
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{t("common:actions.save")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
