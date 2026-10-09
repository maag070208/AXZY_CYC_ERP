import { useCallback, useEffect, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITDialog, ITFlex, ITInput, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { FaCheck, FaRedo, FaTimes } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { attemptApi, type Attempt, type AttemptQuestion } from "@entities/online-exam";

interface Props {
  attemptId: string | null;
  canReview: boolean;
  onClose: () => void;
  /** Tras calificar o recalificar (para refrescar resultados). */
  onChanged: () => void;
}

const answerText = (q: AttemptQuestion, empty: string): string => {
  if (q.answer === null || q.answer === "" || (Array.isArray(q.answer) && q.answer.length === 0)) return empty;
  if (typeof q.answer === "string") return q.answer;
  const chosen = new Set(q.answer);
  return q.options.filter((o) => chosen.has(o.id)).map((o) => o.text).join(", ");
};

function OpenReview({ attemptId, question, onDone }: { attemptId: string; question: AttemptQuestion; onDone: () => void }) {
  const { t } = useTranslation(["exams", "common"]);
  const notify = useNotify();
  const [points, setPuntos] = useState(question.pointsEarned === null || question.pointsEarned === undefined ? "" : String(question.pointsEarned));
  const [comment, setComentario] = useState(question.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = Number(points);
    if (points === "" || value < 0 || value > question.points) {
      setError(t("review.puntos", { max: question.points }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await attemptApi.review(attemptId, { questionId: question.questionId, pointsEarned: value, comment: comment.trim() || undefined });
      notify.success(t("review.reviewed"));
      onDone();
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-role="open-review" className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      {error && <div className="mb-2"><ITAlert variant="error">{error}</ITAlert></div>}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[8rem_1fr_auto] md:items-end">
        <ITInput name={`review-points-${question.sortOrder}`} type="number" decimals={2} label={t("review.puntos", { max: question.points })} value={points} onChange={(e) => setPuntos(e.target.value)} />
        <ITTextarea name={`review-comment-${question.sortOrder}`} label={t("review.comentario")} value={comment} onChange={setComentario} rows={1} maxLength={1000} />
        <ITButton variant="filled" color="primary" disabled={saving} onClick={() => void save()}>{t("review.calificar")}</ITButton>
      </div>
    </div>
  );
}

/** Detalle de un intento para el profesor: respuestas, aciertos y revisión de abiertas (M17). */
export default function AttemptReviewDialog({ attemptId, canReview, onClose, onChanged }: Props) {
  const { t } = useTranslation(["exams", "common"]);
  const notify = useNotify();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!attemptId) return;
    attemptApi.get(attemptId).then(setAttempt).catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [attemptId, t]);
  useEffect(() => {
    setAttempt(null);
    setError(null);
    load();
  }, [load]);

  const changed = () => {
    load();
    onChanged();
  };
  const regrade = async () => {
    if (!attemptId) return;
    try {
      const res = await attemptApi.regrade(attemptId);
      notify.success(t("review.regraded", { score: res.score }));
      changed();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const title = attempt ? t("review.title", { number: attempt.number, name: attempt.student.name }) : t("results.ver");
  const finished = !!attempt && attempt.status !== "IN_PROGRESS";
  return (
    <ITDialog isOpen={!!attemptId} onClose={onClose} title={title} className="w-full max-w-3xl">
      <div role="dialog" aria-label={title}>
        {error && <ITAlert variant="error">{error}</ITAlert>}
        {attempt && (
          <ITFlex direction="column" gap={3}>
            <ITFlex justify="between" align="center" wrap="wrap" gap={2}>
              <ITFlex gap={2} align="center">
                <ITBadget color={attempt.status === "IN_PROGRESS" ? "warning" : "secondary"} size="sm">{t(`runner.statuses.${attempt.status}`)}</ITBadget>
                {attempt.result && (
                  <ITText className="text-[13px] font-bold text-slate-700">
                    {t("review.score", { score: attempt.result.score, total: attempt.result.totalPuntos })}
                  </ITText>
                )}
                {!!attempt.result?.pendingCount && <ITBadget color="warning" size="sm">{t("review.pending", { count: attempt.result.pendingCount })}</ITBadget>}
                {attempt.focusLosses > 0 && <ITBadget color="danger" size="sm">{t("results.pestanas", { count: attempt.focusLosses })}</ITBadget>}
              </ITFlex>
              {canReview && finished && (
                <ITButton variant="outlined" color="secondary" size="sm" onClick={() => void regrade()}>
                  <ITFlex align="center" gap={1}><FaRedo size={10} /><ITText className="text-[11px] font-bold">{t("review.regrade")}</ITText></ITFlex>
                </ITButton>
              )}
            </ITFlex>
            <ol className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
              {attempt.questions.map((q) => {
                const pending = q.type === "OPEN" && (q.pointsEarned === null || q.pointsEarned === undefined);
                return (
                  <li key={q.questionId} data-role="attempt-question" className="py-3">
                    <ITFlex justify="between" gap={3}>
                      <ITText className="text-[12px] font-bold text-slate-700">{q.sortOrder}. {q.text}</ITText>
                      <span className="shrink-0">
                        {pending ? (
                          <ITBadget color="warning" size="sm">{t("review.pendiente")}</ITBadget>
                        ) : (
                          <ITBadget color={q.isCorrect ? "success" : "danger"} size="sm">
                            <ITFlex align="center" gap={1}>{q.isCorrect ? <FaCheck size={8} /> : <FaTimes size={8} />}{q.pointsEarned ?? 0} / {q.points}</ITFlex>
                          </ITBadget>
                        )}
                      </span>
                    </ITFlex>
                    <ITText className="mt-1 block text-[12px] text-slate-600">
                      <b>{t("review.respuesta")}:</b> {answerText(q, t("review.sinRespuesta"))}
                    </ITText>
                    {q.type !== "OPEN" && (
                      <ITText className="block text-[11px] text-emerald-700">
                        {t("review.correcta")}: {q.options.filter((o) => o.isCorrect).map((o) => o.text).join(", ")}
                      </ITText>
                    )}
                    {q.comment && <ITText className="block text-[11px] italic text-slate-500">“{q.comment}”</ITText>}
                    {q.type === "OPEN" && canReview && finished && <OpenReview attemptId={attempt.attemptId} question={q} onDone={changed} />}
                  </li>
                );
              })}
            </ol>
          </ITFlex>
        )}
      </div>
    </ITDialog>
  );
}
