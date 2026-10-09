import { api } from "@shared/api/client";
import type { Dashboard, ReportCatalogItem, ReportFilters, ReportResult, ReportType } from "../model/types";

const clean = (filters: ReportFilters) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));

export const reportApi = {
  catalog: () => api.get<ReportCatalogItem[]>("/reports"),
  run: (type: ReportType, filters: ReportFilters) => api.get<ReportResult>(`/reports/${type}`, { params: clean(filters) }),
  /** Mismos filtros que la consulta en pantalla (M10 §4.7). */
  export: (type: ReportType, filters: ReportFilters, format: "xlsx" | "pdf") =>
    api.get<Blob>(`/reports/${type}`, { params: { ...clean(filters), format }, responseType: "blob" }),
  dashboard: () => api.get<Dashboard>("/dashboard"),
};
