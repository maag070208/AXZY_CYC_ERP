import { useEffect, useMemo, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITFlex, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { FaArrowDown, FaArrowUp, FaPlus, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { questionApi, type Question, type QuestionType } from "@entities/question";
import { onlineExamApi, type OnlineExamDetail } from "@entities/online-exam";
import { PanelCard } from "@shared/ui/panel-card";

interface Props {
  exam: OnlineExamDetail;
  readOnly: boolean;
  onSaved: (exam: OnlineExamDetail) => void;
}

interface Row {
  questionId: string;
  type: QuestionType;
  topic: string | null;
  text: string;
  points: string;
}

const clip = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * Constructor de reactivos del examen (M15 §4.4): preguntas activas del banco
 * del mismo curso, con puntos y orden propios del examen.
 */
export default function ExamQuestionsBuilder({ exam, readOnly, onSaved }: Props) {
  const { t } = useTranslation(["exams", "common"]);
  const notify = useNotify();
  const [rows, setRows] = useState<Row[]>([]);
  const [bank, setBank] = useState<Question[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(exam.questions.map((q) => ({ questionId: q.questionId, type: q.type as QuestionType, topic: q.topic, text: q.text, points: String(q.points) })));
  }, [exam]);

  useEffect(() => {
    if (readOnly) return;
    questionApi
      .table({ page: 1, limit: 200, filters: { courseId: exam.courseId, status: "ACTIVE" } })
      .then((res) => setBank(res.data))
      .catch(() => setBank([]));
  }, [exam.courseId, readOnly]);

  const selected = useMemo(() => new Set(rows.map((r) => r.questionId)), [rows]);
  const available = bank.filter(
    (q) => !selected.has(q.id) && (!search.trim() || `${q.text} ${q.topic ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
  );
  const total = rows.reduce((sum, r) => sum + (Number(r.points) || 0), 0);
  const dirty =
    rows.length !== exam.questions.length ||
    rows.some((r, i) => r.questionId !== exam.questions[i]?.questionId || Number(r.points) !== exam.questions[i]?.points);

  const move = (index: number, delta: number) =>
    setRows((prev) => {
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });

  const save = async () => {
    if (rows.some((r) => !(Number(r.points) > 0))) {
      setError(t("common:validation.required", { label: t("questions.points") }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await onlineExamApi.setQuestions(exam.id, rows.map((r) => ({ questionId: r.questionId, points: Number(r.points) })));
      notify.success(t("exams.builder.saved"));
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <PanelCard
          title={t("exams.builder.selected")}
          description={t("exams.builder.totalPoints", { total: Math.round(total * 100) / 100 })}
          actions={!readOnly && (
            <ITButton variant="filled" color="primary" disabled={!dirty || saving} onClick={() => void save()}>
              {t("exams.builder.save")}
            </ITButton>
          )}
        >
          {error && <div className="mb-3"><ITAlert variant="error">{error}</ITAlert></div>}
          {rows.length === 0 ? (
            <ITText className="text-[12px] text-slate-400">{t("exams.builder.empty")}</ITText>
          ) : (
            <ol data-role="exam-questions" className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <li key={r.questionId} className="flex items-start gap-3 py-2">
                  <span className="mt-1 w-6 shrink-0 text-right text-[11px] font-black text-slate-400">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <ITText className="block text-[12px] text-slate-700">{clip(r.text)}</ITText>
                    <ITFlex gap={1} className="mt-1">
                      <ITBadget color="secondary" size="sm">{t(`questions.types.${r.type}`)}</ITBadget>
                      {r.topic && <ITBadget color="primary" size="sm">{r.topic}</ITBadget>}
                    </ITFlex>
                  </div>
                  <div className="w-20 shrink-0">
                    <ITInput name={`points-${i}`} type="number" value={r.points} disabled={readOnly} decimals={2}
                      onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, points: e.target.value } : x)))} />
                  </div>
                  {!readOnly && (
                    <ITFlex gap={1} className="shrink-0">
                      <ITButton variant="text" color="secondary" size="sm" disabled={i === 0} ariaLabel={`↑ ${i + 1}`} onClick={() => move(i, -1)}><FaArrowUp size={10} /></ITButton>
                      <ITButton variant="text" color="secondary" size="sm" disabled={i === rows.length - 1} ariaLabel={`↓ ${i + 1}`} onClick={() => move(i, 1)}><FaArrowDown size={10} /></ITButton>
                      <ITButton variant="text" color="danger" size="sm" ariaLabel={`${t("exams.builder.remove")} ${i + 1}`}
                        onClick={() => setRows((prev) => prev.filter((x) => x.questionId !== r.questionId))}><FaTrash size={10} /></ITButton>
                    </ITFlex>
                  )}
                </li>
              ))}
            </ol>
          )}
        </PanelCard>
      </div>
      {!readOnly && (
        <div className="lg:col-span-2">
          <PanelCard title={t("exams.builder.bank")} description={exam.courseName}>
            <div className="mb-3">
              <ITInput name="bankSearch" placeholder={t("common:actions.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {available.length === 0 ? (
              <ITText className="text-[12px] text-slate-400">{t("exams.builder.bankEmpty")}</ITText>
            ) : (
              <ul data-role="question-bank" className="max-h-[480px] divide-y divide-slate-100 overflow-y-auto">
                {available.map((q) => (
                  <li key={q.id} className="flex items-start gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <ITText className="block text-[12px] text-slate-700">{clip(q.text, 110)}</ITText>
                      <ITText className="text-[10px] text-slate-400">{t(`questions.types.${q.type}`)} · {q.points} pt{q.topic ? ` · ${q.topic}` : ""}</ITText>
                    </div>
                    <ITButton variant="outlined" color="primary" size="sm" ariaLabel={`${t("exams.builder.add")} ${q.text}`}
                      onClick={() => setRows((prev) => [...prev, { questionId: q.id, type: q.type, topic: q.topic, text: q.text, points: String(q.points) }])}>
                      <FaPlus size={10} />
                    </ITButton>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
        </div>
      )}
    </div>
  );
}
