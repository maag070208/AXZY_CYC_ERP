import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITGrid, ITInput, ITSelect } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { groupApi, type Group, type ScheduleSlot } from "@entities/group";
import { courseApi, type CourseOption } from "@entities/course";
import { termsApi, type Term } from "@entities/config";
import { teacherApi, type Teacher } from "@entities/teacher";
import { errorMessage } from "@app/toast/useNotify";
import { validateRequired } from "@shared/validation";
import { scheduleError } from "../model/schedule";
import ScheduleEditor from "./ScheduleEditor";

interface Props {
  isOpen: boolean;
  group: Group | null;
  onClose: () => void;
  onSaved: (group: Group, created: boolean) => void;
}

type Field = "courseId" | "termId" | "nombre" | "cupo";

/** Alta y edición de un grupo: curso, ciclo, profesor, cupo, aula y horario. */
export default function GroupFormDialog({ isOpen, group, onClose, onSaved }: Props) {
  const { t } = useTranslation(["courses", "common"]);
  const [courseId, setCourseId] = useState("");
  const [termId, setTermId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [nombre, setNombre] = useState("");
  const [cupo, setCupo] = useState("30");
  const [aula, setAula] = useState("");
  const [horario, setHorario] = useState<ScheduleSlot[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [errors, setErrors] = useState<Partial<Record<Field | "horario", string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCourseId(group?.courseId ?? "");
    setTermId(group?.termId ?? "");
    setTeacherId(group?.teacherId ?? "");
    setNombre(group?.nombre ?? "");
    setCupo(String(group?.cupo ?? 30));
    setAula(group?.aula ?? "");
    setHorario(group?.horario ?? [{ dia: "LUNES", horaInicio: "08:00", horaFin: "09:00" }]);
    setErrors({});
    setError(null);
    courseApi.options().then(setCourses).catch(() => setCourses([]));
    termsApi.options().then((list) => {
      setTerms(list);
      if (!group) setTermId((current) => current || list.find((term) => term.active)?.id || "");
    }).catch(() => setTerms([]));
    teacherApi
      .table({ page: 1, limit: 200, filters: { status: "ACTIVO" }, sort: { key: "nombre", direction: "asc" } })
      .then((res) => setTeachers(res.data))
      .catch(() => setTeachers([]));
  }, [group, isOpen]);

  const save = async () => {
    const cupoNumber = Number(cupo);
    const slotError = scheduleError(horario);
    const next: Partial<Record<Field | "horario", string>> = {
      courseId: validateRequired(courseId, t("groups.curso")) ?? undefined,
      termId: validateRequired(termId, t("groups.ciclo")) ?? undefined,
      nombre: validateRequired(nombre, t("groups.nombre")) ?? undefined,
      cupo: Number.isInteger(cupoNumber) && cupoNumber >= 1 ? undefined : t("common:validation.required", { label: t("groups.cupo") }),
      horario: slotError ? t(`groups.${slotError}`) : undefined,
    };
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (!next[key]) delete next[key];
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setError(null);
    const common = { teacherId: teacherId || null, nombre: nombre.trim(), cupo: cupoNumber, aula: aula.trim() || null, horario };
    try {
      if (group) onSaved(await groupApi.update(group.id, common), false);
      else onSaved(await groupApi.create({ ...common, courseId, termId }), true);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = group ? t("groups.titleEdit") : t("groups.titleNew");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-3xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="courseId" label={t("groups.curso")} value={courseId} disabled={!!group} error={errors.courseId}
                placeholder="—" options={courses.map((c) => ({ value: c.id, label: `${c.clave} · ${c.nombre}` }))}
                onChange={(e) => setCourseId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="termId" label={t("groups.ciclo")} value={termId} disabled={!!group} error={errors.termId}
                placeholder="—" options={terms.map((term) => ({ value: term.id, label: term.name }))}
                onChange={(e) => setTermId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="nombre" label={t("groups.nombre")} value={nombre} required error={errors.nombre}
                onChange={(e) => setNombre(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="cupo" type="number" label={t("groups.cupo")} value={cupo} required error={errors.cupo}
                onChange={(e) => setCupo(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="aula" label={t("groups.aula")} value={aula} onChange={(e) => setAula(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITSelect name="teacherId" label={t("groups.profesor")} value={teacherId} placeholder={t("groups.noTeacher")}
                options={teachers.map((x) => ({ value: x.id, label: x.nombreCompleto }))}
                onChange={(e) => setTeacherId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ScheduleEditor value={horario} onChange={setHorario} error={errors.horario} />
            </ITGrid>
          </ITGrid>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>
              {saving ? t("common:actions.saving") : t("common:actions.save")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
