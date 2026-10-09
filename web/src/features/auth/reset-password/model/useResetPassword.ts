import { useState } from "react";
import { authApi } from "@entities/user";
import { ApiError } from "@shared/api/client";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";
import { PASSWORD_MIN_LENGTH } from "@shared/lib/password";

/** Restablecimiento con el token de un solo uso que llega por correo. */
export const useResetPassword = (token: string | null) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (password.length < PASSWORD_MIN_LENGTH) {
      next.password = i18n.t("auth:validation.passwordMin", { min: PASSWORD_MIN_LENGTH });
    }
    if (confirm !== password) next.confirm = i18n.t("auth:validation.mismatch");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !validate()) return;
    setSaving(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "RESET_TOKEN_INVALID"
          ? i18n.t("auth:reset.invalidToken")
          : errorMessage(err, i18n.t("common:errors.save"))
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    password,
    setPassword,
    confirm,
    setConfirm,
    errors,
    saving,
    done,
    error,
    submit,
    canSubmit: !!password && !!confirm,
  };
};
