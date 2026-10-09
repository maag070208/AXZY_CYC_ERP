import { api } from "@shared/api/client";
import type { Kardex, StudentDocument, StudentDocuments } from "../model/types";

export const documentApi = {
  list: (studentId: string) => api.get<StudentDocuments>(`/students/${studentId}/documents`),
  upload: (studentId: string, file: File, documentTypeId: string, notes?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("documentTypeId", documentTypeId);
    if (notes) form.append("notes", notes);
    // Sin Content-Type explícito: el navegador pone el boundary del multipart.
    return api.post<StudentDocument>(`/students/${studentId}/documents`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  /** Descarga autorizada (el archivo nunca tiene URL pública). */
  download: (id: string) => api.get<Blob>(`/documents/${id}/download`, { responseType: "blob" }),
  validate: (id: string, status: "VALIDATED" | "REJECTED", notes?: string) =>
    api.patch<StudentDocument>(`/documents/${id}/validate`, { status, ...(notes ? { notes } : {}) }),
  remove: (id: string) => api.delete<void>(`/documents/${id}`),
  kardex: (studentId: string) => api.get<Kardex>(`/students/${studentId}/kardex`),
};
