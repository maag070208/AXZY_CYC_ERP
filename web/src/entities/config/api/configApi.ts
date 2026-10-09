import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type {
  CatalogInput,
  CatalogItem,
  CatalogResource,
  Setting,
  SettingKey,
  Term,
  TermInput,
} from "../model/types";

export const settingsApi = {
  list: () => api.get<Setting[]>("/settings"),
  /** Actualiza varios parámetros a la vez (todo o nada). */
  update: (values: Partial<Record<SettingKey, unknown>>) => api.put<Setting[]>("/settings", values),
};

/** CRUD genérico de los catálogos simples de M11. */
export const catalogApi = {
  table: (resource: CatalogResource, params: ITDataTableFetchParamsPost) =>
    tableRequest<CatalogItem>(`/${resource}/query`, params),
  options: (resource: CatalogResource, all = false) =>
    api.get<CatalogItem[]>(`/${resource}${all ? "?all=true" : ""}`),
  create: (resource: CatalogResource, data: CatalogInput) =>
    api.post<CatalogItem>(`/${resource}`, data),
  update: (resource: CatalogResource, id: string, data: CatalogInput) =>
    api.patch<CatalogItem>(`/${resource}/${id}`, data),
  /** Desactivación lógica. */
  deactivate: (resource: CatalogResource, id: string) =>
    api.delete<CatalogItem>(`/${resource}/${id}`),
};

export const termsApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Term>("/terms/query", params),
  active: () => api.get<Term | null>("/terms/active"),
  /** Todos los ciclos (selectores), del más reciente al más antiguo. */
  options: () => api.get<Term[]>("/terms"),
  create: (data: Required<TermInput>) => api.post<Term>("/terms", data),
  update: (id: string, data: TermInput) => api.patch<Term>(`/terms/${id}`, data),
  /** Activa el ciclo y desactiva el anterior. */
  activate: (id: string) => api.put<Term>(`/terms/${id}/activate`),
};
