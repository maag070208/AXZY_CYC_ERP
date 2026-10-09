import { useCallback, useEffect, useState } from "react";
import type { ITDataTableFetchParams } from "@axzydev/axzy_ui_system";
import { groupApi } from "@entities/group";
import { termsApi, type Term } from "@entities/config";
import { useCan } from "@entities/user";

/** Tabla server-side de grupos (`POST /groups/query`) + ciclos para el filtro. */
export const useGroupsTable = () => {
  const canTerms = useCan("terms.view");
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [terms, setTerms] = useState<Term[]>([]);

  useEffect(() => {
    if (canTerms) termsApi.options().then(setTerms).catch(() => setTerms([]));
  }, [canTerms]);

  const fetchTableData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await groupApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    setTotal(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, []);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { total, reloadKey, terms, fetchTableData, reload };
};

export type UseGroupsTable = ReturnType<typeof useGroupsTable>;
