import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { usersApi, type User } from "@entities/user";
import { errorMessage } from "@app/toast/useNotify";

interface Props {
  user: User | null;
  onClose: () => void;
  onDone: (user: User) => void;
}

/** Baja lógica con motivo opcional. */
export default function DeactivateUserDialog({ user, onClose, onDone }: Props) {
  const { t } = useTranslation(["users", "common"]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setError(null);
  }, [user]);

  const confirm = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      onDone(await usersApi.deactivate(user.id, reason.trim() || undefined));
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ITDialog
      isOpen={!!user}
      onClose={onClose}
      title={t("deactivate.title", { name: user?.name ?? "" })}
      className="w-full max-w-lg"
    >
      <div role="dialog" aria-label={t("deactivate.title", { name: user?.name ?? "" })}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITText className="text-[12px] text-slate-600">{t("deactivate.message")}</ITText>
          <ITTextarea
            name="reason"
            label={t("deactivate.reason")}
            value={reason}
            onChange={setReason}
            maxLength={500}
            rows={3}
          />
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>
              {t("common:actions.cancel")}
            </ITButton>
            <ITButton variant="filled" color="danger" disabled={saving} onClick={() => void confirm()}>
              {t("deactivate.confirm")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </div>
    </ITDialog>
  );
}
