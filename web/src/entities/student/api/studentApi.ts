import { api } from "@shared/api/client";
import { serializeTableFilters, tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type {
  MovementInput,
  MovementResult,
  Student,
  StudentInput,
  StudentMovement,
  StudentSummary,
} from "../model/types";

export const studentApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Student>("/students/query", params),
  summary: () => api.get<StudentSummary>("/students/summary"),
  get: (id: string) => api.get<Student>(`/students/${id}`),
  create: (data: StudentInput) => api.post<Student>("/students", data),
  update: (id: string, data: StudentInput) => api.patch<Student>(`/students/${id}`, data),
  /** Excel con los filtros vigentes de la tabla. */
  export: (params: Pick<ITDataTableFetchParamsPost, "filters" | "sort">) =>
    api.post<Blob>(
      "/students/export",
      { filters: serializeTableFilters(params.filters), sort: params.sort },
      { responseType: "blob" }
    ),
  // --- M05 ---
  baja: (id: string, data: MovementInput) => api.post<MovementResult>(`/students/${id}/baja`, data),
  reingreso: (id: string, data: MovementInput) => api.post<MovementResult>(`/students/${id}/reingreso`, data),
  movements: (id: string) => api.get<StudentMovement[]>(`/students/${id}/movements`),
};
