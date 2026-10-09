import { AuthLayout } from "@shared/ui/auth-layout";
import { ForgotPasswordForm } from "@features/auth/forgot-password";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
