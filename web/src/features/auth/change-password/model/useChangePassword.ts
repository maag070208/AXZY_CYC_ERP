import { useState } from "react";
import { useDispatch } from "react-redux";
import { authApi, meThunk, setTokens } from "@entities/user";
import type { AppDispatch } from "@app/store";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";
import { PASSWORD_MIN_LENGTH } from "@shared/lib/password";

/**
 * Cambio de contraseña propio. La API revoca todas las sesiones y devuelve
 * tokens nuevos: se guardan y se relee `/auth/me` (limpia `mustChangePassword`).
 */
export const useChangePassword = (onDone?: () => void) => {
  const dispatch = useDispatch<AppDispatch>();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);
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
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const tokens = await authApi.changePassword(current, password);
      dispatch(setTokens(tokens));
      await dispatch(meThunk());
      setCurrent("");
      setPassword("");
      setConfirm("");
      onDone?.();
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  return {
    current,
    setCurrent,
    password,
    setPassword,
    confirm,
    setConfirm,
    errors,
    saving,
    error,
    submit,
    canSubmit: !!current && !!password && !!confirm,
  };
};
