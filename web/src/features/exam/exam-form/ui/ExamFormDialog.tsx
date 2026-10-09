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

type Errors = Partial<Record<"groupId" | "titulo" | "duracionMin" | "intentosMax" | "fechaApertura" | "fechaCierre" | "puntajeAprobatorio", string>>;

/**
 * Alta/configuración de examen en línea (M15 §4.1–4.3). Con intentos, solo se
 * editan instrucciones, cierre y si se muestra el resultado (como en la API).
 */
export default function ExamFormDialog({ isOpen, exam, onClose, onSaved }: Props) {
  const { t } = useTranslation(["exams", "common"]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [groupId, setGroupId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [duracion, setDuracion] = useState("60");
  const [intentos, setIntentos] = useState("1");
  const [apertura, setApertura] = useState("");
  const [cierre, setCierre] = useState("");
  const [aprobatorio, setAprobatorio] = useState("0");
  const [criterio, setCriterio] = useState<Criterion>("MEJOR");
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
    setTitulo(exam?.titulo ?? "");
    setInstrucciones(exam?.instrucciones ?? "");
    setDuracion(String(exam?.duracionMin ?? 60));
    setIntentos(String(exam?.intentosMax ?? 1));
    setApertura(toLocalInput(exam?.fechaApertura));
    setCierre(toLocalInput(exam?.fechaCierre));
    setAprobatorio(String(exam?.puntajeAprobatorio ?? 0));
    setCriterio(exam?.criterioIntentos ?? "MEJOR");
    setShuffleQ(exam?.aleatorizarPreguntas ?? false);
    setShuffleO(exam?.aleatorizarOpciones ?? false);
    setShowResult(exam?.mostrarResultado ?? true);
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
      titulo: validateRequired(titulo, t("exams.titulo")) ?? undefined,
      duracionMin: Number(duracion) >= 1 ? undefined : required(t("exams.duracion")),
      intentosMax: Number(intentos) >= 1 ? undefined : required(t("exams.intentosMax")),
      fechaApertura: from ? undefined : required(t("exams.apertura")),
      fechaCierre: !to ? required(t("exams.cierre")) : from && from >= to ? t("common:validation.invalidRange") : undefined,
      puntajeAprobatorio: aprobatorio !== "" && Number(aprobatorio) >= 0 ? undefined : required(t("exams.aprobatorio")),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const data: OnlineExamInput = locked
      ? { instrucciones: instrucciones.trim() || null, fechaCierre: to!, mostrarResultado: showResult }
      : {
          titulo: titulo.trim(),
          instrucciones: instrucciones.trim() || null,
          duracionMin: Number(duracion),
          intentosMax: Number(intentos),
          fechaApertura: from!,
          fechaCierre: to!,
          puntajeAprobatorio: Number(aprobatorio),
          criterioIntentos: criterio,
          aleatorizarPreguntas: shuffleQ,
          aleatorizarOpciones: shuffleO,
          mostrarResultado: showResult,
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

  const title = exam ? t("exams.titleEdit") : t("exams.titleNew");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-3xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          {locked && <ITAlert variant="warning">{t("exams.lockedHint")}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              {exam ? (
                <ITInput name="grupo" label={t("exams.grupo")} value={`${exam.courseNombre} · ${exam.groupNombre}`} disabled onChange={() => undefined} />
              ) : (
                <ITSelect name="groupId" label={t("exams.grupo")} value={groupId} error={errors.groupId} placeholder="—"
                  options={groups.map((g) => ({ value: g.id, label: `${g.courseClave} · ${g.nombre} (${g.termNombre})` }))}
                  onChange={(e) => { setGroupId(e.target.value); setAssessmentId(""); }} />
              )}
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput name="titulo" label={t("exams.titulo")} value={titulo} required disabled={locked} error={errors.titulo} maxLength={150} onChange={(e) => setTitulo(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="instrucciones" label={t("exams.instrucciones")} value={instrucciones} onChange={setInstrucciones} rows={2} maxLength={5000} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <DateTimeField name="fechaApertura" label={t("exams.apertura")} timeLabel={t("exams.hora")} value={apertura} required disabled={locked} error={errors.fechaApertura} onChange={setApertura} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <DateTimeField name="fechaCierre" label={t("exams.cierre")} timeLabel={t("exams.hora")} value={cierre} required error={errors.fechaCierre} onChange={setCierre} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="duracionMin" type="number" label={t("exams.duracion")} value={duracion} required disabled={locked} error={errors.duracionMin} onChange={(e) => setDuracion(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="intentosMax" type="number" label={t("exams.intentosMax")} value={intentos} required disabled={locked} error={errors.intentosMax} onChange={(e) => setIntentos(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="puntajeAprobatorio" type="number" label={t("exams.aprobatorio")} value={aprobatorio} required disabled={locked} error={errors.puntajeAprobatorio} onChange={(e) => setAprobatorio(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITSelect name="criterioIntentos" label={t("exams.criterio")} value={criterio} disabled={locked}
                options={(["MEJOR", "ULTIMO"] as const).map((c) => ({ value: c, label: t(`exams.criterios.${c}`) }))}
                onChange={(e) => setCriterio(e.target.value as Criterion)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITSelect name="assessmentId" label={t("exams.evaluacion")} value={assessmentId} disabled={locked || !groupId} placeholder={t("exams.sinEvaluacion")}
                options={[{ value: "", label: t("exams.sinEvaluacion") }, ...assessments.map((a) => ({ value: a.id, label: `${a.nombre} (${a.ponderacion}% · /${a.maxScore})` }))]}
                onChange={(e) => setAssessmentId(e.target.value)} />
            </ITGrid>
          </ITGrid>
          <ITFlex gap={4} wrap="wrap">
            <ITCheckbox name="aleatorizarPreguntas" label={t("exams.aleatorizarPreguntas")} checked={shuffleQ} disabled={locked} onChange={setShuffleQ} />
            <ITCheckbox name="aleatorizarOpciones" label={t("exams.aleatorizarOpciones")} checked={shuffleO} disabled={locked} onChange={setShuffleO} />
            <ITCheckbox name="mostrarResultado" label={t("exams.mostrarResultado")} checked={showResult} onChange={setShowResult} />
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
