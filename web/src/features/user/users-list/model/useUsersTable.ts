import { useCallback, useState } from "react";
import type { ITDataTableFetchParams } from "@axzydev/axzy_ui_system";
import { usersApi } from "@entities/user";

/**
 * Estado y fetch server-side de la lista de usuarios. El contrato de
 * `ITDataTable` (`{ page, limit, filters, sort }`) se pasa tal cual a
 * `usersApi.table` (`POST /users/query`).
 */
export const useUsersTable = () => {
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);

  const fetchTableData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await usersApi.table({
      page: params.page,
      limit: params.limit,
      filters: params.filters,
      sort: params.sort,
    });
    setTotal(res.total);
    return {
      data: res.data as unknown as Record<string, unknown>[],
      total: res.total,
    };
  }, []);

  return {
    total,
    reloadKey,
    toast,
    setToast,
    fetchTableData,
    reload: () => setReloadKey((k) => k + 1),
  };
};

export type UseUsersTable = ReturnType<typeof useUsersTable>;
