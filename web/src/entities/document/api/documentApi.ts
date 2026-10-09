import { api } from "@shared/api/client";
import type { Kardex, StudentDocument, StudentDocuments } from "../model/types";

export const documentApi = {
  list: (studentId: string) => api.get<StudentDocuments>(`/students/${studentId}/documents`),
  upload: (studentId: string, file: File, documentTypeId: string, notas?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("documentTypeId", documentTypeId);
    if (notas) form.append("notas", notas);
    // Sin Content-Type explícito: el navegador pone el boundary del multipart.
    return api.post<StudentDocument>(`/students/${studentId}/documents`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  /** Descarga autorizada (el archivo nunca tiene URL pública). */
  download: (id: string) => api.get<Blob>(`/documents/${id}/download`, { responseType: "blob" }),
  validate: (id: string, status: "VALIDADO" | "RECHAZADO", notas?: string) =>
    api.patch<StudentDocument>(`/documents/${id}/validate`, { status, ...(notas ? { notas } : {}) }),
  remove: (id: string) => api.delete<void>(`/documents/${id}`),
  kardex: (studentId: string) => api.get<Kardex>(`/students/${studentId}/kardex`),
};
