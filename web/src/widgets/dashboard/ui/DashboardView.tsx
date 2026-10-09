import { ITAlert, ITButton, ITLoader, ITLineBarChart } from "@axzydev/axzy_ui_system";
import {
  FaBookOpen,
  FaCalendarAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaFileAlt,
  FaUsers,
  FaUserPlus,
  FaUserMinus,
} from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useCan } from "@entities/user";
import type { ExecutiveFilters, Indicator, RecentRow } from "@entities/report";
import { formatMoney } from "@shared/lib/money";
import { BarChart, DonutChart, ProgressList } from "@shared/ui/charts";
import { KpiTile, type KpiTone } from "@shared/ui/kpi-tile";
import { PanelCard } from "@shared/ui/panel-card";
import { useDashboard } from "./useDashboard";

type Unit = "count" | "percent" | "money" | "grade";

const EMPTY = "—";
const MAX_LISTS = 5;

/** Mes `AAAA-MM` → «Oct» (corto) en el idioma de la interfaz. */
const monthName = (month: string, locale: string): string => {
  const [year, index] = month.split("-").map(Number);
  if (!year || !index) return month;
  return new Intl.DateTimeFormat(locale.startsWith("en") ? "en-US" : "es-MX", { month: "short" })
    .format(new Date(Date.UTC(year, index - 1, 1)))
    .replace(".", "");
};

/** Botón «Ver todo →» del encabezado de un panel. */
function SeeAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ITButton variant="text" color="primary" onClick={onClick} className="!p-0!">
      {label}
    </ITButton>
  );
}

/** Lista compacta de renglones (tablas recientes del tablero). */
function RowList({ rows }: { rows: Array<{ id: string; label: string; hint: string }> }) {
  return (
    <ul className="flex flex-col divide-y divide-slate-100">
      {rows.map((row, index) => (
        <li key={`${row.id}-${index}`} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <span className="truncate text-[12px] font-semibold text-slate-700">{row.label}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{row.hint}</span>
        </li>
      ))}
    </ul>
  );
}

/** Barra apilada de proporciones (cartera: cobrado / por cobrar / vencido). */
function StackedBar({ segments }: { segments: Array<{ id: string; value: number; color: string }> }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return <div className="h-2 w-full rounded-full bg-slate-100" />;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
      {segments.map((segment) => (
        <div
          key={segment.id}
          style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }}
          title={`${segment.id}: ${segment.value}`}
        />
      ))}
    </div>
  );
}

/** Contador compacto (movimientos del ciclo). */
function CountChip({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white ${tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold text-slate-500">{label}</span>
        <span className="block text-[15px] font-bold leading-tight tabular-nums text-slate-800">{value}</span>
      </span>
    </div>
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
  /** «+12% vs. Ciclo 2025» o el aviso de que no hay con qué comparar. */
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

  const incomeExpenses = (data.incomeVsExpenses ?? []).map((row) => ({
    label: monthName(row.month, locale),
    line: row.income,
    bar: row.expenses,
  }));
  // Etiquetas cortas: el nombre del grupo ya identifica; el nivel sobra en el eje.
  const performance = data.groupsByOccupancy
    .filter((group) => group.averageGrade !== null)
    .map((group) => ({ id: group.groupId, label: group.groupName, value: group.averageGrade ?? 0, display: String(group.averageGrade) }));

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
  /** Alumnos con adeudo: es la única lista de riesgo del tablero. */
  const riskRows = (alerts.overdueDebt?.students ?? []).map((row) => ({
    id: row.id,
    label: row.name,
    hint: `${formatMoney(row.amount, locale)} · ${t("home.daysOverdue", { count: row.days })}`,
  }));

  /** Avisos del ciclo: resumen compacto, sin repetir listas ya visibles. */
  const alertChips: Array<{ id: string; title: string; value: string; icon: React.ReactNode; tone: string; onClick?: () => void }> = [];
  if (alerts.overdueDebt) {
    alertChips.push({
      id: "overdue",
      title: t("home.alertsOverdue"),
      value: `${alerts.overdueDebt.count} · ${formatMoney(alerts.overdueDebt.amount, locale)}`,
      icon: <FaExclamationTriangle size={13} className="text-rose-600" />,
      tone: "text-rose-600",
      ...(canFinance ? { onClick: () => navigate("/finance") } : {}),
    });
  }
  if (alerts.pendingDocuments) {
    alertChips.push({
      id: "documents",
      title: t("home.alertsDocuments"),
      value: t("home.alertsDocumentsHint", {
        students: alerts.pendingDocuments.students,
        documents: alerts.pendingDocuments.documents,
      }),
      icon: <FaFileAlt size={13} className="text-amber-600" />,
      tone: "text-amber-700",
    });
  }
  if (alerts.fullGroups) {
    alertChips.push({
      id: "groups",
      title: t("home.alertsGroups"),
      value: t("home.fullGroupsHint", { count: alerts.fullGroups.count }),
      icon: <FaUsers size={13} className="text-sky-700" />,
      tone: "text-sky-800",
      onClick: () => navigate("/groups"),
    });
  }

  const position = data.financialPosition;
  const incomeTotal = (data.incomeByConcept ?? []).reduce((sum, row) => sum + row.total, 0);

  const kpis: Array<{ label: string; value: string; icon: React.ReactNode; tone: KpiTone; delta?: string; hint?: string }> = [
    {
      label: t("home.students"),
      value: value(indicators.enrolledCount, "count"),
      icon: <FaUsers size={18} />,
      tone: "sky",
      delta: versus(indicators.enrolledCount, "count"),
      hint: t("home.withdrawalsReentries", data.movements),
    },
    {
      label: t("home.occupancy"),
      value: value(indicators.occupancy, "percent"),
      icon: <FaCalendarAlt size={18} />,
      tone: "emerald",
      delta: versus(indicators.occupancy, "percent"),
      hint: t("home.occupancyHint", { count: data.groupsByOccupancy.length }),
    },
    {
      label: t("home.averageGrade"),
      value: value(indicators.averageGrade, "grade"),
      icon: <FaBookOpen size={18} />,
      tone: "violet",
      delta: versus(indicators.averageGrade, "grade"),
      hint: t("home.attendanceHintValue", { value: value(indicators.attendanceRate, "percent") }),
    },
    {
      label: t("home.overdue"),
      value: value(indicators.pendingAmount, "money"),
      icon: <FaExclamationTriangle size={18} />,
      tone: "rose",
      delta: alerts.overdueDebt ? t("home.overdueHint", { count: alerts.overdueDebt.count }) : t("home.noOverdue"),
      hint: versus(indicators.delinquencyRate, "percent") ?? t("home.delinquencyHint"),
    },
  ];

  return (
    <div className="flex flex-col gap-4" data-role="dashboard">
      {/* 1. Indicadores superiores */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiTile
            key={kpi.label}
            layout="statement"
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            tone={kpi.tone}
            delta={kpi.delta}
            hint={kpi.hint}
          />
        ))}
      </div>

      {/* 2. Gráficas centrales: ingresos vs. gastos, distribución y rendimiento */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3" data-role="dashboard-finance">
        {finance && (
          <div className="xl:col-span-2">
            <PanelCard title={t("home.incomeVsExpenses")} description={data.term.name}>
              {incomeExpenses.length === 0 ? (
                <p className="text-[12px] text-slate-500">{t("home.noFinancialData")}</p>
              ) : (
                <ITLineBarChart
                  ariaLabel={t("home.incomeVsExpenses")}
                  data={incomeExpenses}
                  lineLabel={t("home.income")}
                  barLabel={t("home.expenses")}
                  lineColor="#10b981"
                  barColor="#3b82f6"
                  height={268}
                  formatValue={(v) => formatMoney(v, locale)}
                />
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
                centerHint={indicators.enrolledCount.value !== null ? t("home.studentsCenter") : undefined}
                othersLabel={t("home.others")}
                data={data.enrollmentByLevel.map((row) => ({
                  id: row.levelId,
                  label: row.levelName,
                  value: row.enrolledCount,
                  display: t("home.studentsCount", { count: row.enrolledCount }),
                }))}
              />
            )}
          </PanelCard>
        </div>
        <div className="xl:col-span-2">
          <PanelCard title={t("home.byGroup")} description={t("home.byGroupHint")}>
            {performance.length === 0 ? (
              <p className="text-[12px] text-slate-500">{t("home.noGrades")}</p>
            ) : (
              <BarChart ariaLabel={t("home.byGroup")} max={10} color="#0ea5e9" data={performance} />
            )}
          </PanelCard>
        </div>
        <div>
          <PanelCard
            title={t("home.atRisk")}
            description={t("home.atRiskHint")}
            actions={canFinance ? <SeeAll label={t("home.seeAll")} onClick={() => navigate("/finance")} /> : undefined}
          >
            {riskRows.length === 0 ? (
              <p className="text-[12px] text-slate-500">{t("home.noOverdue")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100">
                {riskRows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[10px] font-bold text-sky-700">
                        {row.label.slice(0, 1)}
                      </span>
                      <span className="truncate text-[12px] font-semibold text-slate-700">{row.label}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-bold tabular-nums text-rose-600">{row.hint}</span>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
        </div>
      </div>

      {/* 3. Finanzas de detalle (cada tarjeta con su total al pie) */}
      {finance && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {position && (
            <PanelCard
              title={t("home.financialPosition")}
              description={t("home.financialPositionHint")}
              actions={canFinance ? <SeeAll label={t("home.seeAll")} onClick={() => navigate("/finance")} /> : undefined}
            >
              <div className="flex flex-col gap-3">
                <StackedBar
                  segments={[
                    { id: t("home.collected"), value: position.collected, color: "#10b981" },
                    { id: t("home.receivable"), value: Math.max(position.receivable, 0), color: "#cbd5e1" },
                    { id: t("home.overdue"), value: position.overdue, color: "#f43f5e" },
                  ]}
                />
                <ul className="flex flex-col gap-1.5">
                  {[
                    { id: "collected", label: t("home.collected"), amount: position.collected, tone: "text-emerald-600", dot: "#10b981" },
                    { id: "receivable", label: t("home.receivable"), amount: position.receivable, tone: "text-slate-700", dot: "#cbd5e1" },
                    { id: "overdue", label: t("home.overdue"), amount: position.overdue, tone: "text-rose-600", dot: "#f43f5e" },
                  ].map((row) => (
                    <li key={row.id} className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2 font-semibold text-slate-700">
                        <span className="h-2 w-2 rounded-full" style={{ background: row.dot }} aria-hidden />
                        {row.label}
                      </span>
                      <span className={`font-bold tabular-nums ${row.tone}`}>{formatMoney(row.amount, locale)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 flex items-center justify-between border-t border-slate-100 pt-3 text-[12px]">
                  <span className="font-semibold text-slate-500">{t("home.billedTotal")}</span>
                  <span className="font-bold tabular-nums text-slate-800">
                    {formatMoney(position.collected + position.receivable, locale)}
                  </span>
                </p>
              </div>
            </PanelCard>
          )}
          {data.incomeByConcept && (
            <PanelCard title={t("home.incomeByConcept")} description={t("home.incomeByConceptHint")}>
              {data.incomeByConcept.length === 0 ? (
                <p className="text-[12px] text-slate-500">{t("home.noIncome")}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <ProgressList
                    items={data.incomeByConcept.map((row) => ({
                      id: row.concept,
                      label: row.concept,
                      hint: `${formatMoney(row.total, locale)} · ${row.share}%`,
                      ratio: row.share / 100,
                    }))}
                  />
                  <p className="flex items-center justify-between border-t border-slate-100 pt-3 text-[12px]">
                    <span className="font-semibold text-slate-500">{t("home.totalCollected")}</span>
                    <span className="font-bold tabular-nums text-slate-800">{formatMoney(incomeTotal, locale)}</span>
                  </p>
                </div>
              )}
            </PanelCard>
          )}
          {data.expenses && (
            <PanelCard
              title={t("home.expensesByType")}
              description={data.expenses.count > 0 ? t("home.expensesHint", { count: data.expenses.count, pending: formatMoney(data.expenses.pending, locale) }) : undefined}
              actions={canExpenses ? <SeeAll label={t("home.seeAll")} onClick={() => navigate("/expenses")} /> : undefined}
            >
              {data.expenses.byType.length === 0 ? (
                <p className="text-[12px] text-slate-500">{t("home.noExpenses")}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <ProgressList
                    items={data.expenses.byType.map((row) => ({
                      id: row.type,
                      label: row.label,
                      hint: formatMoney(row.total, locale),
                      ratio: data.expenses && data.expenses.total > 0 ? row.total / data.expenses.total : 0,
                    }))}
                  />
                  <p className="flex items-center justify-between border-t border-slate-100 pt-3 text-[12px]">
                    <span className="font-semibold text-slate-500">{t("home.expensesTotal")}</span>
                    <span className="font-bold tabular-nums text-slate-800">{formatMoney(data.expenses.total, locale)}</span>
                  </p>
                </div>
              )}
            </PanelCard>
          )}
        </div>
      )}

      {/* 4. Operación escolar: cobros, movimientos y grupos */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {finance && (
          <PanelCard
            title={t("home.recentPayments")}
            actions={canFinance ? <SeeAll label={t("home.seeAll")} onClick={() => navigate("/finance")} /> : undefined}
          >
            {paymentRows.length === 0 ? <p className="text-[12px] text-slate-500">{t("home.noPayments")}</p> : <RowList rows={paymentRows} />}
          </PanelCard>
        )}
        <PanelCard title={t("home.recentMovements")}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <CountChip label={t("home.withdrawal")} value={data.movements.withdrawals} icon={<FaUserMinus size={12} />} tone="text-amber-600" />
              <CountChip label={t("home.reentry")} value={data.movements.reentries} icon={<FaUserPlus size={12} />} tone="text-sky-600" />
            </div>
            {movementRows.length === 0 ? (
              <p className="text-[12px] text-slate-500">{t("home.noMovements")}</p>
            ) : (
              <RowList rows={movementRows} />
            )}
          </div>
        </PanelCard>
        <PanelCard title={t("home.topGroups")} actions={<SeeAll label={t("home.seeAll")} onClick={() => navigate("/groups")} />}>
          {data.groupsByOccupancy.length === 0 ? (
            <p className="text-[12px] text-slate-500">{t("home.noGroups")}</p>
          ) : (
            <ProgressList
              items={data.groupsByOccupancy.map((group) => ({
                id: group.groupId,
                label: `${group.groupName} · ${group.courseName}`,
                hint: `${group.enrolledCount}/${group.capacity}`,
                ratio: group.ratio,
              }))}
            />
          )}
        </PanelCard>
      </div>

      {/* 5. Alertas del ciclo: avisos compactos (las listas ya están arriba) */}
      <div data-role="dashboard-alerts">
        <PanelCard title={t("home.alerts")} description={t("home.alertsHint", { count: alerts.total })}>
          {alertChips.length === 0 ? (
            <div className="flex items-center gap-2 text-[12px] text-emerald-700">
              <FaCheckCircle size={13} />
              {t("home.noAlerts")}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {alertChips.map((chip) => (
                <li key={chip.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white">{chip.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-slate-500">{chip.title}</span>
                      <span className={`block text-[13px] font-bold tabular-nums ${chip.tone}`}>{chip.value}</span>
                    </span>
                  </span>
                  {chip.onClick && <SeeAll label={t("home.seeAll")} onClick={chip.onClick} />}
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>

      <p className="text-right text-[11px] text-slate-400">
        {t("home.generatedAt", { date: new Date(data.generatedAt).toLocaleString(locale) })}
      </p>
    </div>
  );
}
