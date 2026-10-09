import { useEffect, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITEmptyState, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaFileSignature, FaPlay } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { onlineExamApi, type AvailableExam } from "@entities/online-exam";
import { formatInstant } from "@shared/lib/day";
import { PanelCard } from "@shared/ui/panel-card";

const STATE_COLORS = { OPEN: "success", NOT_OPEN: "primary", CLOSED: "secondary", NOT_PUBLISHED: "secondary" } as const;

/** `/my-exams` (M16): exámenes en línea de los grupos del alumno. */
export default function MyExamsPage() {
  const { t, i18n } = useTranslation(["exams", "common"]);
  const navigate = useNavigate();
  const notify = useNotify();
  const [exams, setExams] = useState<AvailableExam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    onlineExamApi.available().then(setExams).catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [t]);

  const start = async (exam: AvailableExam) => {
    if (exam.inProgressAttemptId) {
      navigate(`/exam/${exam.inProgressAttemptId}`);
      return;
    }
    setStarting(exam.examId);
    try {
      const attempt = await onlineExamApi.start(exam.examId);
      navigate(`/exam/${attempt.attemptId}`);
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
      setStarting(null);
    }
  };

  const date = (iso: string) => formatInstant(iso, i18n.language);
  return (
    <ITPage title={t("my.title")} description={t("my.description")} icon={<FaFileSignature size={20} />} loading={!exams && !error} error={error}>
      {exams && exams.length === 0 && <ITEmptyState title={t("my.empty")} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {exams?.map((exam) => (
          <PanelCard key={exam.examId} title={exam.titulo}>
            <article aria-label={exam.titulo}>
            <ITFlex direction="column" gap={2}>
              <ITText className="text-[12px] text-slate-500">{exam.curso} · {exam.grupo}</ITText>
              <ITFlex gap={1} wrap="wrap">
                <ITBadget color={STATE_COLORS[exam.state]} size="sm">{t(`my.states.${exam.state}`)}</ITBadget>
                <ITBadget color="secondary" size="sm">{t("my.duracion", { min: exam.duracionMin })}</ITBadget>
                <ITBadget color="secondary" size="sm">{t("my.intentos", { used: exam.intentosUsados, max: exam.intentosMax })}</ITBadget>
              </ITFlex>
              <ITText className="text-[11px] text-slate-500">
                {exam.state === "NOT_OPEN" ? t("my.notOpen", { date: date(exam.fechaApertura) })
                  : exam.state === "OPEN" ? t("my.available", { date: date(exam.fechaCierre) })
                  : t("my.closedAt", { date: date(exam.fechaCierre) })}
              </ITText>
              {exam.lastAttempt && (
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <ITText className="block text-[11px] text-slate-500">{t("my.last", { status: t(`runner.statuses.${exam.lastAttempt.status}`) })}</ITText>
                  <ITText className="block text-[13px] font-bold text-slate-700">
                    {exam.lastAttempt.score === null
                      ? t("runner.hiddenResult")
                      : exam.lastAttempt.pendingCount
                        ? t("my.pending")
                        : t("my.score", { score: exam.lastAttempt.score, total: exam.totalPuntos })}
                  </ITText>
                  <ITButton variant="text" color="primary" size="sm" onClick={() => navigate(`/exam/${exam.lastAttempt?.attemptId}`)}>
                    {t("runner.resultTitle")}
                  </ITButton>
                </div>
              )}
              {exam.inProgressAttemptId || exam.canStart ? (
                <ITButton variant="filled" color="primary" disabled={starting === exam.examId} onClick={() => void start(exam)}>
                  <ITFlex align="center" gap={1}><FaPlay size={10} /><ITText className="text-[11px] font-bold">{exam.inProgressAttemptId ? t("my.resume") : t("my.start")}</ITText></ITFlex>
                </ITButton>
              ) : (
                exam.state === "OPEN" && <ITAlert variant="info">{t("my.noAttempts")}</ITAlert>
              )}
            </ITFlex>
            </article>
          </PanelCard>
        ))}
      </div>
    </ITPage>
  );
}
