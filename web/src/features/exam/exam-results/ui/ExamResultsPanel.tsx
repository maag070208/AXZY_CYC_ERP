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
        <ITStatCard label={t("results.enrolledCount")} value={kpis.enrolledCount} icon={<FaUsers size={16} />} />
        <ITStatCard label={t("results.submittedCount")} value={kpis.submittedCount} icon={<FaClipboardList size={16} />} />
        <ITStatCard label={t("results.average")} value={kpis.average === null ? "—" : `${kpis.average} / ${kpis.totalPoints}`} icon={<FaStar size={16} />} />
        <ITStatCard label={t("results.passedCount")} value={kpis.passedCount} icon={<FaCheckCircle size={16} />} />
        <ITStatCard label={t("results.pending")} value={kpis.pendingReview} icon={<FaHourglassHalf size={16} />} />
      </div>
      <PanelCard>
        <div className="overflow-x-auto">
          <table data-role="exam-results" className="w-full text-left text-[12px]">
            <thead className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-3">{t("results.student")}</th>
                <th className="py-2 pr-3">{t("results.attempts")}</th>
                <th className="py-2 pr-3">{t("results.grade")}</th>
                <th className="py-2 pr-3">{t("results.result")}</th>
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
                    {r.attemptCount}
                    {r.inProgress && <span className="ml-2"><ITBadget color="warning" size="sm">{t("results.inProgress")}</ITBadget></span>}
                  </td>
                  <td className="py-2 pr-3 font-bold text-slate-700">{r.grade === null ? "—" : `${r.grade} / ${kpis.totalPoints}`}</td>
                  <td className="py-2 pr-3">
                    {r.pending > 0 ? (
                      <ITBadget color="warning" size="sm">{t("results.pending")}</ITBadget>
                    ) : r.passed === null ? (
                      <ITText className="text-slate-400">{r.attemptCount ? "—" : t("results.noAttemptsYet")}</ITText>
                    ) : (
                      <ITBadget color={r.passed ? "success" : "danger"} size="sm">{r.passed ? t("results.passed") : t("results.failed")}</ITBadget>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <ITFlex gap={1} justify="end" wrap="wrap">
                      {r.attempts.map((a) => (
                        <ITButton key={a.attemptId} variant="text" color={a.pendingCount > 0 ? "warning" : "primary"} size="sm"
                          ariaLabel={`${a.pendingCount > 0 ? t("results.reviewAction") : t("results.viewAction")} ${a.number} ${r.name}`}
                          onClick={() => setViewing(a.attemptId)}>
                          <ITText className="text-[11px] font-bold">#{a.number} {a.pendingCount > 0 ? t("results.reviewAction") : t("results.viewAction")}</ITText>
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
