import { useSearchParams } from "react-router-dom";
import { AuthLayout } from "@shared/ui/auth-layout";
import { ResetPasswordForm } from "@features/auth/reset-password";

/** `/reset-password?token=…`: enlace de un solo uso que llega por correo. */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  return (
    <AuthLayout>
      <ResetPasswordForm token={params.get("token")} />
    </AuthLayout>
  );
}
