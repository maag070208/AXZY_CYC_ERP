import { useCallback, useState } from "react";
import type { ITDataTableFetchParams } from "@axzydev/axzy_ui_system";
import { teacherApi } from "@entities/teacher";

/** Tabla server-side de profesores (`POST /teachers/query`). */
export const useTeachersTable = () => {
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchTableData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await teacherApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    setTotal(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, []);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { total, reloadKey, fetchTableData, reload };
};

export type UseTeachersTable = ReturnType<typeof useTeachersTable>;
