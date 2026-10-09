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

type Option = { texto: string; esCorrecta: boolean };

const defaultOptions = (tipo: QuestionType, t: (k: string) => string): Option[] => {
  if (tipo === "ABIERTA") return [];
  if (tipo === "VERDADERO_FALSO") return [{ texto: t("verdadero"), esCorrecta: true }, { texto: t("falso"), esCorrecta: false }];
  return [{ texto: "", esCorrecta: true }, { texto: "", esCorrecta: false }];
};

/** Alta/edición de reactivo con opciones según el tipo (M14 §4.1–4.5). */
export default function QuestionFormDialog({ isOpen, question, onClose, onSaved }: Props) {
  const { t } = useTranslation(["exams", "common"]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseId, setCourseId] = useState("");
  const [tipo, setTipo] = useState<QuestionType>("OPCION_MULTIPLE");
  const [tema, setTema] = useState("");
  const [enunciado, setEnunciado] = useState("");
  const [puntos, setPuntos] = useState("1");
  const [dificultad, setDificultad] = useState<Difficulty | "">("");
  const [options, setOptions] = useState<Option[]>([]);
  const [errors, setErrors] = useState<{ courseId?: string; enunciado?: string; puntos?: string; options?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tf = (key: string) => (key === "verdadero" ? "Verdadero" : "Falso");

  useEffect(() => {
    if (!isOpen) return;
    courseApi.options().then(setCourses).catch(() => setCourses([]));
    setCourseId(question?.courseId ?? "");
    setTipo(question?.tipo ?? "OPCION_MULTIPLE");
    setTema(question?.tema ?? "");
    setEnunciado(question?.enunciado ?? "");
    setPuntos(String(question?.puntos ?? 1));
    setDificultad(question?.dificultad ?? "");
    setOptions(question ? question.options.map((o) => ({ texto: o.texto, esCorrecta: o.esCorrecta })) : defaultOptions("OPCION_MULTIPLE", tf));
    setErrors({});
    setError(null);
  }, [question, isOpen]);

  const changeType = (next: QuestionType) => {
    setTipo(next);
    setOptions(defaultOptions(next, tf));
  };
  const setOption = (index: number, patch: Partial<Option>) =>
    setOptions((prev) =>
      prev.map((o, i) => {
        if (i === index) return { ...o, ...patch };
        // En opción múltiple y V/F marcar una desmarca las demás.
        if (patch.esCorrecta && (tipo === "OPCION_MULTIPLE" || tipo === "VERDADERO_FALSO")) return { ...o, esCorrecta: false };
        return o;
      })
    );

  const save = async () => {
    const points = Number(puntos);
    const next = {
      courseId: question ? undefined : validateRequired(courseId, t("questions.curso")) ?? undefined,
      enunciado: validateRequired(enunciado, t("questions.enunciado")) ?? undefined,
      puntos: points > 0 ? undefined : t("common:validation.required", { label: t("questions.puntos") }),
      options: tipo !== "ABIERTA" && (options.some((o) => !o.texto.trim()) || !options.some((o) => o.esCorrecta))
        ? t("questions.opciones")
        : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    setError(null);
    const data = {
      tema: tema.trim() || null,
      tipo,
      enunciado: enunciado.trim(),
      puntos: points,
      dificultad: dificultad || null,
      options: options.map((o) => ({ texto: o.texto.trim(), esCorrecta: o.esCorrecta })),
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
  const fixedCount = tipo === "VERDADERO_FALSO";
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-3xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          {question?.locked && <ITAlert variant="warning">{t("questions.locked")}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="courseId" label={t("questions.curso")} value={courseId} disabled={!!question} error={errors.courseId} placeholder="—"
                options={courses.map((c) => ({ value: c.id, label: `${c.clave} · ${c.nombre}` }))} onChange={(e) => setCourseId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="tipo" label={t("questions.tipo")} value={tipo}
                options={QUESTION_TYPES.map((x) => ({ value: x, label: t(`questions.types.${x}`) }))} onChange={(e) => changeType(e.target.value as QuestionType)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="enunciado" label={t("questions.enunciado")} value={enunciado} onChange={setEnunciado} rows={3} maxLength={5000} error={errors.enunciado} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="tema" label={t("questions.tema")} value={tema} onChange={(e) => setTema(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="puntos" type="number" label={t("questions.puntos")} value={puntos} required error={errors.puntos} onChange={(e) => setPuntos(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITSelect name="dificultad" label={t("questions.dificultad")} value={dificultad} placeholder="—"
                options={DIFFICULTIES.map((d) => ({ value: d, label: t(`questions.difficulties.${d}`) }))} onChange={(e) => setDificultad(e.target.value as Difficulty)} />
            </ITGrid>
          </ITGrid>
          {tipo === "ABIERTA" ? (
            <ITText className="text-[12px] text-slate-500">{t("questions.openHint")}</ITText>
          ) : (
            <div data-role="options-editor">
              <ITFlex justify="between" align="center" className="mb-2">
                <ITText className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t("questions.opciones")}</ITText>
                {!fixedCount && options.length < 10 && (
                  <ITButton variant="text" color="primary" size="sm" onClick={() => setOptions((prev) => [...prev, { texto: "", esCorrecta: false }])}>
                    <ITFlex align="center" gap={1}><FaPlus size={10} /><ITText className="text-[11px] font-bold">{t("questions.addOption")}</ITText></ITFlex>
                  </ITButton>
                )}
              </ITFlex>
              <ITFlex direction="column" gap={2}>
                {options.map((o, i) => (
                  <ITFlex key={i} align="center" gap={2}>
                    <ITCheckbox name={`correcta-${i}`} checked={o.esCorrecta} label={t("questions.correcta")} onChange={(checked) => setOption(i, { esCorrecta: checked })} />
                    <div className="flex-1">
                      <ITInput name={`opcion-${i}`} value={o.texto} disabled={fixedCount} onChange={(e) => setOption(i, { texto: e.target.value })} />
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
