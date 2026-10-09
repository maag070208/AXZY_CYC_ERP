import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { reportApi, type ExecutiveDashboard, type ExecutiveFilters } from "@entities/report";

/**
 * Datos del tablero de Inicio (M21 ampliado). Al cambiar un filtro la respuesta
 * anterior puede llegar después que la nueva: se descarta para no pintar
 * indicadores de otro ciclo. `loading` solo es `true` en la primera carga; los
 * cambios de filtro conservan los datos anteriores mientras llega la respuesta.
 */
export function useDashboard(filters: ExecutiveFilters) {
  const { t } = useTranslation(["common"]);
  const [data, setData] = useState<ExecutiveDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const { termId, levelId, courseId, groupId } = filters;

  useEffect(() => {
    let stale = false;
    setError(null);
    reportApi
      .dashboard({ termId, levelId, courseId, groupId })
      .then((result) => !stale && setData(result))
      .catch((err) => !stale && setError(errorMessage(err, t("errors.load"))))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [termId, levelId, courseId, groupId, attempt, t]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, error, loading, retry };
}