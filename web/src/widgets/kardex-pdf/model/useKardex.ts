import { useEffect, useState } from "react";
import { documentApi, type Kardex } from "@entities/document";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";

/** Kardex calculado del alumno (`GET /students/:id/kardex`). */
export const useKardex = (studentId: string) => {
  const [kardex, setKardex] = useState<Kardex | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    documentApi
      .kardex(studentId)
      .then(setKardex)
      .catch((err) => setError(errorMessage(err, i18n.t("common:errors.load"))));
  }, [studentId]);
  return { kardex, error };
};
