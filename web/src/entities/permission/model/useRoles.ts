import { useCallback, useEffect, useState } from "react";
import { permissionApi, type RoleAdmin } from "../api/permissionApi";

/** Roles del sistema (`GET /permissions/roles`) con recarga manual. */
export const useRoles = () => {
  const [roles, setRoles] = useState<RoleAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRoles(await permissionApi.roles());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { roles, loading, error, reload };
};
