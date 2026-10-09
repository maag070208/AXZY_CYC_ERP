import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITCheckbox, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { FaPlus, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { DIFFICULTIES, QUESTION_TYPES, questionApi, type Difficulty, type Question, type QuestionType } from "@entities/question";
import { courseApi, type CourseOption } from "@entities/course";
import { errorMessage } from "@app/toast/useNotify";
import { validateRequired } from "@shared/validation";

interface Props {
  isOpen: boolean;
  question: Question | null;
  onClose: () => void;
  onSaved: (question: Question, created: boolean) => void;
}

type Option = { text: string; isCorrect: boolean };

const defaultOptions = (type: QuestionType, t: (k: string) => string): Option[] => {
  if (type === "OPEN") return [];
  if (type === "TRUE_FALSE") return [{ text: t("verdadero"), isCorrect: true }, { text: t("falso"), isCorrect: false }];
  return [{ text: "", isCorrect: true }, { text: "", isCorrect: false }];
};

/** Alta/edición de reactivo con opciones según el tipo (M14 §4.1–4.5). */
export default function QuestionFormDialog({ isOpen, question, onClose, onSaved }: Props) {
  const { t } = useTranslation(["exams", "common"]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseId, setCourseId] = useState("");
  const [type, setType] = useState<QuestionType>("MULTIPLE_CHOICE");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [pointsInput, setPointsInput] = useState("1");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [options, setOptions] = useState<Option[]>([]);
  const [errors, setErrors] = useState<{ courseId?: string; text?: string; points?: string; options?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tf = (key: string) => (key === "verdadero" ? "Verdadero" : "Falso");

  useEffect(() => {
    if (!isOpen) return;
    courseApi.options().then(setCourses).catch(() => setCourses([]));
    setCourseId(question?.courseId ?? "");
    setType(question?.type ?? "MULTIPLE_CHOICE");
    setTopic(question?.topic ?? "");
    setText(question?.text ?? "");
    setPointsInput(String(question?.points ?? 1));
    setDifficulty(question?.difficulty ?? "");
    setOptions(question ? question.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) : defaultOptions("MULTIPLE_CHOICE", tf));
    setErrors({});
    setError(null);
  }, [question, isOpen]);

  const changeType = (next: QuestionType) => {
    setType(next);
    setOptions(defaultOptions(next, tf));
  };
  const setOption = (index: number, patch: Partial<Option>) =>
    setOptions((prev) =>
      prev.map((o, i) => {
        if (i === index) return { ...o, ...patch };
        // En opción múltiple y V/F marcar una desmarca las demás.
        if (patch.isCorrect && (type === "MULTIPLE_CHOICE" || type === "TRUE_FALSE")) return { ...o, isCorrect: false };
        return o;
      })
    );

  const save = async () => {
    const points = Number(pointsInput);
    const next = {
      courseId: question ? undefined : validateRequired(courseId, t("questions.courseName")) ?? undefined,
      text: validateRequired(text, t("questions.text")) ?? undefined,
      points: points > 0 ? undefined : t("common:validation.required", { label: t("questions.points") }),
      options: type !== "OPEN" && (options.some((o) => !o.text.trim()) || !options.some((o) => o.isCorrect))
        ? t("questions.optionCount")
        : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    setError(null);
    const data = {
      topic: topic.trim() || null,
      type,
      text: text.trim(),
      points: points,
      difficulty: difficulty || null,
      options: options.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
    };
    try {
      if (question) onSaved(await questionApi.update(question.id, data), false);
      else onSaved(await questionApi.create({ ...data, courseId }), true);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = question ? t("questions.titleEdit") : t("questions.titleNew");
  const fixedCount = type === "TRUE_FALSE";
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-3xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          {question?.locked && <ITAlert variant="warning">{t("questions.locked")}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="courseId" label={t("questions.courseName")} value={courseId} disabled={!!question} error={errors.courseId} placeholder="—"
                options={courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))} onChange={(e) => setCourseId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="type" label={t("questions.type")} value={type}
                options={QUESTION_TYPES.map((x) => ({ value: x, label: t(`questions.types.${x}`) }))} onChange={(e) => changeType(e.target.value as QuestionType)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="text" label={t("questions.text")} value={text} onChange={setText} rows={3} maxLength={5000} error={errors.text} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="topic" label={t("questions.topic")} value={topic} onChange={(e) => setTopic(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="points" type="number" label={t("questions.points")} value={pointsInput} required error={errors.points} onChange={(e) => setPointsInput(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITSelect name="difficulty" label={t("questions.difficulty")} value={difficulty} placeholder="—"
                options={DIFFICULTIES.map((d) => ({ value: d, label: t(`questions.difficulties.${d}`) }))} onChange={(e) => setDifficulty(e.target.value as Difficulty)} />
            </ITGrid>
          </ITGrid>
          {type === "OPEN" ? (
            <ITText className="text-[12px] text-slate-500">{t("questions.openHint")}</ITText>
          ) : (
            <div data-role="options-editor">
              <ITFlex justify="between" align="center" className="mb-2">
                <ITText className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t("questions.optionCount")}</ITText>
                {!fixedCount && options.length < 10 && (
                  <ITButton variant="text" color="primary" size="sm" onClick={() => setOptions((prev) => [...prev, { text: "", isCorrect: false }])}>
                    <ITFlex align="center" gap={1}><FaPlus size={10} /><ITText className="text-[11px] font-bold">{t("questions.addOption")}</ITText></ITFlex>
                  </ITButton>
                )}
              </ITFlex>
              <ITFlex direction="column" gap={2}>
                {options.map((o, i) => (
                  <ITFlex key={i} align="center" gap={2}>
                    <ITCheckbox name={`correctOption-${i}`} checked={o.isCorrect} label={t("questions.correctOption")} onChange={(checked) => setOption(i, { isCorrect: checked })} />
                    <div className="flex-1">
                      <ITInput name={`option-${i}`} value={o.text} disabled={fixedCount} onChange={(e) => setOption(i, { text: e.target.value })} />
                    </div>
                    {!fixedCount && options.length > 2 && (
                      <ITButton variant="text" color="danger" size="sm" ariaLabel={t("questions.removeOption")}
                        onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}>
                        <FaTrash size={11} />
                      </ITButton>
                    )}
                  </ITFlex>
                ))}
              </ITFlex>
              {errors.options && <ITText className="mt-1 block text-[11px]" style={{ color: "#dc2626" }}>{errors.options}</ITText>}
            </div>
          )}
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving || question?.locked}>{saving ? t("common:actions.saving") : t("common:actions.save")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
