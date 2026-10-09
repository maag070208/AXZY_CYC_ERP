import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { justificationApi } from "@entities/attendance";
import { validateMinLength, validateRequired } from "@shared/validation";

interface Props {
  isOpen: boolean;
  /** Falta (registro de asistencia) a justificar. */
  attendanceId: string | null;
  studentName?: string;
  onClose: () => void;
  onSaved: () => void;
}

type Errors = Partial<Record<"reason", string>>;

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];

/** Solicitud de justificante de una falta, con archivo opcional (M18 §4.4). */
export default function JustificationRequestDialog({ isOpen, attendanceId, studentName, onClose, onSaved }: Props) {
  const { t } = useTranslation(["attendance", "common"]);
  const notify = useNotify();
  const [reason, setMotivo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMotivo("");
    setFile(null);
    setErrors({});
    setError(null);
  }, [isOpen]);

  const save = async () => {
    const next: Errors = {
      reason: validateRequired(reason, t("justifications.motivo")) ?? validateMinLength(reason, 5, t("justifications.motivo")) ?? undefined,
    };
    setErrors(next);
    if (next.reason) return;
    if (!attendanceId) return;
    setSaving(true);
    setError(null);
    try {
      await justificationApi.create(attendanceId, reason.trim(), file ?? undefined);
      notify.success(t("justifications.requested"));
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = studentName ? t("justifications.requestTitle", { name: studentName }) : t("justifications.requestTitleShort");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-lg">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITText className="text-[12px] text-slate-500">{t("justifications.requestHint")}</ITText>
          <ITTextarea name="reason" label={t("justifications.motivo")} value={reason} onChange={setMotivo} rows={3} maxLength={1000} error={errors.reason} />
          <label className="flex flex-col gap-1 text-[12px] font-bold text-slate-600">
            {t("justifications.archivo")}
            <input
              type="file"
              name="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="rounded-lg border border-slate-200 p-2 text-[12px] font-normal"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                if (picked && (!ACCEPTED.includes(picked.type) || picked.size > MAX_BYTES)) {
                  setError(t("justifications.badFile"));
                  setFile(null);
                  return;
                }
                setError(null);
                setFile(picked);
              }}
            />
          </label>
          <ITText className="text-[11px] text-slate-400">{t("justifications.fileHint")}</ITText>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{t("justifications.request")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
