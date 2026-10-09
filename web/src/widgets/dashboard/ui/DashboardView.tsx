import { useEffect, useState } from "react";
import { ITAlert, ITLoader } from "@axzydev/axzy_ui_system";
import { FaChartPie, FaExclamationTriangle, FaMoneyBillWave, FaUserGraduate } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { reportApi, type Dashboard } from "@entities/report";
import { formatMoney } from "@shared/lib/money";
import { BarChart, ProgressList } from "@shared/ui/charts";
import { KpiTile } from "@shared/ui/kpi-tile";
import { PanelCard } from "@shared/ui/panel-card";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Tablero (M10): KPIs y gráficas con el alcance de la persona. */
export default function DashboardView() {
  const { t, i18n } = useTranslation(["reports", "common"]);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reportApi.dashboard().then(setData).catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [t]);

  if (error) return <ITAlert variant="error">{error}</ITAlert>;
  if (!data) return <ITLoader />;

  const money = (v: number | null) => formatMoney(v, i18n.language);
  const compact = (v: number) =>
    new Intl.NumberFormat(i18n.language.startsWith("en") ? "en-US" : "es-MX", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  const months = i18n.language.startsWith("en") ? MONTHS_EN : MONTHS_ES;
  const finance = data.monthIncome !== null;

  return (
    <div className="flex flex-col gap-4" data-role="dashboard">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label={t("dashboard.activeStudents")} value={data.activeStudents} icon={<FaUserGraduate size={16} />} tone="sky"
          hint={t("dashboard.inactiveStudents", { count: data.inactiveStudents })} />
        <KpiTile label={t("dashboard.occupancy")} value={`${Math.round(data.groupOccupancy.average * 100)}%`} icon={<FaChartPie size={16} />} tone="violet"
          hint={data.termNombre ? t("dashboard.groups", { count: data.groupOccupancy.groups.length, term: data.termNombre }) : t("dashboard.noTerm")} />
        {finance && (
          <KpiTile label={t("dashboard.monthIncome")} value={money(data.monthIncome)} icon={<FaMoneyBillWave size={16} />} tone="emerald" />
        )}
        {finance && (
          <KpiTile label={t("dashboard.totalDebt")} value={money(data.totalDebt)} icon={<FaExclamationTriangle size={16} />} tone="rose"
            hint={t("dashboard.overdue", { amount: money(data.overdueDebt) })} />
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {finance && data.incomeByMonth && (
          <PanelCard title={t("dashboard.incomeChart")}>
            <BarChart
              ariaLabel={t("dashboard.incomeChart")}
              color="#10b981"
              data={data.incomeByMonth.map((m) => ({
                label: months[Number(m.month.slice(5, 7)) - 1],
                value: m.total,
                display: m.total ? compact(m.total) : "0",
              }))}
            />
          </PanelCard>
        )}
        <PanelCard title={t("dashboard.occupancyChart")}>
          {data.groupOccupancy.groups.length === 0 ? (
            <p className="text-[12px] text-slate-500">{t("dashboard.noGroups")}</p>
          ) : (
            <ProgressList
              items={data.groupOccupancy.groups.map((g) => ({
                id: g.groupId,
                label: `${g.curso} · ${g.name}`,
                hint: `${g.inscritos}/${g.capacity}`,
                ratio: g.ratio,
              }))}
            />
          )}
        </PanelCard>
      </div>
    </div>
  );
}
