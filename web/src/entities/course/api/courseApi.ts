import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { Course, CourseInput, CourseOption } from "../model/types";

export const courseApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Course>("/courses/query", params),
  options: () => api.get<CourseOption[]>("/courses/options"),
  get: (id: string) => api.get<Course>(`/courses/${id}`),
  create: (data: CourseInput) => api.post<Course>("/courses", data),
  update: (id: string, data: CourseInput) => api.patch<Course>(`/courses/${id}`, data),
  /** Baja lógica: los grupos siguen, pero no se abren nuevos. */
  deactivate: (id: string) => api.delete<Course>(`/courses/${id}`),
  reactivate: (id: string) => api.post<Course>(`/courses/${id}/reactivate`),
};
