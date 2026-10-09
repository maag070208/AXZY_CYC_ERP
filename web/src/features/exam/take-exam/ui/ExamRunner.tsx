import { useCallback, useEffect, useRef, useState } from "react";
import { ITAlert, ITButton, ITConfirmDialog, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import { FaClock, FaPaperPlane } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { attemptApi, type AnswerValue, type Attempt } from "@entities/online-exam";
import { ApiError } from "@shared/api/client";
import { PanelCard } from "@shared/ui/panel-card";
import QuestionField from "./QuestionField";

interface Props {
  attempt: Attempt;
  /** El intento terminó (enviado o vencido): recibe la vista final del servidor. */
  onFinished: (attempt: Attempt, expired: boolean) => void;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 1500;
const WARNING_SECONDS = 120;
const answered = (v: AnswerValue) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
const clock = (seconds: number) => {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};
const isClosed = (err: unknown) => err instanceof ApiError && err.code === "ATTEMPT_CLOSED";

/**
 * Aplicación del examen (M16): el tiempo lo fija el servidor (`remainingSeconds`),
 * las respuestas se guardan solas y los cambios de pestaña se registran.
 */
export default function ExamRunner({ attempt, onFinished }: Props) {
  const { t, i18n } = useTranslation(["exams", "common"]);
  const notify = useNotify();
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() =>
    Object.fromEntries(attempt.questions.map((q) => [q.questionId, q.respuesta]))
  );
  const [remaining, setRemaining] = useState(attempt.remainingSeconds);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const deadline = useRef(Date.now() + attempt.remainingSeconds * 1000);
  const dirty = useRef(new Set<string>());
  const answersRef = useRef(answers);
  const finished = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  answersRef.current = answers;

  const pendingAnswers = () => [...dirty.current].map((questionId) => ({ questionId, respuesta: answersRef.current[questionId] ?? null }));

  const finish = useCallback(async (expired: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onFinished(await attemptApi.get(attempt.attemptId), expired);
  }, [attempt.attemptId, onFinished]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const batch = pendingAnswers();
    if (!batch.length || finished.current) return;
    dirty.current.clear();
    setSaveState("saving");
    try {
      const res = await attemptApi.save(attempt.attemptId, batch);
      deadline.current = Date.now() + res.remainingSeconds * 1000;
      setSavedAt(new Date(res.savedAt));
      setSaveState(dirty.current.size ? "dirty" : "saved");
    } catch (err) {
      batch.forEach((a) => dirty.current.add(a.questionId));
      setSaveState("error");
      if (isClosed(err)) void finish(true);
    }
  }, [attempt.attemptId, finish]);

  const change = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    dirty.current.add(questionId);
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  };

  // Reloj: cuenta contra la hora límite del servidor; al llegar a cero el
  // servidor ya considera el intento vencido y lo califica.
  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.round((deadline.current - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        void flush().finally(() => void finish(true));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [flush, finish]);

  // Cambios de pestaña (se registran, no invalidan el intento).
  useEffect(() => {
    const onVisibility = () => {
      if (finished.current) return;
      attemptApi.event(attempt.attemptId, document.hidden ? "TAB_BLUR" : "TAB_FOCUS").catch(() => undefined);
      if (document.hidden) void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [attempt.attemptId, flush]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const submit = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      const result = await attemptApi.submit(attempt.attemptId, pendingAnswers());
      finished.current = true;
      notify.success(t("runner.submitted"));
      onFinished(result, false);
    } catch (err) {
      if (isClosed(err)) void finish(true);
      else notify.error(errorMessage(err, t("common:errors.save")));
    } finally {
      setSubmitting(false);
    }
  };

  const total = attempt.questions.length;
  const done = attempt.questions.filter((q) => answered(answers[q.questionId] ?? null)).length;
  const low = remaining <= WARNING_SECONDS;
  const saveLabel =
    saveState === "saving" ? t("runner.saving")
    : saveState === "dirty" || saveState === "error" ? t("runner.unsaved")
    : savedAt ? t("runner.saved", { time: savedAt.toLocaleTimeString(i18n.language, { timeStyle: "short" }) })
    : "";

  return (
    <ITFlex direction="column" gap={4}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <ITFlex align="center" gap={3}>
          <span data-role="exam-timer" aria-label={t("runner.remaining")}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-[18px] font-black ${low ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
            <FaClock size={14} /> {clock(remaining)}
          </span>
          <ITText className="text-[12px] font-bold text-slate-600">{t("runner.answered", { count: done, total })}</ITText>
          <ITText data-role="save-state" className={`text-[11px] ${saveState === "error" ? "text-rose-600" : "text-slate-400"}`}>{saveLabel}</ITText>
        </ITFlex>
        <ITButton variant="filled" color="primary" disabled={submitting} onClick={() => setConfirmOpen(true)}>
          <ITFlex align="center" gap={1}><FaPaperPlane size={11} /><ITText className="text-[11px] font-bold">{t("runner.submit")}</ITText></ITFlex>
        </ITButton>
      </div>
      {low && <ITAlert variant="warning">{t("runner.warning")}</ITAlert>}
      {attempt.instrucciones && <ITAlert variant="info"><span className="whitespace-pre-line">{attempt.instrucciones}</span></ITAlert>}
      <ITText className="text-[11px] text-slate-400">{t("runner.focusWarning")}</ITText>
      {attempt.questions.map((q) => (
        <PanelCard key={q.questionId}>
          <section aria-label={t("runner.question", { n: q.orden })}>
            <ITFlex justify="between" align="start" gap={3} className="mb-3">
              <ITText className="text-[14px] font-bold text-slate-800">
                <span className="mr-2 text-slate-400">{q.orden}.</span>{q.enunciado}
              </ITText>
              <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{t("runner.points", { count: q.puntos })}</span>
            </ITFlex>
            <QuestionField question={q} value={answers[q.questionId] ?? null} disabled={submitting} onChange={(v) => change(q.questionId, v)} />
          </section>
        </PanelCard>
      ))}
      <ITConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void submit()}
        title={t("runner.submitTitle")}
        message={`${t("runner.submitMessage")} ${t("runner.answered", { count: done, total })}.`}
        confirmLabel={t("runner.submit")}
        cancelLabel={t("common:actions.cancel")}
        variant="primary"
      />
    </ITFlex>
  );
}
