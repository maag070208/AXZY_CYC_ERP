import { ITAlert, ITButton, ITLoader } from "@axzydev/axzy_ui_system";
import {
  FaArrowUp,
  FaBookOpen,
  FaCalendarAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaFileAlt,
  FaMoneyBillWave,
  FaRegClock,
  FaUsers,
  FaWallet,
} from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useCan } from "@entities/user";
import type { ExecutiveFilters, Indicator, RecentRow } from "@entities/report";
import { formatMoney } from "@shared/lib/money";
import { BarChart, DonutChart, IncomeExpenseChart, ProgressList } from "@shared/ui/charts";
import { KpiTile, type KpiTone } from "@shared/ui/kpi-tile";
import { PanelCard } from "@shared/ui/panel-card";
import { useDashboard } from "./useDashboard";

type Unit = "count" | "percent" | "money" | "grade";

const EMPTY = "—";
const MAX_LISTS = 5;

/** Botón «Ver todo →» del encabezado de un panel. */
function SeeAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ITButton variant="text" color="primary" onClick={onClick} className="!p-0!">
      {label}
    </ITButton>
  );
}

/** Lista compacta de renglones (alertas y tablas recientes). */
function RowList({ rows, tone }: { rows: Array<{ id: string; label: string; hint: string }>; tone?: string }) {
  return (
    <ul className="flex flex-col divide-y divide-slate-100">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <span className={`truncate text-[12px] font-semibold ${tone ?? "text-slate-700"}`}>{row.label}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{row.hint}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardView({ filters }: { filters: ExecutiveFilters }) {
  const { t, i18n } = useTranslation(["reports", "common"]);
  const navigate = useNavigate();
  const canExpenses = useCan("expenses.view");
  const canFinance = useCan("charges.view");
  const { data, error, loading, retry } = useDashboard(filters);
  const locale = i18n.language;

  if (error) {
    return (
      <ITAlert variant="error">
        <div className="flex items-center justify-between gap-3">
          <span>{error}</span>
          <ITButton variant="outlined" color="secondary" onClick={retry}>
            {t("common:actions.reload")}
          </ITButton>
        </div>
      </ITAlert>
    );
  }
  if (loading && !data) return <ITLoader />;
  if (!data) return <ITAlert variant="info">{t("home.noData")}</ITAlert>;
  if (!data.term) return <ITAlert variant="info">{t("executive.noTerm")}</ITAlert>;

  const value = (item: Indicator | null, unit: Unit): string => {
    const raw = item?.value ?? null;
    if (raw === null) return EMPTY;
    if (unit === "money") return formatMoney(raw, locale);
    if (unit === "percent") return `${raw}%`;
    return String(raw);
  };
  const versus = (item: Indicator | null, unit: Unit): string | undefined => {
    if (!item || item.delta === null || !data.previousTerm) return undefined;
    const sign = item.delta > 0 ? "+" : "";
    const delta =
      unit === "money"
        ? `${sign}${formatMoney(item.delta, locale)}`
        : `${sign}${item.delta}${unit === "percent" ? " pp" : ""}`;
    return t("executive.versus", { delta, term: data.previousTerm.name });
  };
  const { indicators, alerts } = data;
  const finance = indicators.collected !== null;

  const paymentRows = (data.recentPayments ?? []).slice(0, MAX_LISTS).map((row: RecentRow) => ({
    id: row.id,
    label: row.label,
    hint: row.amount === null ? row.date : formatMoney(row.amount, locale),
  }));
  const movementRows = data.recentMovements.slice(0, MAX_LISTS).map((row) => ({
    id: row.id,
    label: row.label,
    hint: `${t(`home.${row.tone === "warning" ? "withdrawal" : "reentry"}`)} · ${row.date}`,
  }));
  const riskRows = (alerts.overdueDebt?.students ?? []).map((row) => ({
    id: row.id,
    label: row.name,
    hint: `${formatMoney(row.amount, locale)} · ${t("home.daysOverdue", { count: row.days })}`,
  }));
  const documentRows = (alerts.pendingDocumentList ?? []).map((row) => ({
    id: row.id,
    label: `${row.studentName} · ${row.typeName}`,
    hint: t("home.daysWaiting", { count: row.days }),
  }));
  const fullGroupRows = (alerts.fullGroups?.groups ?? []).map((row) => ({
    id: row.groupId,
    label: row.label,
    hint: `${Math.round(row.ratio * 100)}%`,
  }));
  const alertBlocks: Array<{ id: string; title: string; hint: string; rows: Array<{ id: string; label: string; hint: string }>; tone: string; onSeeAll?: () => void }> = [];
  if (alerts.overdueDebt) {
    alertBlocks.push({
      id: "overdue",
      title: t("home.alertsOverdue"),
      hint: `${alerts.overdueDebt.count} · ${formatMoney(alerts.overdueDebt.amount, locale)}`,
      rows: riskRows,
      tone: "text-rose-600",
      ...(canFinance ? { onSeeAll: () => navigate("/finance") } : {}),
    });
  }
  if (alerts.pendingDocuments) {
    alertBlocks.push({
      id: "documents",
      title: t("home.alertsDocuments"),
      hint: t("home.alertsDocumentsHint", { students: alerts.pendingDocuments.students, documents: alerts.pendingDocuments.documents }),
      rows: documentRows,
      tone: "text-amber-600",
    });
  }
  if (alerts.fullGroups) {
    alertBlocks.push({
      id: "groups",
      title: t("home.alertsGroups"),
      hint: String(alerts.fullGroups.count),
      rows: fullGroupRows,
      tone: "text-sky-700",
      onSeeAll: () => navigate("/groups"),
    });
  }

  const kpis: Array<{ label: string; value: string; icon: React.ReactNode; tone: KpiTone; hint?: string }> = [
    {
      label: t("home.students"),
      value: value(indicators.enrolledCount, "count"),
      icon: <FaUsers size={16} />,
      tone: "sky",
      hint: t("home.withdrawalsReentries", data.movements) + (versus(indicators.enrolledCount, "count") ? ` · ${versus(indicators.enrolledCount, "count")}` : ""),
    },
    {
      label: t("home.attendance"),
      value: value(indicators.attendanceRate, "percent"),
      icon: <FaRegClock size={16} />,
      tone: "violet",
      hint: indicators.attendanceRate.value === null ? t("home.noAttendance") : t("home.attendanceHint"),
    },
    {
      label: t("home.averageGrade"),
      value: value(indicators.averageGrade, "grade"),
      icon: <FaBookOpen size={16} />,
      tone: "sky",
      hint: versus(indicators.averageGrade, "grade"),
    },
    {
      label: t("home.occupancy"),
      value: value(indicators.occupancy, "percent"),
      icon: <FaCalendarAlt size={16} />,
      tone: "amber",
      hint: versus(indicators.occupancy, "percent"),
    },
  ];
  if (finance) {
    kpis.push(
      {
        label: t("home.income"),
        value: value(indicators.collected, "money"),
        icon: <FaMoneyBillWave size={16} />,
        tone: "emerald",
        hint: t("home.projectedHint", { amount: value(indicators.projected, "money") }),
      },
      {
        label: t("home.expenses"),
        value: value(indicators.expenses, "money"),
        icon: <FaWallet size={16} />,
        tone: "orange",
        hint: data.expenses ? t("home.expensesHint", { count: data.expenses.count, pending: formatMoney(data.expenses.pending, locale) }) : undefined,
      },
      {
        label: t("home.overdue"),
        value: value(indicators.pendingAmount, "money"),
        icon: <FaExclamationTriangle size={16} />,
        tone: "rose",
        hint: alerts.overdueDebt ? t("home.overdueHint", { count: alerts.overdueDebt.count }) : t("home.noOverdue"),
      },
      {
        label: t("home.delinquency"),
        value: value(indicators.delinquencyRate, "percent"),
        icon: <FaFileAlt size={16} />,
        tone: "rose",
        hint: versus(indicators.delinquencyRate, "percent") ?? t("home.delinquencyHint"),
      }
    );
  }

  const incomeExpenses = data.incomeVsExpenses ?? [];
  /** Rendimiento académico: promedio final por grupo, sin los grupos sin captura. */
  const performance = data.groupsByOccupancy
    .filter((group) => group.averageGrade !== null)
    .map((group) => ({ label: group.groupName, value: group.averageGrade ?? 0, display: String(group.averageGrade) }));

  return (
    <div className="flex flex-col gap-4" data-role="dashboard">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiTile key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} tone={kpi.tone} hint={kpi.hint} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3" data-role="dashboard-finance">
        {finance && (
          <div className="lg:col-span-2">
            <PanelCard title={t("home.incomeVsExpenses")} description={data.term.name}>
              {incomeExpenses.length === 0 ? (
                <p className="text-[12px] text-slate-500">{t("home.noFinancialData")}</p>
              ) : (
                <IncomeExpenseChart ariaLabel={t("home.incomeVsExpenses")} data={incomeExpenses} />
              )}
            </PanelCard>
          </div>
        )}
        <div>
          <PanelCard title={t("home.byLevel")}>
            {data.enrollmentByLevel.length === 0 ? (
              <p className="text-[12px] text-slate-500">{t("home.noEnrollment")}</p>
            ) : (
              <DonutChart
                ariaLabel={t("home.byLevel")}
                centerLabel={String(indicators.enrolledCount.value ?? 0)}
                centerHint={t("home.studentsCenter")}
                othersLabel={t("home.others")}
                data={data.enrollmentByLevel.map((row) => ({
                  id: row.levelId,
                  label: row.levelName,
                  value: row.enrolledCount,
                  display: `${row.enrolledCount}`,
                }))}
              />
            )}
          </PanelCard>
        </div>
        <div>
          <PanelCard title={t("home.byGroup")} description={t("home.byGroupHint")}>
            {performance.length === 0 ? (
              <p className="text-[12px] text-slate-500">{t("home.noGrades")}</p>
            ) : (
              <BarChart ariaLabel={t("home.byGroup")} max={10} color="#0ea5e9" data={performance} />
            )}
          </PanelCard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {finance && data.financialPosition && (
          <div className="xl:col-span-1">
            <PanelCard title={t("home.financialPosition")} description={t("home.financialPositionHint")}
              actions={canFinance ? <SeeAll label={t("home.seeAll")} onClick={() => navigate("/finance")} /> : undefined}>
              <ul className="flex flex-col gap-2">
                <li className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-slate-700">{t("home.collected")}</span>
                  <span className="font-bold tabular-nums text-emerald-600">{formatMoney(data.financialPosition.collected, locale)}</span>
                </li>
                <li className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-slate-700">{t("home.receivable")}</span>
                  <span className="font-bold tabular-nums text-slate-700">{formatMoney(data.financialPosition.receivable, locale)}</span>
                </li>
                <li className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-slate-700">{t("home.overdue")}</span>
                  <span className="font-bold tabular-nums text-rose-600">{formatMoney(data.financialPosition.overdue, locale)}</span>
                </li>
              </ul>
            </PanelCard>
          </div>
        )}
        {finance && data.incomeByConcept && (
          <div>
            <PanelCard title={t("home.incomeByConcept")}>
              {data.incomeByConcept.length === 0 ? (
                <p className="text-[12px] text-slate-500">{t("home.noIncome")}</p>
              ) : (
                <ProgressList
                  items={data.incomeByConcept.map((row) => ({
                    id: row.concept,
                    label: row.concept,
                    hint: `${formatMoney(row.total, locale)} · ${row.share}%`,
                    ratio: row.share / 100,
                  }))}
                />
              )}
            </PanelCard>
          </div>
        )}
        {finance && data.expenses && (
          <div>
            <PanelCard
              title={t("home.expensesByType")}
              actions={canExpenses ? <SeeAll label={t("home.seeAll")} onClick={() => navigate("/expenses")} /> : undefined}
            >
              {data.expenses.byType.length === 0 ? (
                <p className="text-[12px] text-slate-500">{t("home.noExpenses")}</p>
              ) : (
                <ProgressList
                  items={data.expenses.byType.map((row) => ({
                    id: row.type,
                    label: row.label,
                    hint: formatMoney(row.total, locale),
                    ratio: data.expenses && data.expenses.total > 0 ? row.total / data.expenses.total : 0,
                  }))}
                />
              )}
            </PanelCard>
          </div>
        )}
        {!finance && (
          <div className="md:col-span-2 xl:col-span-3" data-role="dashboard-performance">
            <PanelCard title={t("home.performance")} description={t("home.performanceHint")}>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[12px]">
                  <span className="font-semibold text-slate-700">{t("executive.passRate")}</span>
                  <span className="font-bold tabular-nums text-emerald-600">{value(indicators.passRate, "percent")}</span>
                </li>
                <li className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[12px]">
                  <span className="font-semibold text-slate-700">{t("executive.dropoutRate")}</span>
                  <span className="font-bold tabular-nums text-rose-600">{value(indicators.dropoutRate, "percent")}</span>
                </li>
              </ul>
            </PanelCard>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {finance && (
          <div>
            <PanelCard title={t("home.recentPayments")} actions={canFinance ? <SeeAll label={t("home.seeAll")} onClick={() => navigate("/finance")} /> : undefined}>
              {paymentRows.length === 0 ? <p className="text-[12px] text-slate-500">{t("home.noPayments")}</p> : <RowList rows={paymentRows} />}
            </PanelCard>
          </div>
        )}
        <div>
          <PanelCard title={t("home.recentMovements")} description={t("home.recentMovementsHint", data.movements)}>
            {movementRows.length === 0 ? <p className="text-[12px] text-slate-500">{t("home.noMovements")}</p> : <RowList rows={movementRows} />}
          </PanelCard>
        </div>
        <div>
          <PanelCard title={t("home.topGroups")} actions={<SeeAll label={t("home.seeAll")} onClick={() => navigate("/groups")} />}>
            {data.groupsByOccupancy.length === 0 ? (
              <p className="text-[12px] text-slate-500">{t("home.noGroups")}</p>
            ) : (
              <ProgressList
                items={data.groupsByOccupancy.map((group) => ({
                  id: group.groupId,
                  label: `${group.courseName} · ${group.groupName}`,
                  hint: `${group.enrolledCount}/${group.capacity}`,
                  ratio: group.ratio,
                }))}
              />
            )}
          </PanelCard>
        </div>
      </div>

      <div data-role="dashboard-alerts">
        <PanelCard title={t("home.alerts")} description={t("home.alertsHint", { count: alerts.total })}>
          {alertBlocks.length === 0 ? (
            <div className="flex items-center gap-2 text-[12px] text-emerald-700">
              <FaCheckCircle size={13} />
              {t("home.noAlerts")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {alertBlocks.map((block) => (
                <section key={block.id} className="flex flex-col gap-2">
                  <header className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <FaArrowUp size={10} className="rotate-45" aria-hidden />
                      {block.title}
                    </h3>
                    {block.onSeeAll && <SeeAll label={t("home.seeAll")} onClick={block.onSeeAll} />}
                  </header>
                  <p className={`text-[12px] font-bold tabular-nums ${block.tone}`}>{block.hint}</p>
                  {block.rows.length > 0 ? (
                    <RowList rows={block.rows} />
                  ) : (
                    <p className="text-[12px] text-slate-500">{t("home.noAlerts")}</p>
                  )}
                </section>
              ))}
            </div>
          )}
        </PanelCard>
      </div>

      <p className="text-right text-[11px] text-slate-400">
        {t("home.generatedAt", { date: new Date(data.generatedAt).toLocaleString(locale) })}
      </p>
    </div>
  );
}
