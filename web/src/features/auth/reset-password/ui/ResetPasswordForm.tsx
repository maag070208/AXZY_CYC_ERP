import { ITAlert, ITButton, ITCard, ITFlex, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { FaKey } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useResetPassword } from "../model/useResetPassword";

interface Props {
  token: string | null;
}

export default function ResetPasswordForm({ token }: Props) {
  const { t } = useTranslation(["auth"]);
  const fx = useResetPassword(token);

  return (
    <ITCard className="w-full p-8 shadow-xl border border-slate-100 rounded-[24px]">
      <ITText as="h2" className="text-2xl font-bold text-slate-800 text-center">
        {t("reset.title")}
      </ITText>
      <ITText className="text-sm text-slate-500 block text-center mt-1">{t("reset.subtitle")}</ITText>

      <div className="mt-6">
        {!token ? (
          <ITAlert variant="error">{t("reset.missingToken")}</ITAlert>
        ) : fx.done ? (
          <ITAlert variant="success">{t("reset.done")}</ITAlert>
        ) : (
          <form onSubmit={fx.submit} noValidate>
            <ITFlex direction="column" gap={4}>
              {fx.error && <ITAlert variant="error">{fx.error}</ITAlert>}
              <ITInput
                name="password"
                type="password"
                label={t("reset.password")}
                value={fx.password}
                onChange={(e) => fx.setPassword(e.target.value)}
                error={fx.errors.password}
                autoFocus
              />
              <ITInput
                name="confirm"
                type="password"
                label={t("reset.confirm")}
                value={fx.confirm}
                onChange={(e) => fx.setConfirm(e.target.value)}
                error={fx.errors.confirm}
              />
              <ITButton
                type="submit"
                variant="filled"
                color="primary"
                disabled={fx.saving || !fx.canSubmit}
                className="w-full"
              >
                <ITFlex align="center" justify="center" gap={1}>
                  <FaKey size={12} />
                  <ITText className="font-bold text-[11px]">{t("reset.submit")}</ITText>
                </ITFlex>
              </ITButton>
            </ITFlex>
          </form>
        )}
      </div>

      <ITFlex justify="center" gap={4} className="mt-5">
        <Link to="/login" className="text-xs font-semibold text-primary-600 hover:underline">
          {t("reset.goLogin")}
        </Link>
        {(!token || fx.error) && (
          <Link to="/forgot-password" className="text-xs font-semibold text-primary-600 hover:underline">
            {t("reset.requestNew")}
          </Link>
        )}
      </ITFlex>
    </ITCard>
  );
}
