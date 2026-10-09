import { useCallback } from "react";
import { ITButton, ITDataTable, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaChevronRight } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { onlineExamApi, type OnlineExam } from "@entities/online-exam";
import { formatInstant } from "@shared/lib/day";
import ExamStatusBadge from "./ExamStatusBadge";

interface Props {
  reloadKey: number;
  onTotal?: (total: number) => void;
  onOpen: (exam: OnlineExam) => void;
}

/** Listado de exámenes en línea del alcance del usuario (M15). */
export default function ExamsTable({ reloadKey, onTotal, onOpen }: Props) {
  const { t, i18n } = useTranslation(["exams", "common"]);

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await onlineExamApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    onTotal?.(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, [onTotal]);

  const columns: Column<OnlineExam>[] = [
    {
      key: "titulo", label: t("exams.titulo"), type: "string", filter: true, sortable: true,
      render: (row) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{row.titulo}</ITText>
          <ITText className="text-[10px] text-slate-400">{row.courseNombre} · {row.groupNombre} · {row.termNombre}</ITText>
        </div>
      ),
    },
    {
      key: "fechaApertura", label: t("exams.ventana"), type: "date", width: 260, sortable: true,
      render: (row) => (
        <ITText className="text-[11px] text-slate-600">
          {formatInstant(row.fechaApertura, i18n.language)} → {formatInstant(row.fechaCierre, i18n.language)}
        </ITText>
      ),
    },
    {
      key: "preguntas", label: t("exams.preguntas"), type: "number", width: 110,
      render: (row) => <ITText className="text-[12px] text-slate-600">{row.preguntas} · {row.totalPuntos} pt</ITText>,
    },
    { key: "intentos", label: t("exams.intentos"), type: "number", width: 90 },
    {
      key: "status", label: t("exams.status"), type: "catalog", width: 120, filter: "catalog", sortable: true,
      catalogOptions: { data: (["BORRADOR", "PUBLICADO", "CERRADO"] as const).map((s) => ({ id: s, name: t(`exams.statuses.${s}`) })) },
      render: (row) => <ExamStatusBadge status={row.status} />,
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 70,
      actions: (row: OnlineExam) => (
        <ITButton variant="text" color="secondary" size="sm" ariaLabel={`${t("common:actions.view")} ${row.titulo}`} onClick={() => onOpen(row)}>
          <FaChevronRight size={12} />
        </ITButton>
      ),
    },
  ];

  return (
    <ITDataTable
      columns={columns as unknown as Column<Record<string, unknown>>[]}
      fetchData={fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
      reloadTrigger={reloadKey}
      defaultItemsPerPage={25}
      itemsPerPageOptions={[25, 50, 100]}
      layout="fixed"
      density="compact"
    />
  );
}
