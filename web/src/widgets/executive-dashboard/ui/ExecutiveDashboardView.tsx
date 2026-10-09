import { useEffect, useState } from "react";
import { ITAlert, ITLoader } from "@axzydev/axzy_ui_system";
import { FaChartPie, FaCheckCircle, FaExclamationTriangle, FaGraduationCap, FaMoneyBillWave, FaUserGraduate, FaUserMinus } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { reportApi, type ExecutiveDashboard, type ExecutiveFilters, type Indicator } from "@entities/report";
import { formatMoney } from "@shared/lib/money";
import { BarChart, ProgressList } from "@shared/ui/charts";
import { KpiTile } from "@shared/ui/kpi-tile";
import { PanelCard } from "@shared/ui/panel-card";

type Unit = "count" | "percent" | "money" | "grade";

/** Tablero ejecutivo (M21): indicadores del ciclo frente al anterior, con el alcance de la persona. */
export default function ExecutiveDashboardView({ filters }: { filters: ExecutiveFilters }) {
  const { t, i18n } = useTranslation(["reports", "common"]);
  const [data, setData] = useState<ExecutiveDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { termId, levelId, courseId, groupId } = filters;

  useEffect(() => {
    setError(null);
    reportApi
      .executive({ termId, levelId, courseId, groupId })
      .then(setData)
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [termId, levelId, courseId, groupId, t]);

  if (error) return <ITAlert variant="error">{error}</ITAlert>;
  if (!data) return <ITLoader />;
  if (!data.term) return <ITAlert variant="info">{t("executive.noTerm")}</ITAlert>;

  const show = (value: number | null, unit: Unit): string => {
    if (value === null) return "—";
    if (unit === "money") return formatMoney(value, i18n.language);
    if (unit === "percent") return `${value}%`;
    return String(value);
  };
  /** «+2 vs. Ciclo 2025» o el aviso de que no hay con qué comparar. */
  const versus = (item: Indicator, unit: Unit): string => {
    if (item.delta === null || !data.previousTerm) return t("executive.noPrevious");
    const sign = item.delta > 0 ? "+" : "";
    const delta = unit === "money" ? `${sign}${formatMoney(item.delta, i18n.language)}` : `${sign}${item.delta}${unit === "percent" ? " pp" : ""}`;
    return t("executive.versus", { delta, term: data.previousTerm.name });
  };
  const { indicators } = data;

  return (
    <div className="flex flex-col gap-4" data-role="executive-dashboard">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label={t("executive.enrolledCount")} value={show(indicators.enrolledCount.value, "count")} icon={<FaUserGraduate size={16} />} tone="sky"
          hint={versus(indicators.enrolledCount, "count")} />
        <KpiTile label={t("executive.dropoutRate")} value={show(indicators.dropoutRate.value, "percent")} icon={<FaUserMinus size={16} />} tone="rose"
          hint={versus(indicators.dropoutRate, "percent")} />
        <KpiTile label={t("executive.passRate")} value={show(indicators.passRate.value, "percent")} icon={<FaCheckCircle size={16} />} tone="emerald"
          hint={versus(indicators.passRate, "percent")} />
        <KpiTile label={t("executive.averageGrade")} value={show(indicators.averageGrade.value, "grade")} icon={<FaGraduationCap size={16} />} tone="violet"
          hint={versus(indicators.averageGrade, "grade")} />
        <KpiTile label={t("executive.occupancy")} value={show(indicators.occupancy.value, "percent")} icon={<FaChartPie size={16} />} tone="amber"
          hint={versus(indicators.occupancy, "percent")} />
      </div>

      {indicators.delinquencyRate && indicators.pendingAmount && indicators.collected && indicators.projected && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-role="executive-finance">
          <KpiTile label={t("executive.delinquencyRate")} value={show(indicators.delinquencyRate.value, "percent")} icon={<FaExclamationTriangle size={16} />} tone="orange"
            hint={versus(indicators.delinquencyRate, "percent")} />
          <KpiTile label={t("executive.pendingAmount")} value={show(indicators.pendingAmount.value, "money")} icon={<FaExclamationTriangle size={16} />} tone="rose"
            hint={versus(indicators.pendingAmount, "money")} />
          <KpiTile label={t("executive.collected")} value={show(indicators.collected.value, "money")} icon={<FaMoneyBillWave size={16} />} tone="emerald"
            hint={t("executive.projected", { amount: show(indicators.projected.value, "money") })} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PanelCard title={t("executive.trendChart")}>
          <BarChart
            ariaLabel={t("executive.trendChart")}
            data={data.enrollmentTrend.map((term) => ({ label: term.termName, value: term.initialCount }))}
          />
        </PanelCard>
        <PanelCard title={t("executive.dropoutChart")}>
          <BarChart
            ariaLabel={t("executive.dropoutChart")}
            color="#e11d48"
            max={100}
            data={data.enrollmentTrend.map((term) => ({ label: term.termName, value: term.dropoutRate, display: `${term.dropoutRate}%` }))}
          />
        </PanelCard>
      </div>

      {data.incomeVsProjection && (
        <PanelCard title={t("executive.incomeChart")}>
          {data.incomeVsProjection.length === 0 ? (
            <p className="text-[12px] text-slate-500">{t("executive.noIncome")}</p>
          ) : (
            <ProgressList
              items={data.incomeVsProjection.map((month) => ({
                id: month.month,
                label: month.month,
                hint: `${formatMoney(month.collected, i18n.language)} / ${formatMoney(month.projected, i18n.language)}`,
                ratio: month.projected > 0 ? Math.min(month.collected / month.projected, 1) : 0,
              }))}
            />
          )}
        </PanelCard>
      )}
    </div>
  );
}
