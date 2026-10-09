import { useCallback, useEffect, useRef, useState } from "react";
import type { ITDataTableFetchParams } from "@axzydev/axzy_ui_system";
import { saveAs } from "file-saver";
import { studentApi, type StudentSummary } from "@entities/student";

/**
 * Tabla server-side de alumnos (`POST /students/query`) + KPIs y exportación
 * con los mismos filtros que la persona tiene aplicados.
 */
export const useStudentsTable = () => {
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [summary, setSummary] = useState<StudentSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const lastParams = useRef<Pick<ITDataTableFetchParams, "filters" | "sort">>({ filters: {} });

  useEffect(() => {
    studentApi.summary().then(setSummary).catch(() => setSummary(null));
  }, [reloadKey]);

  const fetchTableData = useCallback(async (params: ITDataTableFetchParams) => {
    lastParams.current = { filters: params.filters, sort: params.sort };
    const res = await studentApi.table({
      page: params.page,
      limit: params.limit,
      filters: params.filters,
      sort: params.sort,
    });
    setTotal(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, []);

  const exportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const blob = await studentApi.export(lastParams.current);
      saveAs(blob, `alumnos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { total, summary, reloadKey, exporting, fetchTableData, exportExcel, reload };
};

export type UseStudentsTable = ReturnType<typeof useStudentsTable>;
