import { useCallback, useEffect, useState } from "react";
import { ITAlert, ITBadget, ITFlex, ITLoader, ITTable, ITText } from "@axzydev/axzy_ui_system";
import type { Column } from "@axzydev/axzy_ui_system";
import { FaCheckCircle, FaExclamationTriangle, FaPercent, FaUserClock } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { attendanceApi, type AttendanceSummaryRow, type GroupAttendanceSummary } from "@entities/attendance";
import { KpiTile } from "@shared/ui/kpi-tile";
import { PanelCard } from "@shared/ui/panel-card";

interface Props {
  groupId: string;
  reloadKey: number;
}

/** Porcentaje de asistencia por alumno y alerta por umbral (M18 §4.6). */
export default function GroupAttendanceSummary({ groupId, reloadKey }: Props) {
  const { t } = useTranslation(["attendance", "common"]);
  const canView = useCan("attendance.view");
  const [data, setData] = useState<GroupAttendanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!canView) return;
    attendanceApi
      .summary(groupId)
      .then((summary) => {
        setData(summary);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [groupId, canView, t]);

  useEffect(load, [load, reloadKey]);

  if (!canView) return null;

  const columns: Column<AttendanceSummaryRow>[] = [
    {
      key: "name", label: t("summary.student"), type: "string",
      render: (r) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{r.name}</ITText>
          <ITText className="text-[10px] text-slate-400">{r.studentNumber}</ITText>
        </div>
      ),
    },
    { key: "sessions", label: t("summary.sessions"), type: "number", width: 90 },
    { key: "absences", label: t("summary.absences"), type: "number", width: 90 },
    { key: "justified", label: t("summary.justified"), type: "number", width: 110 },
    {
      key: "percentage", label: t("summary.percentage"), type: "number", width: 160, sortable: false,
      render: (r) => (
        <ITFlex align="center" gap={2}>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${r.alert ? "bg-rose-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.max(0, Math.min(100, r.percentage ?? 0))}%` }}
            />
          </div>
          <ITText className="text-[12px] tabular-nums text-slate-600">{r.percentage === null ? "—" : `${r.percentage}%`}</ITText>
        </ITFlex>
      ),
    },
    {
      key: "alert", label: t("summary.alert"), type: "string", width: 120,
      render: (r) => (r.alert ? <ITBadget color="danger" size="sm">{t("summary.inAlert")}</ITBadget> : <ITBadget color="success" size="sm">{t("summary.ok")}</ITBadget>),
    },
  ];

  return (
    <PanelCard title={t("summary.title")} description={t("summary.description", { threshold: data?.threshold ?? 0 })}>
      {error && <ITAlert variant="error">{error}</ITAlert>}
      {!data && !error && <ITLoader />}
      {data && (
        <ITFlex direction="column" gap={4}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label={t("summary.kpiSessions")} value={data.sessions} icon={<FaCheckCircle size={16} />} tone="sky" />
            <KpiTile label={t("summary.kpiAverage")} value={data.average === null ? "—" : `${data.average}%`} icon={<FaPercent size={16} />} tone="emerald" />
            <KpiTile label={t("summary.kpiThreshold")} value={`${data.threshold}%`} icon={<FaUserClock size={16} />} tone="violet" />
            <KpiTile label={t("summary.kpiAlert")} value={data.inAlert} icon={<FaExclamationTriangle size={16} />} tone={data.inAlert > 0 ? "rose" : "neutral"} />
          </div>
          {data.inAlert > 0 && <ITAlert variant="warning">{t("summary.alertHint", { count: data.inAlert })}</ITAlert>}
          {data.rows.length === 0 ? (
            <ITText className="block text-[12px] text-slate-500">{t("summary.empty")}</ITText>
          ) : (
            <ITTable
              columns={columns as unknown as Column<Record<string, unknown>>[]}
              data={data.rows as unknown as Record<string, unknown>[]}
              defaultItemsPerPage={25}
              density="compact"
            />
          )}
        </ITFlex>
      )}
    </PanelCard>
  );
}
