import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITCheckbox, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITTextarea } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { groupApi, type Group } from "@entities/group";
import { assessmentApi, type Assessment } from "@entities/grade";
import { onlineExamApi, type Criterion, type OnlineExam, type OnlineExamDetail, type OnlineExamInput } from "@entities/online-exam";
import { fromLocalInput, toLocalInput } from "@shared/lib/day";
import { validateRequired } from "@shared/validation";
import DateTimeField from "./DateTimeField";

interface Props {
  isOpen: boolean;
  exam: OnlineExam | null;
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
  const [instructions, setInstrucciones] = useState("");
  const [duracion, setDuracion] = useState("60");
  const [intentos, setIntentos] = useState("1");
  const [apertura, setApertura] = useState("");
  const [cierre, setCierre] = useState("");
  const [aprobatorio, setAprobatorio] = useState("0");
  const [criterio, setCriterio] = useState<Criterion>("BEST");
  const [shuffleQ, setShuffleQ] = useState(false);
  const [shuffleO, setShuffleO] = useState(false);
  const [showResult, setShowResult] = useState(true);
  const [assessmentId, setAssessmentId] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const locked = !!exam && exam.intentos > 0;

  useEffect(() => {
    if (!isOpen) return;
    if (!exam) groupApi.options().then((rows) => setGroups(rows.filter((g) => g.active && !g.closedAt))).catch(() => setGroups([]));
    setGroupId(exam?.groupId ?? "");
    setTitle(exam?.title ?? "");
    setInstrucciones(exam?.instructions ?? "");
    setDuracion(String(exam?.durationMin ?? 60));
    setIntentos(String(exam?.maxAttempts ?? 1));
    setApertura(toLocalInput(exam?.opensAt));
    setCierre(toLocalInput(exam?.closesAt));
    setAprobatorio(String(exam?.passingScore ?? 0));
    setCriterio(exam?.attemptCriterion ?? "BEST");
    setShuffleQ(exam?.shuffleQuestions ?? false);
    setShuffleO(exam?.shuffleOptions ?? false);
    setShowResult(exam?.showResult ?? true);
    setAssessmentId(exam?.assessmentId ?? "");
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

  const save = async () => {
    const required = (label: string) => t("common:validation.required", { label });
    const from = fromLocalInput(apertura);
    const to = fromLocalInput(cierre);
    const next: Errors = {
      groupId: exam ? undefined : validateRequired(groupId, t("exams.grupo")) ?? undefined,
      title: validateRequired(title, t("exams.titulo")) ?? undefined,
      durationMin: Number(duracion) >= 1 ? undefined : required(t("exams.duracion")),
      maxAttempts: Number(intentos) >= 1 ? undefined : required(t("exams.intentosMax")),
      opensAt: from ? undefined : required(t("exams.apertura")),
      closesAt: !to ? required(t("exams.cierre")) : from && from >= to ? t("common:validation.invalidRange") : undefined,
      passingScore: aprobatorio !== "" && Number(aprobatorio) >= 0 ? undefined : required(t("exams.aprobatorio")),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const data: OnlineExamInput = locked
      ? { instructions: instructions.trim() || null, closesAt: to!, showResult: showResult }
      : {
          title: title.trim(),
          instructions: instructions.trim() || null,
          durationMin: Number(duracion),
          maxAttempts: Number(intentos),
          opensAt: from!,
          closesAt: to!,
          passingScore: Number(aprobatorio),
          attemptCriterion: criterio,
          shuffleQuestions: shuffleQ,
          shuffleOptions: shuffleO,
          showResult: showResult,
          assessmentId: assessmentId || null,
        };
    setSaving(true);
    setError(null);
    try {
      if (exam) onSaved(await onlineExamApi.update(exam.id, data), false);
      else onSaved(await onlineExamApi.create({ ...data, groupId }), true);
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
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              {exam ? (
                <ITInput name="grupo" label={t("exams.grupo")} value={`${exam.courseNombre} · ${exam.groupNombre}`} disabled onChange={() => undefined} />
              ) : (
                <ITSelect name="groupId" label={t("exams.grupo")} value={groupId} error={errors.groupId} placeholder="—"
                  options={groups.map((g) => ({ value: g.id, label: `${g.courseClave} · ${g.name} (${g.termNombre})` }))}
                  onChange={(e) => { setGroupId(e.target.value); setAssessmentId(""); }} />
              )}
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput name="title" label={t("exams.titulo")} value={title} required disabled={locked} error={errors.title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="instructions" label={t("exams.instrucciones")} value={instructions} onChange={setInstrucciones} rows={2} maxLength={5000} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <DateTimeField name="opensAt" label={t("exams.apertura")} timeLabel={t("exams.hora")} value={apertura} required disabled={locked} error={errors.opensAt} onChange={setApertura} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <DateTimeField name="closesAt" label={t("exams.cierre")} timeLabel={t("exams.hora")} value={cierre} required error={errors.closesAt} onChange={setCierre} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="durationMin" type="number" label={t("exams.duracion")} value={duracion} required disabled={locked} error={errors.durationMin} onChange={(e) => setDuracion(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="maxAttempts" type="number" label={t("exams.intentosMax")} value={intentos} required disabled={locked} error={errors.maxAttempts} onChange={(e) => setIntentos(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="passingScore" type="number" label={t("exams.aprobatorio")} value={aprobatorio} required disabled={locked} error={errors.passingScore} onChange={(e) => setAprobatorio(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITSelect name="attemptCriterion" label={t("exams.criterio")} value={criterio} disabled={locked}
                options={(["BEST", "LAST"] as const).map((c) => ({ value: c, label: t(`exams.criterios.${c}`) }))}
                onChange={(e) => setCriterio(e.target.value as Criterion)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITSelect name="assessmentId" label={t("exams.evaluacion")} value={assessmentId} disabled={locked || !groupId} placeholder={t("exams.sinEvaluacion")}
                options={[{ value: "", label: t("exams.sinEvaluacion") }, ...assessments.map((a) => ({ value: a.id, label: `${a.name} (${a.weight}% · /${a.maxScore})` }))]}
                onChange={(e) => setAssessmentId(e.target.value)} />
            </ITGrid>
          </ITGrid>
          <ITFlex gap={4} wrap="wrap">
            <ITCheckbox name="shuffleQuestions" label={t("exams.aleatorizarPreguntas")} checked={shuffleQ} disabled={locked} onChange={setShuffleQ} />
            <ITCheckbox name="shuffleOptions" label={t("exams.aleatorizarOpciones")} checked={shuffleO} disabled={locked} onChange={setShuffleO} />
            <ITCheckbox name="showResult" label={t("exams.mostrarResultado")} checked={showResult} onChange={setShowResult} />
          </ITFlex>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{t("common:actions.save")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
