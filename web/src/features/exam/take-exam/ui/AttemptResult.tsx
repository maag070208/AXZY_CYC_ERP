import { ITAlert, ITBadget, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import { FaCheck, FaTimes } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import type { Attempt } from "@entities/online-exam";
import { PanelCard } from "@shared/ui/panel-card";

/** Resultado del intento para el alumno (solo si el examen lo muestra). */
export default function AttemptResult({ attempt, expired }: { attempt: Attempt; expired?: boolean }) {
  const { t } = useTranslation("exams");
  const result = attempt.result;
  return (
    <ITFlex direction="column" gap={4}>
      {expired && <ITAlert variant="warning">{t("runner.expired")}</ITAlert>}
      <PanelCard title={t("runner.resultTitle")}>
        <ITFlex direction="column" gap={2}>
          <ITFlex gap={2} align="center">
            <ITBadget color="secondary" size="sm">{t(`runner.statuses.${attempt.status}`)}</ITBadget>
            {result?.aprobado !== null && result?.aprobado !== undefined && result.pendingCount === 0 && (
              <ITBadget color={result.aprobado ? "success" : "danger"} size="sm">{result.aprobado ? t("results.aprobado") : t("results.reprobado")}</ITBadget>
            )}
          </ITFlex>
          {result ? (
            <>
              <ITText data-role="attempt-score" className="text-[28px] font-black text-slate-800">
                {result.score} <span className="text-[16px] text-slate-400">/ {result.totalPuntos}</span>
              </ITText>
              {result.pendingCount > 0 && <ITAlert variant="info">{t("runner.waitingReview")}</ITAlert>}
            </>
          ) : (
            <ITAlert variant="info">{t("runner.hiddenResult")}</ITAlert>
          )}
        </ITFlex>
      </PanelCard>
      {result && (
        <PanelCard>
          <ol className="divide-y divide-slate-100">
            {attempt.questions.map((q) => (
              <li key={q.questionId} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <ITText className="block text-[12px] text-slate-700">{q.orden}. {q.enunciado}</ITText>
                  {q.comentario && <ITText className="text-[11px] italic text-slate-500">“{q.comentario}”</ITText>}
                </div>
                {q.puntosObtenidos === null || q.puntosObtenidos === undefined ? (
                  <ITBadget color="warning" size="sm">{t("my.pending")}</ITBadget>
                ) : (
                  <ITBadget color={q.esCorrecta ? "success" : "danger"} size="sm">
                    <ITFlex align="center" gap={1}>{q.esCorrecta ? <FaCheck size={8} /> : <FaTimes size={8} />}{q.puntosObtenidos} / {q.puntos}</ITFlex>
                  </ITBadget>
                )}
              </li>
            ))}
          </ol>
        </PanelCard>
      )}
    </ITFlex>
  );
}
