import { ITAlert, ITButton, ITCard, ITFlex, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { FaPaperPlane } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useForgotPassword } from "../model/useForgotPassword";

export default function ForgotPasswordForm() {
  const { t } = useTranslation(["auth"]);
  const fx = useForgotPassword();

  return (
    <ITCard className="w-full p-8 shadow-xl border border-slate-100 rounded-[24px]">
      <ITText as="h2" className="text-2xl font-bold text-slate-800 text-center">
        {t("forgot.title")}
      </ITText>
      <ITText className="text-sm text-slate-500 block text-center mt-1">{t("forgot.subtitle")}</ITText>

      {fx.sent ? (
        <div className="mt-6">
          <ITAlert variant="success">{t("forgot.sent")}</ITAlert>
        </div>
      ) : (
        <form onSubmit={fx.submit} className="mt-6" noValidate>
          <ITFlex direction="column" gap={4}>
            {fx.error && <ITAlert variant="error">{fx.error}</ITAlert>}
            <ITInput
              name="identifier"
              label={t("forgot.identifier")}
              value={fx.identifier}
              onChange={(e) => fx.setIdentifier(e.target.value)}
              autoFocus
            />
            <ITButton
              type="submit"
              variant="filled"
              color="primary"
              disabled={fx.sending || !fx.canSubmit}
              className="w-full"
            >
              <ITFlex align="center" justify="center" gap={1}>
                <FaPaperPlane size={12} />
                <ITText className="font-bold text-[11px]">{t("forgot.submit")}</ITText>
              </ITFlex>
            </ITButton>
          </ITFlex>
        </form>
      )}

      <div className="mt-5 text-center">
        <Link to="/login" className="text-xs font-semibold text-primary-600 hover:underline">
          {t("forgot.back")}
        </Link>
      </div>
    </ITCard>
  );
}
