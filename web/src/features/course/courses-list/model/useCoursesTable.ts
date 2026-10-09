import { useCallback, useState } from "react";
import type { ITDataTableFetchParams } from "@axzydev/axzy_ui_system";
import { courseApi } from "@entities/course";

/** Tabla server-side de cursos (`POST /courses/query`). */
export const useCoursesTable = () => {
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchTableData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await courseApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    setTotal(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, []);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { total, reloadKey, fetchTableData, reload };
};

export type UseCoursesTable = ReturnType<typeof useCoursesTable>;
