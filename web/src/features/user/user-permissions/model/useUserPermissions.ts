import { useCallback, useEffect, useState } from "react";
import { usersApi, type Scope, type User, type UserPermissionsView } from "@entities/user";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";

/** Roles, excepciones y permisos efectivos de una persona (`users.permissions`). */
export const useUserPermissions = (user: User | null) => {
  const [view, setView] = useState<UserPermissionsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setView(await usersApi.permissions(user.id));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.load")));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setView(null);
    void load();
  }, [load]);

  const run = async (permission: string, call: () => Promise<UserPermissionsView>): Promise<boolean> => {
    setBusy(permission);
    setError(null);
    try {
      setView(await call());
      return true;
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.save")));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const setException = (permission: string, scope: Scope, reason?: string) =>
    user
      ? run(permission, () =>
          usersApi.setPermissions(user.id, { exception: { permission, scope, ...(reason ? { reason } : {}) } })
        )
      : Promise.resolve(false);

  const removeException = (permission: string) =>
    user ? run(permission, () => usersApi.removeException(user.id, permission)) : Promise.resolve(false);

  return { view, loading, busy, error, setException, removeException };
};
