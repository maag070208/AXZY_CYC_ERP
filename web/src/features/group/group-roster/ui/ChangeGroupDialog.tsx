import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { enrollmentApi, groupApi, type Enrollment, type Group } from "@entities/group";
import { errorMessage } from "@app/toast/useNotify";

interface Props {
  group: Group;
  enrollment: Enrollment | null;
  onClose: () => void;
  onChanged: (enrollment: Enrollment) => void;
}

/** Cambio atómico a otro grupo abierto del mismo curso y ciclo. */
export default function ChangeGroupDialog({ group, enrollment, onClose, onChanged }: Props) {
  const { t } = useTranslation(["courses", "common"]);
  const [targets, setTargets] = useState<Group[]>([]);
  const [toGroupId, setToGroupId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enrollment) return;
    setToGroupId("");
    setError(null);
    groupApi
      .options({ termId: group.termId, courseId: group.courseId })
      .then((list) => setTargets(list.filter((g) => g.id !== group.id)))
      .catch(() => setTargets([]));
  }, [enrollment, group]);

  const save = async () => {
    if (!enrollment || !toGroupId) return;
    setSaving(true);
    setError(null);
    try {
      onChanged(await enrollmentApi.changeGroup(enrollment.id, toGroupId));
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = t("enrollments.changeTitle", { name: enrollment?.studentNombre ?? "" });
  return (
    <ITDialog isOpen={!!enrollment} onClose={onClose} title={title} className="w-full max-w-lg">
      <div role="dialog" aria-label={title}>
        <ITFlex direction="column" gap={3}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITText className="text-[12px] text-slate-500">{t("enrollments.changeHint")}</ITText>
          {targets.length === 0 ? (
            <ITAlert variant="info">{t("enrollments.noTargets")}</ITAlert>
          ) : (
            <ITSelect name="toGroupId" label={t("enrollments.toGroup")} value={toGroupId} placeholder="—"
              options={targets.map((g) => ({ value: g.id, label: `${g.name} · ${g.inscritos}/${g.capacity} · ${g.teacherNombre ?? t("groups.noTeacher")}` }))}
              onChange={(e) => setToGroupId(e.target.value)} />
          )}
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton variant="filled" color="primary" disabled={!toGroupId || saving} onClick={() => void save()}>
              {t("enrollments.changeGroup")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </div>
    </ITDialog>
  );
}
