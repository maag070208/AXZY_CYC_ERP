import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type {
  AttendanceRoll,
  AttendanceSession,
  GroupAttendanceSummary,
  Justification,
  RollCallItem,
  SessionInput,
  StudentAttendance,
} from "../model/types";

export const attendanceApi = {
  listSessions: (groupId: string) => api.get<AttendanceSession[]>(`/groups/${groupId}/sessions`),
  createSession: (groupId: string, data: SessionInput) => api.post<AttendanceSession>(`/groups/${groupId}/sessions`, data),
  summary: (groupId: string) => api.get<GroupAttendanceSummary>(`/groups/${groupId}/attendance-summary`),
  getRoll: (sessionId: string) => api.get<AttendanceRoll>(`/attendance-sessions/${sessionId}`),
  saveRoll: (sessionId: string, items: RollCallItem[]) =>
    api.put<{ sessionId: string; saved: number; skipped: number }>(`/attendance-sessions/${sessionId}/attendance`, { items }),
  annul: (sessionId: string, reason: string) =>
    api.delete<AttendanceSession>(`/attendance-sessions/${sessionId}`, { data: { reason } }),
  student: (studentId: string) => api.get<StudentAttendance>(`/students/${studentId}/attendance`),
};

export const justificationApi = {
  /** Alta multipart: `attendanceId` + `motivo` y, opcionalmente, el archivo. */
  create: (attendanceId: string, reason: string, file?: File) => {
    const form = new FormData();
    form.append("attendanceId", attendanceId);
    form.append("reason", reason);
    if (file) form.append("file", file);
    return api.post<Justification>("/justifications", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  table: (params: ITDataTableFetchParamsPost) => tableRequest<Justification>("/justifications/query", params),
  resolve: (id: string, data: { status: "APPROVED" | "REJECTED"; note?: string | null }) =>
    api.patch<Justification>(`/justifications/${id}/resolve`, data),
  /** Descarga autorizada (el archivo nunca tiene URL pública). */
  file: (id: string) => api.get<Blob>(`/justifications/${id}/file`, { responseType: "blob" }),
};
