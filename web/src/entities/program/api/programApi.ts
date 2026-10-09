import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { Program, ProgramDetail, ProgramInput, ProgramSubjectInput } from "../model/types";

export const programApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Program>("/programs/query", params),
  get: (id: string) => api.get<ProgramDetail>(`/programs/${id}`),
  create: (data: ProgramInput) => api.post<ProgramDetail>("/programs", data),
  update: (id: string, data: ProgramInput) => api.patch<ProgramDetail>(`/programs/${id}`, data),
  setSubjects: (id: string, subjects: ProgramSubjectInput[]) => api.put<ProgramDetail>(`/programs/${id}/subjects`, { subjects }),
  deactivate: (id: string) => api.delete<ProgramDetail>(`/programs/${id}`),
  reactivate: (id: string) => api.post<ProgramDetail>(`/programs/${id}/reactivate`),
};
