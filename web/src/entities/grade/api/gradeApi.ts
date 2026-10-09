import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { Assessment, AssessmentInput, Gradebook, GradeInput } from "../model/types";

export const assessmentApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Assessment>("/assessments/query", params),
  create: (data: AssessmentInput) => api.post<Assessment>("/assessments", data),
  update: (id: string, data: AssessmentInput) => api.patch<Assessment>(`/assessments/${id}`, data),
  deactivate: (id: string) => api.delete<Assessment>(`/assessments/${id}`),
  /** Captura en lote (upsert por inscripción). */
  capture: (id: string, grades: GradeInput[]) => api.post<unknown[]>(`/assessments/${id}/grades`, { grades }),
};

export const gradeApi = {
  gradebook: (groupId: string) => api.get<Gradebook>(`/groups/${groupId}/gradebook`),
  /** Cierra el grupo: escribe finales, estatus y kardex. */
  close: (groupId: string) => api.post<Gradebook>(`/groups/${groupId}/close`),
  export: (groupId: string) => api.get<Blob>("/grades/export", { params: { groupId }, responseType: "blob" }),
};
