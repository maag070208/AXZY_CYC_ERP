import { useCallback, useEffect, useState } from "react";
import { studentApi, type StudentMovement } from "@entities/student";
import { errorMessage } from "@app/toast/useNotify";
import { i18n } from "@shared/i18n";

/** Historial de movimientos de un alumno (`students.movements`). */
export const useMovements = (studentId: string, reloadKey = 0) => {
  const [movements, setMovements] = useState<StudentMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMovements(await studentApi.movements(studentId));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.load")));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  return { movements, loading, error };
};
