import { useCallback, useEffect, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITFlex, ITStatCard, ITText } from "@axzydev/axzy_ui_system";
import { FaCheckCircle, FaClipboardList, FaHourglassHalf, FaStar, FaUsers } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { onlineExamApi, type ExamResults } from "@entities/online-exam";
import { PanelCard } from "@shared/ui/panel-card";
import AttemptReviewDialog from "./AttemptReviewDialog";

interface Props {
  examId: string;
  canReview: boolean;
  reloadKey: number;
}

/** Resultados del examen por alumno con KPIs y acceso a cada intento (M17). */
export default function ExamResultsPanel({ examId, canReview, reloadKey }: Props) {
  const { t } = useTranslation(["exams", "common"]);
  const [results, setResults] = useState<ExamResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(() => {
    onlineExamApi.results(examId).then((r) => { setResults(r); setError(null); }).catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [examId, t]);
  useEffect(load, [load, reloadKey, tick]);

  if (error) return <ITAlert variant="error">{error}</ITAlert>;
  if (!results) return null;
  const { kpis } = results;
  return (
    <ITFlex direction="column" gap={4}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <ITStatCard label={t("results.inscritos")} value={kpis.inscritos} icon={<FaUsers size={16} />} />
        <ITStatCard label={t("results.presentaron")} value={kpis.presentaron} icon={<FaClipboardList size={16} />} />
        <ITStatCard label={t("results.promedio")} value={kpis.promedio === null ? "—" : `${kpis.promedio} / ${kpis.totalPuntos}`} icon={<FaStar size={16} />} />
        <ITStatCard label={t("results.aprobados")} value={kpis.aprobados} icon={<FaCheckCircle size={16} />} />
        <ITStatCard label={t("results.pendientes")} value={kpis.pendientesRevision} icon={<FaHourglassHalf size={16} />} />
      </div>
      <PanelCard>
        <div className="overflow-x-auto">
          <table data-role="exam-results" className="w-full text-left text-[12px]">
            <thead className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-3">{t("results.alumno")}</th>
                <th className="py-2 pr-3">{t("results.intentos")}</th>
                <th className="py-2 pr-3">{t("results.calificacion")}</th>
                <th className="py-2 pr-3">{t("results.resultado")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.rows.map((r) => (
                <tr key={r.enrollmentId}>
                  <td className="py-2 pr-3">
                    <ITText className="block font-bold text-slate-700">{r.name}</ITText>
                    <ITText className="text-[10px] text-slate-400">{r.studentNumber}</ITText>
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {r.intentos}
                    {r.enCurso && <span className="ml-2"><ITBadget color="warning" size="sm">{t("results.enCurso")}</ITBadget></span>}
                  </td>
                  <td className="py-2 pr-3 font-bold text-slate-700">{r.calificacion === null ? "—" : `${r.calificacion} / ${kpis.totalPuntos}`}</td>
                  <td className="py-2 pr-3">
                    {r.pendientes > 0 ? (
                      <ITBadget color="warning" size="sm">{t("results.pendientes")}</ITBadget>
                    ) : r.aprobado === null ? (
                      <ITText className="text-slate-400">{r.intentos ? "—" : t("results.sinIntentos")}</ITText>
                    ) : (
                      <ITBadget color={r.aprobado ? "success" : "danger"} size="sm">{r.aprobado ? t("results.aprobado") : t("results.reprobado")}</ITBadget>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <ITFlex gap={1} justify="end" wrap="wrap">
                      {r.attempts.map((a) => (
                        <ITButton key={a.attemptId} variant="text" color={a.pendingCount > 0 ? "warning" : "primary"} size="sm"
                          ariaLabel={`${a.pendingCount > 0 ? t("results.revisar") : t("results.ver")} ${a.number} ${r.name}`}
                          onClick={() => setViewing(a.attemptId)}>
                          <ITText className="text-[11px] font-bold">#{a.number} {a.pendingCount > 0 ? t("results.revisar") : t("results.ver")}</ITText>
                        </ITButton>
                      ))}
                    </ITFlex>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>
      <AttemptReviewDialog attemptId={viewing} canReview={canReview} onClose={() => setViewing(null)} onChanged={() => setTick((n) => n + 1)} />
    </ITFlex>
  );
}
