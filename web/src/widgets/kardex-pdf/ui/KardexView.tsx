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

  const generated = t("kardex.generated", { date: new Date(kardex.generadoEn).toLocaleString(i18n.language) });

  const exportPdf = async () => {
    setExporting(true);
    try {
      const blob = await renderKardexPdf(kardex, {
        title: t("kardex.title"),
        studentNumber: t("students:detail.studentNumber"),
        status: t("students:table.status"),
        ingreso: t("students:form.enrollmentDate"),
        ciclo: t("kardex.ciclo"),
        curso: t("kardex.curso"),
        grupo: t("kardex.grupo"),
        final: t("kardex.final"),
        estatus: t("kardex.estatus"),
        promedio: t("kardex.promedio"),
        empty: t("kardex.empty"),
        faltantes: t("kardex.faltantes"),
        ninguno: t("kardex.ninguno"),
        generated,
        estatusValues: {
          PASSED: t("kardex.estatusValues.PASSED"),
          FAILED: t("kardex.estatusValues.FAILED"),
          IN_PROGRESS: t("kardex.estatusValues.IN_PROGRESS"),
          WITHDRAWN: t("kardex.estatusValues.WITHDRAWN"),
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
    { key: "termNombre", label: t("kardex.ciclo"), type: "string", width: 120 },
    { key: "courseNombre", label: t("kardex.curso"), type: "string" },
    { key: "grupo", label: t("kardex.grupo"), type: "string", width: 100 },
    { key: "calificacionFinal", label: t("kardex.final"), type: "string", width: 90, render: (e) => e.calificacionFinal ?? "—" },
    {
      key: "estatus", label: t("kardex.estatus"), type: "string", width: 130,
      render: (e) => <ITBadget color={STATUS_COLOR[e.estatus]} size="sm">{tr(`kardex.estatusValues.${e.estatus}`)}</ITBadget>,
    },
  ];

  return (
    <ITFlex direction="column" gap={4}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile label={t("kardex.promedio")} value={kardex.promedioGeneral ?? "—"} icon={<FaStar size={16} />} tone="violet" />
        <KpiTile label={t("kardex.creditos")} value={kardex.creditosAcreditados} icon={<FaGraduationCap size={16} />} tone="emerald" />
        <KpiTile label={t("kardex.minimo")} value={kardex.minPassingGrade} icon={<FaCheckCircle size={16} />} tone="sky" />
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
          <b>{t("kardex.faltantes")}:</b> {kardex.documentosFaltantes.length ? kardex.documentosFaltantes.join(", ") : t("kardex.ninguno")}
        </div>
      </PanelCard>
    </ITFlex>
  );
}
