import {
  ITAlert,
  ITButton,
  ITCard,
  ITFlex,
  ITInput,
  ITStack,
  ITText,
  ITToast,
} from "@axzydev/axzy_ui_system";
import { FaSignInAlt } from "react-icons/fa";
import { useTranslation } from "react-i18next";

interface LoginFormProps {
  username: string;
  password: string;
  setUsername: React.Dispatch<React.SetStateAction<string>>;
  setPassword: React.Dispatch<React.SetStateAction<string>>;
  errors: { username?: string; password?: string };
  deactivatedMsg?: string | null;
  isSubmitting: boolean;
  canSubmit: boolean;
  toast: { message: string; type: "error" | "success" } | null;
  dismissToast: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function LoginForm({
  username,
  password,
  setUsername,
  setPassword,
  errors,
  deactivatedMsg,
  isSubmitting,
  canSubmit,
  toast,
  dismissToast,
  onSubmit,
}: LoginFormProps) {
  const { t: tt } = useTranslation(["auth"]);
  return (
    <>
      <ITCard className="w-full p-8 shadow-xl border border-slate-100 rounded-[24px]">
        <ITStack>
          <ITText as="h2" className="text-2xl font-bold text-slate-800 text-center">
            {tt("login.title")}
          </ITText>
          <ITText className="text-sm text-slate-500 block text-center mt-1">
            {tt("login.subtitle")}
          </ITText>
        </ITStack>

        {deactivatedMsg && (
          <div className="mt-4">
            <ITAlert variant="warning">{deactivatedMsg}</ITAlert>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4 mt-6" noValidate>
          <ITFlex direction="column" gap={4}>
            <div>
              <ITInput
                name="username"
                label={tt("login.userLabel")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                aria-invalid={!!errors.username}
              />
              {errors.username && (
                <span role="alert" className="text-red-500 text-xs mt-1 block">
                  {errors.username}
                </span>
              )}
            </div>
            <div>
              <ITInput
                name="password"
                type="password"
                label={tt("login.passwordLabel")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                aria-invalid={!!errors.password}
              />
              {errors.password && (
                <span role="alert" className="text-red-500 text-xs mt-1 block">
                  {errors.password}
                </span>
              )}
            </div>
          </ITFlex>

          <ITButton
            type="submit"
            variant="filled"
            color="primary"
            disabled={isSubmitting || !canSubmit}
            className="w-full flex items-center justify-center gap-2"
          >
            <ITFlex align="center" gap={1}>
              <FaSignInAlt size={14} />
              <ITText className="font-bold text-[11px]">
                {isSubmitting ? tt("login.submitting") : tt("login.submit")}
              </ITText>
            </ITFlex>
          </ITButton>
        </form>
      </ITCard>

      {toast && (
        <ITToast
          message={toast.message}
          type={toast.type}
          position="bottom-center"
          duration={2500}
          onClose={dismissToast}
        />
      )}
    </>
  );
}
