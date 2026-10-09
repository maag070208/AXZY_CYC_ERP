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
      key: "title", label: t("exams.titleField"), type: "string", filter: true, sortable: false,
      render: (row) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{row.title}</ITText>
          <ITText className="text-[10px] text-slate-400">{row.courseName} · {row.groupName} · {row.termName}</ITText>
        </div>
      ),
    },
    {
      key: "opensAt", label: t("exams.window"), type: "date", width: 260, sortable: false,
      render: (row) => (
        <ITText className="text-[11px] text-slate-600">
          {formatInstant(row.opensAt, i18n.language)} → {formatInstant(row.closesAt, i18n.language)}
        </ITText>
      ),
    },
    {
      key: "questionCount", label: t("exams.questionCount"), type: "number", width: 110,
      render: (row) => <ITText className="text-[12px] text-slate-600">{row.questionCount} · {row.totalPoints} pt</ITText>,
    },
    { key: "attemptCount", label: t("exams.attempts"), type: "number", width: 90 },
    {
      key: "status", label: t("exams.status"), type: "catalog", width: 120, filter: "catalog", sortable: false,
      catalogOptions: { data: (["DRAFT", "PUBLISHED", "CLOSED"] as const).map((s) => ({ id: s, name: t(`exams.statuses.${s}`) })) },
      render: (row) => <ExamStatusBadge status={row.status} />,
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 70,
      actions: (row: OnlineExam) => (
        <ITButton variant="text" color="secondary" size="sm" ariaLabel={`${t("common:actions.view")} ${row.title}`} onClick={() => onOpen(row)}>
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
