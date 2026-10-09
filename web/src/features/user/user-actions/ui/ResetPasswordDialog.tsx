import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { usersApi, type User } from "@entities/user";
import { errorMessage } from "@app/toast/useNotify";
import { PASSWORD_MIN_LENGTH } from "@shared/lib/password";

interface Props {
  user: User | null;
  onClose: () => void;
  onDone: (user: User) => void;
}

/** Contraseña temporal asignada por un administrador. */
export default function ResetPasswordDialog({ user, onClose, onDone }: Props) {
  const { t } = useTranslation(["users", "auth", "common"]);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPassword("");
    setError(null);
  }, [user]);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;

  const confirm = async () => {
    if (!user || password.length < PASSWORD_MIN_LENGTH) return;
    setSaving(true);
    setError(null);
    try {
      onDone(await usersApi.resetPassword(user.id, password));
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
      title={t("resetPassword.title", { name: user?.name ?? "" })}
      className="w-full max-w-lg"
    >
      <div role="dialog" aria-label={t("resetPassword.title", { name: user?.name ?? "" })}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITText className="text-[12px] text-slate-600">{t("resetPassword.message")}</ITText>
          <ITInput
            name="temporaryPassword"
            type="password"
            label={t("resetPassword.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={tooShort ? t("auth:validation.passwordMin", { min: PASSWORD_MIN_LENGTH }) : undefined}
          />
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>
              {t("common:actions.cancel")}
            </ITButton>
            <ITButton
              variant="filled"
              color="primary"
              disabled={saving || password.length < PASSWORD_MIN_LENGTH}
              onClick={() => void confirm()}
            >
              {t("common:actions.save")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </div>
    </ITDialog>
  );
}
