import { useCallback, useEffect, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITFlex, ITLoader, ITTable, ITText } from "@axzydev/axzy_ui_system";
import type { Column } from "@axzydev/axzy_ui_system";
import { FaCheck, FaExclamationTriangle } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { attendanceApi, type StudentAttendance, type StudentAttendanceRecord } from "@entities/attendance";
import { formatDay } from "@shared/lib/day";
import { PanelCard } from "@shared/ui/panel-card";
import { KpiTile } from "@shared/ui/kpi-tile";
import JustificationRequestDialog from "./JustificationRequestDialog";

interface Props {
  studentId: string;
  /** Nombre para los títulos (opcional). */
  studentName?: string;
  /** Alumno en BAJA: solo lectura. */
  readOnly?: boolean;
}

/** Asistencia del alumno por grupo con detalle y solicitud de justificante (M18). */
export default function StudentAttendancePanel({ studentId, studentName, readOnly }: Props) {
  const { t, i18n } = useTranslation(["attendance", "common"]);
  const canView = useCan("attendance.view");
  const canJustify = useCan("attendance.justify");
  const [data, setData] = useState<StudentAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [requesting, setRequesting] = useState<StudentAttendanceRecord | null>(null);

  const load = useCallback(() => {
    if (!canView) return;
    attendanceApi
      .student(studentId)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [studentId, canView, t]);

  useEffect(load, [load, reload]);

  if (!canView) return null;

  const columns: Column<StudentAttendanceRecord>[] = [
    {
      key: "date", label: t("student.date"), type: "string", width: 170,
      render: (r) => <ITText className="text-[12px] text-slate-600">{formatDay(r.date, i18n.language)}{r.time ? ` · ${r.time}` : ""}</ITText>,
    },
    {
      key: "status", label: t("student.state"), type: "string", width: 130,
      render: (r) => (
        <ITBadget color={r.status === "ABSENT" ? "danger" : r.status === "LATE" ? "warning" : "success"} size="sm">
          {t(`status.${r.status}`)}
        </ITBadget>
      ),
    },
    {
      key: "justification", label: t("student.justification"), type: "string", width: 200,
      render: (r) => (
        <ITFlex direction="column" gap={1}>
          {r.justification ? (
            <ITBadget color={r.justification.status === "APPROVED" ? "success" : r.justification.status === "REJECTED" ? "danger" : "warning"} size="sm">
              {t(`justificationStatus.${r.justification.status}`)}
            </ITBadget>
          ) : (
            <ITText className="text-[11px] text-slate-400">{r.status === "ABSENT" ? t("student.unjustified") : "—"}</ITText>
          )}
        </ITFlex>
      ),
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 120,
      actions: (r) => (
        canJustify && !readOnly && r.status === "ABSENT" && (!r.justification || r.justification.status === "REJECTED") ? (
          <ITButton variant="text" color="primary" size="sm" ariaLabel={`${t("justifications.request")} ${r.date}`} onClick={() => setRequesting(r)}>
            {t("justifications.request")}
          </ITButton>
        ) : null
      ),
    },
  ];

  return (
    <ITFlex direction="column" gap={4}>
      {error && <ITAlert variant="error">{error}</ITAlert>}
      {!data && !error && <ITLoader />}
      {data && data.groups.length === 0 && <ITAlert variant="info">{t("student.empty")}</ITAlert>}
      {data?.groups.map((group) => (
        <PanelCard key={group.groupId} title={`${group.courseName} · ${group.groupName}`} description={group.termName}>
          <ITFlex direction="column" gap={4}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile label={t("student.percentage")} value={group.percentage === null ? "—" : `${group.percentage}%`} icon={<FaCheck size={16} />} tone={group.alert ? "rose" : "emerald"} />
              <KpiTile label={t("student.absences")} value={group.absences} icon={<FaExclamationTriangle size={16} />} tone={group.absences > 0 ? "amber" : "neutral"} />
              <KpiTile label={t("student.lates")} value={group.lates} icon={<FaCheck size={16} />} tone="violet" />
              <KpiTile label={t("summary.kpiThreshold")} value={`${data.threshold}%`} icon={<FaCheck size={16} />} tone="sky" />
            </div>
            {group.alert && <ITAlert variant="warning">{t("student.alert")}</ITAlert>}
            <ITTable
              columns={columns as unknown as Column<Record<string, unknown>>[]}
              data={group.records as unknown as Record<string, unknown>[]}
              defaultItemsPerPage={10}
              density="compact"
            />
          </ITFlex>
        </PanelCard>
      ))}

      <JustificationRequestDialog
        isOpen={!!requesting}
        attendanceId={requesting?.attendanceId ?? null}
        studentName={studentName}
        onClose={() => setRequesting(null)}
        onSaved={() => {
          setRequesting(null);
          setReload((n) => n + 1);
        }}
      />
    </ITFlex>
  );
}
