import { useSelector } from "react-redux";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { RootState } from "@app/store";
import { LoginForm, useLogin } from "@features/auth/login";
import { AuthLayout } from "@shared/ui/auth-layout";

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(["auth"]);
  const { token } = useSelector((s: RootState) => s.auth);
  const login = useLogin();

  if (token) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    const ok = await login.handleSubmit(e);
    if (ok) navigate("/");
  };

  return (
    <AuthLayout>
      <LoginForm
        username={login.username}
        password={login.password}
        setUsername={login.setUsername}
        setPassword={login.setPassword}
        errors={login.errors}
        deactivatedMsg={login.deactivatedMsg}
        isSubmitting={login.isSubmitting}
        canSubmit={login.canSubmit}
        toast={login.toast}
        dismissToast={login.dismissToast}
        onSubmit={handleSubmit}
      />
      <Link to="/forgot-password" className="text-xs font-semibold text-primary-600 hover:underline">
        {t("forgotLink")}
      </Link>
    </AuthLayout>
  );
}
