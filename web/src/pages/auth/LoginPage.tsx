import { ITFlex, ITText } from "@axzydev/axzy_ui_system";
import { useSelector } from "react-redux";
import { Navigate, useNavigate } from "react-router-dom";
import type { RootState } from "@app/store";
import { LoginForm, useLogin } from "@features/auth/login";
import { LottieLoader } from "@shared/ui/lottie-loader";

export default function LoginPage() {
  const navigate = useNavigate();
  const { token } = useSelector((s: RootState) => s.auth);
  const login = useLogin();

  if (token) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    const ok = await login.handleSubmit(e);
    if (ok) navigate("/");
  };

  return (
    <ITFlex
      as="div"
      align="center"
      justify="center"
      grow
      className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4"
    >
      <ITFlex direction="column" align="center" gap={6} className="w-full max-w-md">
        <LottieLoader animation="logo" size={150} />

        <ITText as="h1" className="text-center text-lg font-semibold text-slate-700">
          Sistema de Gestión Escolar
        </ITText>

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
      </ITFlex>

      <ITText as="p" className="absolute bottom-4 text-xs font-medium text-slate-400">
        v{__APP_VERSION__}
      </ITText>
    </ITFlex>
  );
}
