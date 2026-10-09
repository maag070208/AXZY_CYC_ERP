import { ITAlert, ITButton, ITFlex, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { FaKey } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useChangePassword } from "../model/useChangePassword";

interface Props {
  onDone?: () => void;
}

export default function ChangePasswordForm({ onDone }: Props) {
  const { t } = useTranslation(["auth"]);
  const fx = useChangePassword(onDone);

  return (
    <form onSubmit={fx.submit} noValidate className="max-w-md">
      <ITFlex direction="column" gap={4}>
        {fx.error && <ITAlert variant="error">{fx.error}</ITAlert>}
        <ITInput
          name="currentPassword"
          type="password"
          label={t("change.current")}
          value={fx.current}
          onChange={(e) => fx.setCurrent(e.target.value)}
          autoFocus
        />
        <ITInput
          name="newPassword"
          type="password"
          label={t("change.password")}
          value={fx.password}
          onChange={(e) => fx.setPassword(e.target.value)}
          error={fx.errors.password}
        />
        <ITInput
          name="confirmPassword"
          type="password"
          label={t("change.confirm")}
          value={fx.confirm}
          onChange={(e) => fx.setConfirm(e.target.value)}
          error={fx.errors.confirm}
        />
        <ITButton type="submit" variant="filled" color="primary" disabled={fx.saving || !fx.canSubmit}>
          <ITFlex align="center" justify="center" gap={1}>
            <FaKey size={12} />
            <ITText className="font-bold text-[11px]">{t("change.submit")}</ITText>
          </ITFlex>
        </ITButton>
      </ITFlex>
    </form>
  );
}
