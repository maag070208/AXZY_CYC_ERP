import { useCallback, useEffect, useState } from "react";
import { permissionApi, type Policy, type PolicyAction } from "@entities/permission";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";

/** Políticas ABAC y el registro de acciones que las admiten. */
export const usePolicies = () => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [actions, setActions] = useState<PolicyAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, registry] = await Promise.all([permissionApi.policies(), permissionApi.policyActions()]);
      setPolicies(list);
      setActions(registry);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.load")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { policies, actions, loading, error, reload };
};
