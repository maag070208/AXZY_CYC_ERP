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

type Field = "courseId" | "termId" | "name" | "capacity";

/** Alta y edición de un grupo: curso, ciclo, profesor, cupo, aula y horario. */
export default function GroupFormDialog({ isOpen, group, onClose, onSaved }: Props) {
  const { t } = useTranslation(["courses", "common"]);
  const [courseId, setCourseId] = useState("");
  const [termId, setTermId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("30");
  const [classroom, setClassroom] = useState("");
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [errors, setErrors] = useState<Partial<Record<Field | "schedule", string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCourseId(group?.courseId ?? "");
    setTermId(group?.termId ?? "");
    setTeacherId(group?.teacherId ?? "");
    setName(group?.name ?? "");
    setCapacity(String(group?.capacity ?? 30));
    setClassroom(group?.classroom ?? "");
    setSchedule(group?.schedule ?? [{ day: "MONDAY", startTime: "08:00", endTime: "09:00" }]);
    setErrors({});
    setError(null);
    courseApi.options().then(setCourses).catch(() => setCourses([]));
    termsApi.options().then((list) => {
      setTerms(list);
      if (!group) setTermId((current) => current || list.find((term) => term.active)?.id || "");
    }).catch(() => setTerms([]));
    teacherApi
      .table({ page: 1, limit: 200, filters: { status: "ACTIVE" }, sort: { key: "name", direction: "asc" } })
      .then((res) => setTeachers(res.data))
      .catch(() => setTeachers([]));
  }, [group, isOpen]);

  const save = async () => {
    const capacityNumber = Number(capacity);
    const slotError = scheduleError(schedule);
    const next: Partial<Record<Field | "schedule", string>> = {
      courseId: validateRequired(courseId, t("groups.courseName")) ?? undefined,
      termId: validateRequired(termId, t("groups.termName")) ?? undefined,
      name: validateRequired(name, t("groups.name")) ?? undefined,
      capacity: Number.isInteger(capacityNumber) && capacityNumber >= 1 ? undefined : t("common:validation.required", { label: t("groups.capacity") }),
      schedule: slotError ? t(`groups.${slotError}`) : undefined,
    };
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (!next[key]) delete next[key];
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setError(null);
    const common = { teacherId: teacherId || null, name: name.trim(), capacity: capacityNumber, classroom: classroom.trim() || null, schedule };
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
              <ITSelect name="courseId" label={t("groups.courseName")} value={courseId} disabled={!!group} error={errors.courseId}
                placeholder="—" options={courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
                onChange={(e) => setCourseId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="termId" label={t("groups.termName")} value={termId} disabled={!!group} error={errors.termId}
                placeholder="—" options={terms.map((term) => ({ value: term.id, label: term.name }))}
                onChange={(e) => setTermId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="name" label={t("groups.name")} value={name} required error={errors.name}
                onChange={(e) => setName(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="capacity" type="number" label={t("groups.capacity")} value={capacity} required error={errors.capacity}
                onChange={(e) => setCapacity(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="classroom" label={t("groups.classroom")} value={classroom} onChange={(e) => setClassroom(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITSelect name="teacherId" label={t("groups.teacherName")} value={teacherId} placeholder={t("groups.noTeacher")}
                options={teachers.map((x) => ({ value: x.id, label: x.fullName }))}
                onChange={(e) => setTeacherId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ScheduleEditor value={schedule} onChange={setSchedule} error={errors.schedule} />
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
