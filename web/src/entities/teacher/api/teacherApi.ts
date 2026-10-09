import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { Teacher, TeacherInput } from "../model/types";

export const teacherApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Teacher>("/teachers/query", params),
  get: (id: string) => api.get<Teacher>(`/teachers/${id}`),
  /** Crea profesor + cuenta PROFESOR y encola la invitación. */
  create: (data: TeacherInput) => api.post<Teacher & { invitationQueued: boolean }>("/teachers", data),
  update: (id: string, data: TeacherInput) => api.patch<Teacher>(`/teachers/${id}`, data),
  deactivate: (id: string, reason?: string) =>
    api.post<Teacher>(`/teachers/${id}/deactivate`, reason ? { reason } : {}),
  reactivate: (id: string) => api.post<Teacher>(`/teachers/${id}/reactivate`),
  resendInvitation: (id: string) => api.post<{ ok: true }>(`/teachers/${id}/resend-invitation`),
};
