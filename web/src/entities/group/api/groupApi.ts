import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { Enrollment, Group, GroupInput } from "../model/types";

export const groupApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Group>("/groups/query", params),
  /** Grupos abiertos (activos y sin cerrar) del ciclo/curso. */
  options: (filters: { termId?: string; courseId?: string } = {}) =>
    api.get<Group[]>("/groups/options", { params: filters }),
  get: (id: string) => api.get<Group>(`/groups/${id}`),
  create: (data: GroupInput) => api.post<Group>("/groups", data),
  update: (id: string, data: GroupInput) => api.patch<Group>(`/groups/${id}`, data),
  deactivate: (id: string) => api.delete<Group>(`/groups/${id}`),
  reactivate: (id: string) => api.post<Group>(`/groups/${id}/reactivate`),
  enroll: (id: string, studentId: string) => api.post<Enrollment>(`/groups/${id}/enroll`, { studentId }),
};

export const enrollmentApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Enrollment>("/enrollments/query", params),
  /** Baja lógica de la inscripción. */
  drop: (id: string, reason?: string) => api.delete<Enrollment>(`/enrollments/${id}`, { data: reason ? { reason } : {} }),
  changeGroup: (id: string, toGroupId: string) =>
    api.post<Enrollment>(`/enrollments/${id}/change-group`, { toGroupId }),
};
