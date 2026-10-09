import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITFlex, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { FaPlus, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { courseApi, type CourseOption } from "@entities/course";
import { programApi, type ProgramDetail, type ProgramSubjectInput } from "@entities/program";
import { PanelCard } from "@shared/ui/panel-card";

interface Props {
  program: ProgramDetail;
  readOnly?: boolean;
  onSaved: () => void;
}

/** Editor del plan de estudios: materias (cursos) por periodo (M22). */
export default function StudyPlanEditor({ program, readOnly, onSaved }: Props) {
  const { t } = useTranslation(["programs", "common"]);
  const notify = useNotify();
  const [options, setOptions] = useState<CourseOption[]>([]);
  const [rows, setRows] = useState<ProgramSubjectInput[]>([]);
  const [pick, setPick] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    courseApi.options().then(setOptions).catch(() => setOptions([]));
  }, []);

  useEffect(() => {
    setRows(program.subjectsList.map((s) => ({ courseId: s.courseId, periodIndex: s.periodIndex, sortOrder: s.sortOrder })));
    setPick({});
  }, [program]);

  const nameOf = (courseId: string) => {
    const option = options.find((o) => o.id === courseId);
    return option ? `${option.clave} · ${option.nombre}` : courseId;
  };

  const add = (periodIndex: number) => {
    const courseId = pick[periodIndex];
    if (!courseId) return;
    if (rows.some((r) => r.courseId === courseId)) {
      setError(t("plan.alreadyInPlan"));
      return;
    }
    setError(null);
    setRows((prev) => [...prev, { courseId, periodIndex, sortOrder: prev.filter((r) => r.periodIndex === periodIndex).length }]);
    setPick((prev) => ({ ...prev, [periodIndex]: "" }));
  };

  const remove = (courseId: string) => setRows((prev) => prev.filter((r) => r.courseId !== courseId));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await programApi.setSubjects(program.id, rows);
      notify.success(t("plan.saved"));
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const available = options.filter((o) => !rows.some((r) => r.courseId === o.id));

  return (
    <PanelCard
      title={t("plan.title")}
      description={t("plan.description")}
      actions={
        !readOnly && (
          <ITButton variant="filled" color="primary" disabled={saving} onClick={() => void save()}>
            <ITText className="text-[11px] font-bold">{t("plan.save")}</ITText>
          </ITButton>
        )
      }
    >
      <ITFlex direction="column" gap={4}>
        {error && <ITAlert variant="error">{error}</ITAlert>}
        {Array.from({ length: program.periodCount }, (_, i) => i + 1).map((periodIndex) => {
          const periodRows = rows.filter((r) => r.periodIndex === periodIndex).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          return (
            <div key={periodIndex} className="rounded-xl border border-slate-200 p-3">
              <ITText className="mb-2 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                {t("plan.period", { n: periodIndex })}
              </ITText>
              <ITFlex direction="column" gap={2}>
                {periodRows.length === 0 && <ITText className="text-[12px] text-slate-400">{t("plan.emptyPeriod")}</ITText>}
                {periodRows.map((row) => (
                  <ITFlex key={row.courseId} justify="between" align="center" className="rounded-lg bg-slate-50 px-3 py-1.5">
                    <ITText className="text-[12px] text-slate-700">{nameOf(row.courseId)}</ITText>
                    {!readOnly && (
                      <ITButton variant="text" color="danger" size="sm" ariaLabel={`${t("plan.remove")} ${nameOf(row.courseId)}`} onClick={() => remove(row.courseId)}>
                        <FaTrash size={11} />
                      </ITButton>
                    )}
                  </ITFlex>
                ))}
                {!readOnly && (
                  <ITFlex gap={2} align="end">
                    <div className="min-w-52 flex-1">
                      <ITSelect
                        name={`course-${periodIndex}`}
                        label={t("plan.addCourse")}
                        value={pick[periodIndex] ?? ""}
                        placeholder="—"
                        options={available.map((o) => ({ value: o.id, label: `${o.clave} · ${o.nombre}` }))}
                        onChange={(e) => setPick((prev) => ({ ...prev, [periodIndex]: e.target.value }))}
                      />
                    </div>
                    <ITButton variant="outlined" color="primary" size="sm" disabled={!pick[periodIndex]} onClick={() => add(periodIndex)}>
                      <ITFlex align="center" gap={1}><FaPlus size={10} /><ITText className="text-[11px] font-bold">{t("common:actions.add")}</ITText></ITFlex>
                    </ITButton>
                  </ITFlex>
                )}
              </ITFlex>
            </div>
          );
        })}
      </ITFlex>
    </PanelCard>
  );
}
