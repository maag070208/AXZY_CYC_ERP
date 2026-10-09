import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { ImportResult, Question, QuestionInput } from "../model/types";

export const questionApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Question>("/questions/query", params),
  get: (id: string) => api.get<Question>(`/questions/${id}`),
  create: (data: QuestionInput) => api.post<Question>("/questions", data),
  update: (id: string, data: QuestionInput) => api.patch<Question>(`/questions/${id}`, data),
  deactivate: (id: string) => api.delete<Question>(`/questions/${id}`),
  reactivate: (id: string) => api.post<Question>(`/questions/${id}/reactivate`),
  /** CSV: `preview` valida sin guardar; aplicar manda la clave de idempotencia. */
  import: (file: File, preview: boolean, key?: string) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<ImportResult>(`/questions/import${preview ? "?preview=true" : ""}`, form, {
      // El cliente manda JSON por defecto: el multipart lleva su propio boundary.
      headers: { "Content-Type": "multipart/form-data", ...(key ? { "Idempotency-Key": key } : {}) },
    });
  },
};
