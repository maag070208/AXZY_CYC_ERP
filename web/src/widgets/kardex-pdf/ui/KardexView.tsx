import { useState } from "react";
import { ITAlert, ITBadget, ITButton, ITFlex, ITLoader, ITTable, ITText } from "@axzydev/axzy_ui_system";
import type { Column } from "@axzydev/axzy_ui_system";
import { FaFilePdf, FaGraduationCap, FaStar, FaCheckCircle } from "react-icons/fa";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import type { KardexEntry } from "@entities/document";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { dyn } from "@shared/i18n";
import { KpiTile } from "@shared/ui/kpi-tile";
import { PanelCard } from "@shared/ui/panel-card";
import { useKardex } from "../model/useKardex";
import { renderKardexPdf } from "../lib/renderKardexPdf";

const STATUS_COLOR = { PASSED: "success", FAILED: "danger", IN_PROGRESS: "info", WITHDRAWN: "gray" } as const;

/** Kardex del alumno: indicadores, cursos por ciclo y exportación a PDF. */
export default function KardexView({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation(["documents", "students", "common"]);
  const tr = dyn(t);
  const notify = useNotify();
  const canExport = useCan("kardex.export");
  const { kardex, error } = useKardex(studentId);
  const [exporting, setExporting] = useState(false);

  if (error) return <ITAlert variant="error">{error}</ITAlert>;
  if (!kardex) return <ITLoader />;

  const generated = t("kardex.generated", { date: new Date(kardex.generatedAt).toLocaleString(i18n.language) });

  const exportPdf = async () => {
    setExporting(true);
    try {
      const blob = await renderKardexPdf(kardex, {
        title: t("kardex.title"),
        studentNumber: t("students:detail.studentNumber"),
        status: t("students:table.status"),
        enrollmentDate: t("students:form.enrollmentDate"),
        termName: t("kardex.termName"),
        courseName: t("kardex.courseName"),
        groupName: t("kardex.groupName"),
        final: t("kardex.final"),
        entryStatus: t("kardex.status"),
        average: t("kardex.average"),
        empty: t("kardex.empty"),
        missing: t("kardex.missing"),
        ninguno: t("kardex.noneOption"),
        generated,
        statusValues: {
          PASSED: t("kardex.statusValues.PASSED"),
          FAILED: t("kardex.statusValues.FAILED"),
          IN_PROGRESS: t("kardex.statusValues.IN_PROGRESS"),
          WITHDRAWN: t("kardex.statusValues.WITHDRAWN"),
        },
      });
      saveAs(blob, `kardex-${kardex.studentNumber}.pdf`);
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.load")));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<KardexEntry>[] = [
    { key: "termName", label: t("kardex.termName"), type: "string", width: 120 },
    { key: "courseName", label: t("kardex.courseName"), type: "string" },
    { key: "groupName", label: t("kardex.groupName"), type: "string", width: 100 },
    { key: "finalGrade", label: t("kardex.final"), type: "string", width: 90, render: (e) => e.finalGrade ?? "—" },
    {
      key: "status", label: t("kardex.status"), type: "string", width: 130,
      render: (e) => <ITBadget color={STATUS_COLOR[e.status]} size="sm">{tr(`kardex.statusValues.${e.status}`)}</ITBadget>,
    },
  ];

  return (
    <ITFlex direction="column" gap={4}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile label={t("kardex.average")} value={kardex.overallAverage ?? "—"} icon={<FaStar size={16} />} tone="violet" />
        <KpiTile label={t("kardex.credits")} value={kardex.passedCredits} icon={<FaGraduationCap size={16} />} tone="emerald" />
        <KpiTile label={t("kardex.minimum")} value={kardex.minPassingGrade} icon={<FaCheckCircle size={16} />} tone="sky" />
      </div>
      <PanelCard
        title={t("kardex.title")}
        description={generated}
        actions={canExport && (
          <ITButton variant="outlined" color="danger" disabled={exporting} onClick={() => void exportPdf()}>
            <ITFlex align="center" gap={1}><FaFilePdf size={11} /><ITText className="text-[11px] font-bold">{t("kardex.pdf")}</ITText></ITFlex>
          </ITButton>
        )}
      >
        {kardex.entries.length === 0 ? (
          <ITText className="text-[12px] text-slate-500">{t("kardex.empty")}</ITText>
        ) : (
          <ITTable columns={columns as unknown as Column<Record<string, unknown>>[]}
            data={kardex.entries as unknown as Record<string, unknown>[]} defaultItemsPerPage={50} density="compact" />
        )}
        <div className="mt-3 text-[12px] text-slate-600" data-kardex-missing>
          <b>{t("kardex.missing")}:</b> {kardex.missingDocuments.length ? kardex.missingDocuments.join(", ") : t("kardex.noneOption")}
        </div>
      </PanelCard>
    </ITFlex>
  );
}
