import { useCallback, useState } from "react";
import type { ITDataTableFetchParams } from "@axzydev/axzy_ui_system";
import { catalogApi, type CatalogResource } from "@entities/config";

/** Tabla server-side de un catálogo simple (`POST /<recurso>/query`). */
export const useCatalogTable = (resource: CatalogResource) => {
  const [reloadKey, setReloadKey] = useState(0);
  const fetchData = useCallback(
    async (params: ITDataTableFetchParams) => {
      const res = await catalogApi.table(resource, {
        page: params.page,
        limit: params.limit,
        filters: params.filters,
        sort: params.sort,
      });
      return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
    },
    [resource]
  );
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { reloadKey, fetchData, reload };
};
