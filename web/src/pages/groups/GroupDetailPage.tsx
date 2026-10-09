import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ITButton, ITDialog, ITFlex, ITGrid, ITPage, ITStatCard, ITTabs, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { FaChair, FaEdit, FaLayerGroup, FaUserPlus, FaUsers } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { enrollmentApi, groupApi, type Enrollment, type Group } from "@entities/group";
import { GroupStatusBadge, ScheduleSummary } from "@features/group/groups-list";
import { GroupFormDialog } from "@features/group/group-form";
import { ChangeGroupDialog, EnrollDialog, EnrollmentsTable, type EnrollmentAction } from "@features/group/group-roster";
import { AssessmentsPanel } from "@features/grades/manage-assessments";
import { GradebookGrid } from "@features/grades/capture-grades";
import { PanelCard } from "@shared/ui/panel-card";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <ITText className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</ITText>
      <div className="text-[13px] text-slate-700">{value || "—"}</div>
    </div>
  );
}

/** `/groups/:id`: datos del grupo, alumnos inscritos y calificaciones (M07/M08). */
export default function GroupDetailPage() {
  const { t } = useTranslation(["courses", "grades", "common"]);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotify();
  const canManage = useCan("groups.manage");
  const canRoster = useCan("enrollments.view");
  const canEnroll = useCan("enrollments.create");
  const canChange = useCan("enrollments.edit");
  const canDrop = useCan("enrollments.delete");
  const canGrades = useCan("grades.view");
  const canAssess = useCan("assessments.manage");
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [changing, setChanging] = useState<Enrollment | null>(null);
  const [dropping, setDropping] = useState<Enrollment | null>(null);
  const [motivo, setMotivo] = useState("");

  const load = useCallback(() => {
    if (!id) return;
    groupApi
      .get(id)
      .then((g) => {
        setGroup(g);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [id, t]);
  useEffect(load, [load, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);
  const g = group;
  const open = !!g && g.active && !g.closedAt;

  const onAction = (action: EnrollmentAction, enrollment: Enrollment) => {
    if (action === "change") setChanging(enrollment);
    else {
      setMotivo("");
      setDropping(enrollment);
    }
  };

  const drop = async () => {
    if (!dropping) return;
    try {
      await enrollmentApi.drop(dropping.id, motivo.trim() || undefined);
      notify.success(t("enrollments.dropped"));
      setDropping(null);
      refresh();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const roster = g && (
    <ITFlex direction="column" gap={3}>
      {canEnroll && open && (
        <ITFlex justify="end">
          <ITButton variant="filled" color="primary" disabled={g.disponibles === 0} onClick={() => setEnrollOpen(true)}>
            <ITFlex align="center" gap={1}><FaUserPlus size={11} /><ITText className="text-[11px] font-bold">{t("enrollments.enroll")}</ITText></ITFlex>
          </ITButton>
        </ITFlex>
      )}
      <EnrollmentsTable
        filter={{ groupId: g.id }}
        reloadKey={reloadKey}
        onAction={open ? onAction : undefined}
        canChange={canChange}
        canDrop={canDrop}
      />
    </ITFlex>
  );

  const grades = g && (
    <ITFlex direction="column" gap={4}>
      <AssessmentsPanel groupId={g.id} readOnly={!canAssess || !open} reloadKey={reloadKey} onChanged={refresh} />
      <GradebookGrid groupId={g.id} reloadKey={reloadKey} onClosed={refresh} />
    </ITFlex>
  );

  const dropTitle = t("enrollments.dropTitle", { name: dropping?.studentNombre ?? "" });
  return (
    <ITPage
      title={g ? t("groups.detailTitle", { course: g.courseNombre, name: g.nombre }) : t("groups.title")}
      description={g ? `${g.courseClave} · ${g.termNombre}` : undefined}
      icon={<FaLayerGroup size={20} />}
      loading={!g && !error}
      error={error}
      backAction={() => navigate("/groups")}
      actions={
        g && (
          <ITFlex gap={2} align="center">
            <GroupStatusBadge group={g} />
            {canManage && !g.closedAt && (
              <ITButton variant="outlined" color="primary" onClick={() => setEditOpen(true)}>
                <ITFlex align="center" gap={1}><FaEdit size={11} /><ITText className="text-[11px] font-bold">{t("common:actions.edit")}</ITText></ITFlex>
              </ITButton>
            )}
          </ITFlex>
        )
      }
    >
      {g && (
        <ITFlex direction="column" gap={4}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ITStatCard label={t("groups.kpis.cupo")} value={g.cupo} icon={<FaChair size={16} />} />
            <ITStatCard label={t("groups.kpis.inscritos")} value={g.inscritos} icon={<FaUsers size={16} />} />
            <ITStatCard label={t("groups.kpis.disponibles")} value={g.disponibles} icon={<FaUserPlus size={16} />} />
          </div>
          <PanelCard>
            <ITGrid container columns={12} spacing={4}>
              <ITGrid item xs={12} md={4}><Field label={t("groups.profesor")} value={g.teacherNombre ?? t("groups.noTeacher")} /></ITGrid>
              <ITGrid item xs={12} md={5}><Field label={t("groups.horario")} value={<ScheduleSummary slots={g.horario} />} /></ITGrid>
              <ITGrid item xs={12} md={3}><Field label={t("groups.aula")} value={g.aula} /></ITGrid>
            </ITGrid>
          </PanelCard>
          <ITTabs
            items={[
              ...(canRoster ? [{ id: "roster", label: t("groups.tabs.roster"), content: roster }] : []),
              ...(canGrades ? [{ id: "grades", label: t("groups.tabs.grades"), content: grades }] : []),
            ]}
          />
        </ITFlex>
      )}
      {g && (
        <>
          <GroupFormDialog
            isOpen={editOpen}
            group={g}
            onClose={() => setEditOpen(false)}
            onSaved={() => {
              setEditOpen(false);
              notify.success(t("groups.saved"));
              refresh();
            }}
          />
          <EnrollDialog
            group={enrollOpen ? g : null}
            onClose={() => setEnrollOpen(false)}
            onEnrolled={(enrollment) => {
              setEnrollOpen(false);
              notify.success(t("enrollments.enrolled", { name: enrollment.studentNombre }));
              refresh();
            }}
          />
          <ChangeGroupDialog
            group={g}
            enrollment={changing}
            onClose={() => setChanging(null)}
            onChanged={() => {
              setChanging(null);
              notify.success(t("enrollments.changed"));
              refresh();
            }}
          />
          <ITDialog isOpen={!!dropping} onClose={() => setDropping(null)} title={dropTitle} className="w-full max-w-lg">
            <div role="dialog" aria-label={dropTitle}>
              <ITFlex direction="column" gap={4}>
                <ITTextarea name="motivo" label={t("enrollments.dropMotivo")} value={motivo} onChange={setMotivo} rows={3} maxLength={500} />
                <ITFlex justify="end" gap={2}>
                  <ITButton variant="outlined" color="secondary" onClick={() => setDropping(null)}>{t("common:actions.cancel")}</ITButton>
                  <ITButton variant="filled" color="danger" onClick={() => void drop()}>{t("enrollments.drop")}</ITButton>
                </ITFlex>
              </ITFlex>
            </div>
          </ITDialog>
        </>
      )}
    </ITPage>
  );
}
