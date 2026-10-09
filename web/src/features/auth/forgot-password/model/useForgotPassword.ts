import { useState } from "react";
import { authApi } from "@entities/user";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";

/** Solicitud de enlace de recuperación. La API responde igual exista o no la cuenta. */
export const useForgotPassword = () => {
  const [identifier, setIdentifier] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setSending(true);
    setError(null);
    try {
      await authApi.forgotPassword(identifier.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.network")));
    } finally {
      setSending(false);
    }
  };

  return { identifier, setIdentifier, sending, sent, error, submit, canSubmit: !!identifier.trim() };
};
