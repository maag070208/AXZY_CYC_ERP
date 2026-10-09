import { ITAlert, ITCard, ITText } from "@axzydev/axzy_ui_system";
import { FaKey } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import type { RootState } from "@app/store";
import { useNotify } from "@app/toast/useNotify";
import { ChangePasswordForm } from "@features/auth/change-password";
import { AuthLayout } from "@shared/ui/auth-layout";

/**
 * `/change-password`: pantalla dedicada a pantalla completa (sin `ITLayout`).
 * Obligatoria cuando la contraseña es temporal; voluntaria desde «Mi cuenta».
 */
export default function ChangePasswordPage() {
  const { t } = useTranslation(["auth", "common"]);
  const navigate = useNavigate();
  const notify = useNotify();
  const mustChange = useSelector((s: RootState) => !!s.auth.user?.mustChangePassword);

  return (
    <AuthLayout>
      <ITCard className="w-full p-8 shadow-xl border border-slate-100 rounded-[24px]">
        <div className="text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
            <FaKey size={20} />
          </span>
          <ITText as="h2" className="text-2xl font-bold text-slate-800">
            {t("change.title")}
          </ITText>
          <ITText className="mt-1 block text-sm text-slate-500">{t("change.subtitle")}</ITText>
        </div>

        {mustChange && (
          <div className="mt-4">
            <ITAlert variant="warning">{t("change.mustChange")}</ITAlert>
          </div>
        )}

        <div className="mt-6">
          <ChangePasswordForm
            onDone={() => {
              notify.success(t("change.done"));
              navigate("/");
            }}
          />
        </div>

        {!mustChange && (
          <div className="mt-5 text-center">
            <Link to="/" className="text-xs font-semibold text-primary-600 hover:underline">
              {t("common:actions.back")}
            </Link>
          </div>
        )}
      </ITCard>
    </AuthLayout>
  );
}
