import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type { AnswerValue, Attempt, AvailableExam, ExamResults, OnlineExam, OnlineExamDetail, OnlineExamInput } from "../model/types";

export const onlineExamApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<OnlineExam>("/online-exams/query", params),
  get: (id: string) => api.get<OnlineExamDetail>(`/online-exams/${id}`),
  create: (data: OnlineExamInput) => api.post<OnlineExamDetail>("/online-exams", data),
  update: (id: string, data: OnlineExamInput) => api.patch<OnlineExamDetail>(`/online-exams/${id}`, data),
  remove: (id: string) => api.delete<void>(`/online-exams/${id}`),
  setQuestions: (id: string, questions: Array<{ questionId: string; puntos?: number }>) =>
    api.post<OnlineExamDetail>(`/online-exams/${id}/questions`, { questions }),
  publish: (id: string) => api.post<OnlineExamDetail>(`/online-exams/${id}/publish`),
  close: (id: string) => api.post<OnlineExamDetail>(`/online-exams/${id}/close`),
  results: (id: string) => api.get<ExamResults>(`/online-exams/${id}/results`),
  // --- alumno ---
  available: () => api.get<AvailableExam[]>("/online-exams/available"),
  start: (id: string) => api.post<Attempt>(`/online-exams/${id}/start`),
};

export const attemptApi = {
  get: (id: string) => api.get<Attempt>(`/attempts/${id}`),
  save: (id: string, answers: Array<{ questionId: string; respuesta: AnswerValue }>) =>
    api.put<{ saved: number; savedAt: string; remainingSeconds: number }>(`/attempts/${id}/answers`, { answers }),
  submit: (id: string, answers?: Array<{ questionId: string; respuesta: AnswerValue }>) =>
    api.post<Attempt>(`/attempts/${id}/submit`, answers?.length ? { answers } : {}),
  event: (id: string, type: "TAB_BLUR" | "TAB_FOCUS") => api.post<{ focusLosses: number }>(`/attempts/${id}/events`, { type }),
  review: (id: string, data: { questionId: string; puntosObtenidos: number; comentario?: string }) =>
    api.patch<{ attemptId: string; score: number; pendingCount: number; grade: { score: number } | null }>(`/attempts/${id}/review`, data),
  regrade: (id: string) => api.post<{ attemptId: string; score: number; pendingCount: number }>(`/attempts/${id}/regrade`),
};
