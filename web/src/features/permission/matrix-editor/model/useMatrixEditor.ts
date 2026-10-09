import { useCallback, useEffect, useMemo, useState } from "react";
import type { Scope } from "@entities/user";
import { permissionApi, type MatrixChange, type PermissionAdminData } from "@entities/permission";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";

const cellKey = (roleKey: string, permissionKey: string) => `${roleKey}|${permissionKey}`;

/**
 * Matriz rol → permiso → alcance con edición en borrador: los cambios se
 * acumulan y se guardan en un solo `PUT /permissions/matrix`.
 */
export const useMatrixEditor = (onSaved?: (count: number) => void) => {
  const [data, setData] = useState<PermissionAdminData | null>(null);
  const [draft, setDraft] = useState<Map<string, Scope>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await permissionApi.admin());
      setDraft(new Map());
      setError(null);
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.load")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saved = useMemo(() => {
    const map = new Map<string, Scope>();
    for (const cell of data?.matrix ?? []) map.set(cellKey(cell.roleKey, cell.permissionKey), cell.scope);
    return map;
  }, [data]);

  const scopeOf = (roleKey: string, permissionKey: string): Scope => {
    const key = cellKey(roleKey, permissionKey);
    return draft.get(key) ?? saved.get(key) ?? "NONE";
  };

  const isDirty = (roleKey: string, permissionKey: string): boolean =>
    draft.has(cellKey(roleKey, permissionKey));

  const setScope = (roleKey: string, permissionKey: string, scope: Scope) => {
    const key = cellKey(roleKey, permissionKey);
    setDraft((prev) => {
      const next = new Map(prev);
      if ((saved.get(key) ?? "NONE") === scope) next.delete(key);
      else next.set(key, scope);
      return next;
    });
  };

  const save = async () => {
    const changes: MatrixChange[] = [...draft.entries()].map(([key, scope]) => {
      const [roleKey, permissionKey] = key.split("|");
      return { roleKey, permissionKey, scope };
    });
    if (changes.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const result = await permissionApi.saveMatrix(changes);
      await load();
      onSaved?.(result.updated);
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  return {
    data,
    loading,
    saving,
    error,
    pending: draft.size,
    scopeOf,
    isDirty,
    setScope,
    save,
    discard: () => setDraft(new Map()),
    reload: load,
  };
};
