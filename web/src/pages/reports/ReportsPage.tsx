import { useEffect, useState } from "react";
import { saveAs } from "file-saver";
import { ITAlert, ITBadget, ITButton, ITDatePicker, ITFlex, ITPage, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { FaChartBar, FaFileExcel, FaFilePdf, FaPlay } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { reportApi, type ReportCatalogItem, type ReportColumn, type ReportFilters, type ReportResult, type ReportType } from "@entities/report";
import { termsApi, type Term } from "@entities/config";
import { groupApi, type Group } from "@entities/group";
import { formatDay, fromDay, toDay } from "@shared/lib/day";
import { formatMoney } from "@shared/lib/money";
import { PanelCard } from "@shared/ui/panel-card";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

const TERM_REPORTS: ReportType[] = [
  "enrollments-by-group", "grades-by-group", "attendance-by-group", "payments-period", "debts",
  "dropout", "performance-by-course", "performance-by-teacher", "enrollment-trend", "delinquency", "income-vs-projection",
];
const GROUP_REPORTS: ReportType[] = ["enrollments-by-group", "grades-by-group", "attendance-by-group", "dropout"];
/** Sin ciclo elegido abarcan todos los ciclos (los demás usan el activo). */
const ALL_TERMS_REPORTS: ReportType[] = ["payments-period", "debts", "delinquency", "income-vs-projection"];
const RANGE_REPORTS: ReportType[] = ["students-inactive", "payments-period", "debts"];
const pickDay = (value: unknown): string => (value instanceof Date && !Number.isNaN(value.getTime()) ? toDay(value) : "");

/** `/reports` (M10): reportes operativos con filtros server-side y exportación. */
export default function ReportsPage() {
  const { t, i18n } = useTranslation(["reports", "common"]);
  const crumbs = useBreadcrumbs();
  const notify = useNotify();
  const canExport = useCan("reports.export");
  const canTerms = useCan("terms.view");
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [type, setType] = useState<ReportType | "">("");
  const [filters, setFilters] = useState<ReportFilters>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    reportApi.catalog().then(setCatalog).catch(() => setCatalog([]));
    if (canTerms) termsApi.options().then(setTerms).catch(() => setTerms([]));
  }, [canTerms]);

  useEffect(() => {
    groupApi.options(filters.termId ? { termId: filters.termId } : {}).then(setGroups).catch(() => setGroups([]));
  }, [filters.termId]);

  const set = (key: keyof ReportFilters, value: string) => setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  const current = type || undefined;

  const run = async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await reportApi.run(current, filters));
    } catch (err) {
      setError(errorMessage(err, t("common:errors.load")));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const exportAs = async (format: "xlsx" | "pdf") => {
    if (!current) return;
    try {
      saveAs(await reportApi.export(current, filters, format), `${current}-${toDay(new Date())}.${format}`);
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.load")));
    }
  };

  const cell = (value: unknown, column: ReportColumn) => {
    if (value === null || value === undefined || value === "") return "—";
    if (column.type === "money") return formatMoney(Number(value), i18n.language);
    if (column.type === "percent") return `${value}%`;
    if (column.type === "date") return formatDay(String(value), i18n.language);
    return String(value);
  };

  return (
    <ITPage
      breadcrumbs={crumbs({ label: t("common:nav.reports") })}
      title={t("title")}
      description={t("description")}
      icon={<FaChartBar size={20} />}
      actions={
        canExport && result && (
          <ITFlex gap={2}>
            <ITButton variant="outlined" color="success" onClick={() => void exportAs("xlsx")}>
              <ITFlex align="center" gap={1}><FaFileExcel size={11} /><ITText className="font-bold text-[11px]">{t("exportXlsx")}</ITText></ITFlex>
            </ITButton>
            <ITButton variant="outlined" color="danger" onClick={() => void exportAs("pdf")}>
              <ITFlex align="center" gap={1}><FaFilePdf size={11} /><ITText className="font-bold text-[11px]">{t("exportPdf")}</ITText></ITFlex>
            </ITButton>
          </ITFlex>
        )
      }
    >
      <ITFlex direction="column" gap={4}>
        <PanelCard>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end">
            <ITSelect name="report" label={t("report")} value={type} placeholder="—"
              options={catalog.map((r) => ({ value: r.type, label: r.financial ? `${r.title} · $` : r.title }))}
              onChange={(e) => { setType(e.target.value as ReportType); setResult(null); }} />
            {current && TERM_REPORTS.includes(current) && canTerms && (
              <ITSelect name="termId" label={t("termName")} value={filters.termId ?? ""} placeholder={ALL_TERMS_REPORTS.includes(current) ? t("allGroups") : t("activeTerm")}
                options={terms.map((x) => ({ value: x.id, label: x.name }))} onChange={(e) => { set("termId", e.target.value); set("groupId", ""); }} />
            )}
            {current && GROUP_REPORTS.includes(current) && (
              <ITSelect name="groupId" label={t("groupName")} value={filters.groupId ?? ""} placeholder={t("allGroups")}
                options={groups.map((g) => ({ value: g.id, label: `${g.courseName} · ${g.name}` }))} onChange={(e) => set("groupId", e.target.value)} />
            )}
            {current && RANGE_REPORTS.includes(current) && current !== "debts" && (
              <ITDatePicker name="from" label={t("from")} value={filters.from ? fromDay(filters.from) : undefined}
                onChange={(e) => set("from", pickDay(e.target.value))} />
            )}
            {current && RANGE_REPORTS.includes(current) && (
              <ITDatePicker name="to" label={t("to")} value={filters.to ? fromDay(filters.to) : undefined}
                onChange={(e) => set("to", pickDay(e.target.value))} />
            )}
            <div>
              <ITButton variant="filled" color="primary" disabled={!current || busy} onClick={() => void run()}>
                <ITFlex align="center" gap={1}><FaPlay size={10} /><ITText className="font-bold text-[11px]">{t("run")}</ITText></ITFlex>
              </ITButton>
            </div>
          </div>
        </PanelCard>
        {error && <ITAlert variant="error">{error}</ITAlert>}
        {!result && !error && <ITText className="text-[12px] text-slate-500">{t("pick")}</ITText>}
        {result && (
          <PanelCard
            title={result.title}
            description={`${t("rows", { count: result.rows.length })}${result.filters.termName ? ` · ${result.filters.termName}` : ""}${
              result.filters.from ? ` · ${formatDay(result.filters.from, i18n.language)} – ${formatDay(result.filters.to ?? "", i18n.language)}` : ""}`}
          >
            {result.rows.length === 0 ? (
              <ITText className="text-[12px] text-slate-500">{t("empty")}</ITText>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]" data-role="report">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-400">
                      {result.columns.map((c) => (
                        <th key={c.key} className={`px-2 py-2 ${c.type === "text" || c.type === "date" ? "" : "text-right"}`}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {result.columns.map((c) => (
                          <td key={c.key} className={`px-2 py-1.5 ${c.type === "text" || c.type === "date" ? "text-slate-700" : "text-right font-bold text-slate-800"}`}>
                            {cell(row[c.key], c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ITFlex gap={2} wrap="wrap" className="mt-3" data-role="report-totals">
              {Object.entries(result.totals).map(([key, value]) => {
                const column = result.columns.find((c) => c.key === key);
                const isMoney = column?.type === "money" || ["overdue", "CASH", "TRANSFER", "DEPOSIT", "CARD", "OTHER"].includes(key);
                return (
                  <ITBadget key={key} color="secondary" size="sm">
                    {`${key === "rows" ? t("rows", { count: value }) : `${column?.label ?? key}: ${isMoney ? formatMoney(value, i18n.language) : column?.type === "percent" ? `${value}%` : value}`}`}
                  </ITBadget>
                );
              })}
            </ITFlex>
          </PanelCard>
        )}
      </ITFlex>
    </ITPage>
  );
}
