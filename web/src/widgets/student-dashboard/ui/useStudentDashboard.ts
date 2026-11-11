import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { reportApi, type StudentDashboard } from "@entities/report";

/**
 * Datos del Inicio del alumno. Si la cuenta no tiene expediente de alumno la
 * API responde 403 `NOT_A_STUDENT`: se expone como `notAStudent` para que la
 * pantalla caiga al resumen de sesión en vez de mostrar un error.
 */
export function useStudentDashboard() {
  const { t } = useTranslation(["common"]);
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notAStudent, setNotAStudent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    setError(null);
    reportApi
      .studentDashboard()
      .then((result) => !stale && setData(result))
      .catch((err) => {
        if (stale) return;
        // 403 NOT_A_STUDENT: no es un fallo, es que no aplica a esta cuenta.
        const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
        if (code === "NOT_A_STUDENT") setNotAStudent(true);
        else setError(errorMessage(err, t("errors.load")));
      })
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [attempt, t]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, error, loading, notAStudent, retry };
}
