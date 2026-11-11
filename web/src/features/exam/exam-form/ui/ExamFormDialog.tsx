import { useEffect, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITCheckbox, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { FaPlus, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { groupApi, type Group } from "@entities/group";
import { assessmentApi, type Assessment } from "@entities/grade";
import { onlineExamApi, type Criterion, type OnlineExam, type OnlineExamDetail, type OnlineExamInput } from "@entities/online-exam";
import { questionApi, type Question, type QuestionType } from "@entities/question";
import { fromLocalInput, toLocalInput } from "@shared/lib/day";
import { validateRequired } from "@shared/validation";
import DateTimeField from "./DateTimeField";

interface Props {
  isOpen: boolean;
  /** Examen a editar; con `questions` cuando viene del detalle (M15 §4.4). */
  exam: (OnlineExam & { questions?: OnlineExamDetail["questions"] }) | null;
  onClose: () => void;
  onSaved: (exam: OnlineExamDetail, created: boolean) => void;
}

type Errors = Partial<Record<"groupId" | "title" | "durationMin" | "maxAttempts" | "opensAt" | "closesAt" | "passingScore", string>>;

/**
 * Alta/configuración de examen en línea (M15 §4.1–4.3). Con intentos, solo se
 * editan instrucciones, cierre y si se muestra el resultado (como en la API).
 */
export default function ExamFormDialog({ isOpen, exam, onClose, onSaved }: Props) {
  const { t } = useTranslation(["exams", "common"]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [duration, setDuration] = useState("60");
  const [attempts, setAttempts] = useState("1");
  const [opensAt, setApertura] = useState("");
  const [closesAt, setCierre] = useState("");
  const [passingScore, setPassingScore] = useState("0");
  const [criterion, setCriterion] = useState<Criterion>("BEST");
  const [shuffleQ, setShuffleQ] = useState(false);
  const [shuffleO, setShuffleO] = useState(false);
  const [showResult, setShowResult] = useState(true);
  const [assessmentId, setAssessmentId] = useState("");
  const [bank, setBank] = useState<Question[]>([]);
  const [picked, setPicked] = useState<Array<{ questionId: string; type: QuestionType; topic: string | null; text: string; points: string }>>([]);
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const locked = !!exam && exam.attemptCount > 0;

  useEffect(() => {
    if (!isOpen) return;
    if (!exam) groupApi.options().then((rows) => setGroups(rows.filter((g) => g.active && !g.closedAt))).catch(() => setGroups([]));
    setGroupId(exam?.groupId ?? "");
    setTitle(exam?.title ?? "");
    setInstructions(exam?.instructions ?? "");
    setDuration(String(exam?.durationMin ?? 60));
    setAttempts(String(exam?.maxAttempts ?? 1));
    setApertura(toLocalInput(exam?.opensAt));
    setCierre(toLocalInput(exam?.closesAt));
    setPassingScore(String(exam?.passingScore ?? 0));
    setCriterion(exam?.attemptCriterion ?? "BEST");
    setShuffleQ(exam?.shuffleQuestions ?? false);
    setShuffleO(exam?.shuffleOptions ?? false);
    setShowResult(exam?.showResult ?? true);
    setAssessmentId(exam?.assessmentId ?? "");
    // Al editar, la selección es la del examen; al crear, vacía.
    setPicked(
      (exam?.questions ?? []).map((question) => ({
        questionId: question.questionId,
        type: question.type as QuestionType,
        topic: question.topic,
        text: question.text,
        points: String(question.points),
      }))
    );
    setSearch("");
    setErrors({});
    setError(null);
  }, [exam, isOpen]);

  useEffect(() => {
    if (!isOpen || !groupId) {
      setAssessments([]);
      return;
    }
    assessmentApi
      .table({ page: 1, limit: 100, filters: { groupId, active: true } })
      .then((res) => setAssessments(res.data))
      .catch(() => setAssessments([]));
  }, [groupId, isOpen]);

  // Reactivos disponibles: los activos del curso del grupo elegido (el examen
  // solo puede llevar preguntas de su propio curso).
  const courseId = groups.find((g) => g.id === groupId)?.courseId ?? exam?.courseId ?? "";
  useEffect(() => {
    if (!isOpen || locked || !courseId) {
      setBank([]);
      return;
    }
    questionApi
      .table({ page: 1, limit: 200, filters: { courseId, status: "ACTIVE" } })
      .then((res) => setBank(res.data))
      .catch(() => setBank([]));
  }, [courseId, isOpen, locked]);

  const pickedIds = new Set(picked.map((row) => row.questionId));
  const available = bank.filter(
    (question) => !pickedIds.has(question.id) && (!search.trim() || `${question.text} ${question.topic ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
  );
  const totalPoints = Math.round(picked.reduce((sum, row) => sum + (Number(row.points) || 0), 0) * 100) / 100;

  const save = async () => {
    const required = (label: string) => t("common:validation.required", { label });
    const from = fromLocalInput(opensAt);
    const to = fromLocalInput(closesAt);
    const next: Errors = {
      groupId: exam ? undefined : validateRequired(groupId, t("exams.groupName")) ?? undefined,
      title: validateRequired(title, t("exams.titleField")) ?? undefined,
      durationMin: Number(duration) >= 1 ? undefined : required(t("exams.duration")),
      maxAttempts: Number(attempts) >= 1 ? undefined : required(t("exams.maxAttempts")),
      opensAt: from ? undefined : required(t("exams.opensAt")),
      closesAt: !to ? required(t("exams.closesAt")) : from && from >= to ? t("common:validation.invalidRange") : undefined,
      passingScore: passingScore !== "" && Number(passingScore) >= 0 ? undefined : required(t("exams.passingScore")),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const data: OnlineExamInput = locked
      ? { instructions: instructions.trim() || null, closesAt: to!, showResult: showResult }
      : {
          title: title.trim(),
          instructions: instructions.trim() || null,
          durationMin: Number(duration),
          maxAttempts: Number(attempts),
          opensAt: from!,
          closesAt: to!,
          passingScore: Number(passingScore),
          attemptCriterion: criterion,
          shuffleQuestions: shuffleQ,
          shuffleOptions: shuffleO,
          showResult: showResult,
          assessmentId: assessmentId || null,
        };
    setSaving(true);
    setError(null);
    try {
      if (exam) {
        let saved = await onlineExamApi.update(exam.id, data);
        // Los reactivos se reemplazan solo si cambiaron (y sin intentos).
        const before = (exam.questions ?? []).map((question) => `${question.questionId}:${question.points}`).join("|");
        const after = picked.map((row) => `${row.questionId}:${Number(row.points)}`).join("|");
        if (after !== before) {
          saved = await onlineExamApi.setQuestions(exam.id, picked.map((row) => ({ questionId: row.questionId, points: Number(row.points) || undefined })));
        }
        onSaved(saved, false);
      } else {
        const created = await onlineExamApi.create({ ...data, groupId });
        // Los reactivos elegidos viajan con el alta: el examen nace armado.
        const detail = picked.length
          ? await onlineExamApi.setQuestions(created.id, picked.map((row) => ({ questionId: row.questionId, points: Number(row.points) || undefined })))
          : created;
        onSaved(detail, true);
      }
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const dialogTitle = exam ? t("exams.titleEdit") : t("exams.titleNew");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={dialogTitle} className="w-full max-w-3xl">
      <form role="dialog" aria-label={dialogTitle} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          {locked && <ITAlert variant="warning">{t("exams.lockedHint")}</ITAlert>}
          {/* El cuerpo se desplaza: en pantallas de 720px el botón Guardar debe
              seguir visible aunque el examen traiga muchos reactivos. */}
          <div className="max-h-[62vh] overflow-y-auto pr-1">
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              {exam ? (
                <ITInput name="groupName" label={t("exams.groupName")} value={`${exam.courseName} · ${exam.groupName}`} disabled onChange={() => undefined} />
              ) : (
                <ITSelect name="groupId" label={t("exams.groupName")} value={groupId} error={errors.groupId} placeholder="—"
                  options={groups.map((g) => ({ value: g.id, label: `${g.courseCode} · ${g.name} (${g.termName})` }))}
                  onChange={(e) => { setGroupId(e.target.value); setAssessmentId(""); }} />
              )}
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput name="title" label={t("exams.titleField")} value={title} required disabled={locked} error={errors.title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="instructions" label={t("exams.instructions")} value={instructions} onChange={setInstructions} rows={2} maxLength={5000} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <DateTimeField name="opensAt" label={t("exams.opensAt")} timeLabel={t("exams.time")} value={opensAt} required disabled={locked} error={errors.opensAt} onChange={setApertura} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <DateTimeField name="closesAt" label={t("exams.closesAt")} timeLabel={t("exams.time")} value={closesAt} required error={errors.closesAt} onChange={setCierre} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="durationMin" type="number" label={t("exams.duration")} value={duration} required disabled={locked} error={errors.durationMin} onChange={(e) => setDuration(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="maxAttempts" type="number" label={t("exams.maxAttempts")} value={attempts} required disabled={locked} error={errors.maxAttempts} onChange={(e) => setAttempts(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="passingScore" type="number" label={t("exams.passingScore")} value={passingScore} required disabled={locked} error={errors.passingScore} onChange={(e) => setPassingScore(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITSelect name="attemptCriterion" label={t("exams.criterion")} value={criterion} disabled={locked}
                options={(["BEST", "LAST"] as const).map((c) => ({ value: c, label: t(`exams.criteria.${c}`) }))}
                onChange={(e) => setCriterion(e.target.value as Criterion)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITSelect name="assessmentId" label={t("exams.assessment")} value={assessmentId} disabled={locked || !groupId} placeholder={t("exams.noAssessment")}
                options={[{ value: "", label: t("exams.noAssessment") }, ...assessments.map((a) => ({ value: a.id, label: `${a.name} (${a.weight}% · /${a.maxScore})` }))]}
                onChange={(e) => setAssessmentId(e.target.value)} />
            </ITGrid>
          </ITGrid>
          {!locked && (
            <div className="rounded-xl border border-slate-200 p-3" data-role="exam-question-picker">
              <ITFlex justify="between" align="center" className="mb-2" gap={2} wrap="wrap">
                <ITText className="text-[12px] font-bold text-slate-700">{t("exams.picker.title")}</ITText>
                <ITBadget color={picked.length ? "primary" : "secondary"} size="sm">
                  {t("exams.picker.count", { count: picked.length, total: totalPoints })}
                </ITBadget>
              </ITFlex>
              <ITText className="mb-2 block text-[11px] text-slate-500">
                {groupId ? t("exams.picker.hint") : t("exams.picker.pickGroup")}
              </ITText>
              {picked.length > 0 && (
                <ol data-role="exam-picked" className="mb-3 divide-y divide-slate-100">
                  {picked.map((row, index) => (
                    <li key={row.questionId} className="flex items-center gap-2 py-1.5">
                      <span className="w-5 shrink-0 text-right text-[11px] font-black text-slate-400">{index + 1}.</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700">{row.text}</span>
                      <span className="w-20 shrink-0">
                        <ITInput name={`picked-points-${index}`} type="number" value={row.points} decimals={2}
                          onChange={(e) => setPicked((prev) => prev.map((x, i) => (i === index ? { ...x, points: e.target.value } : x)))} />
                      </span>
                      <ITButton variant="text" color="danger" size="sm" type="button" ariaLabel={`${t("exams.builder.remove")} ${index + 1}`}
                        onClick={() => setPicked((prev) => prev.filter((x) => x.questionId !== row.questionId))}>
                        <FaTrash size={10} />
                      </ITButton>
                    </li>
                  ))}
                </ol>
              )}
              {groupId && (
                <>
                  <ITInput name="pickedSearch" placeholder={t("common:actions.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
                  {available.length === 0 ? (
                    <ITText className="mt-2 block text-[11px] text-slate-400">
                      {bank.length === 0 ? t("exams.picker.bankEmpty") : t("exams.picker.noMatches")}
                    </ITText>
                  ) : (
                    <ul data-role="exam-bank" className="mt-2 max-h-32 divide-y divide-slate-100 overflow-y-auto">
                      {available.map((question) => (
                        <li key={question.id} className="flex items-center gap-2 py-1.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] text-slate-700">{question.text}</span>
                            <span className="block text-[10px] text-slate-400">
                              {t(`questions.types.${question.type}`)} · {question.points} pt{question.topic ? ` · ${question.topic}` : ""}
                            </span>
                          </span>
                          <ITButton variant="outlined" color="primary" size="sm" type="button" ariaLabel={`${t("exams.builder.add")} ${question.text}`}
                            onClick={() => setPicked((prev) => [...prev, { questionId: question.id, type: question.type, topic: question.topic, text: question.text, points: String(question.points) }])}>
                            <FaPlus size={10} />
                          </ITButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
          <ITFlex gap={4} wrap="wrap">
            <ITCheckbox name="shuffleQuestions" label={t("exams.shuffleQuestions")} checked={shuffleQ} disabled={locked} onChange={setShuffleQ} />
            <ITCheckbox name="shuffleOptions" label={t("exams.shuffleOptions")} checked={shuffleO} disabled={locked} onChange={setShuffleO} />
            <ITCheckbox name="showResult" label={t("exams.showResult")} checked={showResult} onChange={setShowResult} />
          </ITFlex>
          </div>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{t("common:actions.save")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
