import { api } from "@shared/api/client";
import type { ExecutiveDashboard, ExecutiveFilters, ReportCatalogItem, ReportFilters, ReportResult, ReportType } from "../model/types";

const clean = (filters: ReportFilters) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));

export const reportApi = {
  catalog: () => api.get<ReportCatalogItem[]>("/reports"),
  run: (type: ReportType, filters: ReportFilters) => api.get<ReportResult>(`/reports/${type}`, { params: clean(filters) }),
  /** Mismos filtros que la consulta en pantalla (M10 §4.7). */
  export: (type: ReportType, filters: ReportFilters, format: "xlsx" | "pdf") =>
    api.get<Blob>(`/reports/${type}`, { params: { ...clean(filters), format }, responseType: "blob" }),
  /**
   * Tablero de Inicio (M21 ampliado): indicadores del ciclo frente al anterior,
   * gastos, cartera, alertas y detalle operativo, con el alcance de la persona.
   */
  dashboard: (filters: ExecutiveFilters) => api.get<ExecutiveDashboard>("/dashboard/executive", { params: clean(filters) }),
};
