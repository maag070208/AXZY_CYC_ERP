import { useCallback, useEffect, useState } from "react";
import { saveAs } from "file-saver";
import { documentApi, type StudentDocument, type StudentDocuments } from "@entities/document";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";

/** Expediente de un alumno: lista, subida, revisión, descarga y baja lógica. */
export const useDocuments = (studentId: string) => {
  const [data, setData] = useState<StudentDocuments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await documentApi.list(studentId));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.load")));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File, documentTypeId: string, notas?: string) => {
    await documentApi.upload(studentId, file, documentTypeId, notas);
    await load();
  };

  const review = async (doc: StudentDocument, status: "VALIDADO" | "RECHAZADO", notas?: string) => {
    await documentApi.validate(doc.id, status, notas);
    await load();
  };

  const remove = async (doc: StudentDocument) => {
    await documentApi.remove(doc.id);
    await load();
  };

  const download = async (doc: StudentDocument) => {
    saveAs(await documentApi.download(doc.id), doc.originalName);
  };

  return { data, loading, error, reload: load, upload, review, remove, download };
};
