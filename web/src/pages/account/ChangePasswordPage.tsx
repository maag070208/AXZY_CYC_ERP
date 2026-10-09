import { ITAlert, ITPage } from "@axzydev/axzy_ui_system";
import { FaKey } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { RootState } from "@app/store";
import { useNotify } from "@app/toast/useNotify";
import { ChangePasswordForm } from "@features/auth/change-password";

/** `/change-password`: cambio propio; obligatorio si la contraseña es temporal. */
export default function ChangePasswordPage() {
  const { t } = useTranslation(["auth"]);
  const navigate = useNavigate();
  const notify = useNotify();
  const mustChange = useSelector((s: RootState) => !!s.auth.user?.mustChangePassword);

  return (
    <ITPage title={t("change.title")} description={t("change.subtitle")} icon={<FaKey size={20} />}>
      {mustChange && (
        <div className="mb-4 max-w-md">
          <ITAlert variant="warning">{t("change.mustChange")}</ITAlert>
        </div>
      )}
      <ChangePasswordForm
        onDone={() => {
          notify.success(t("change.done"));
          navigate("/");
        }}
      />
    </ITPage>
  );
}
