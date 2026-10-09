import { useCallback } from "react";
import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaBan, FaEdit, FaUndo } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import { DIFFICULTIES, QUESTION_TYPES, questionApi, type Question } from "@entities/question";

export type QuestionAction = "edit" | "deactivate" | "reactivate";

interface Props {
  reloadKey: number;
  onTotal?: (total: number) => void;
  onAction: (action: QuestionAction, question: Question) => void;
}

export default function QuestionsTable({ reloadKey, onTotal, onAction }: Props) {
  const { t } = useTranslation(["exams", "common"]);
  const canEdit = useCan("questions.edit");

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await questionApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    onTotal?.(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, [onTotal]);

  const columns: Column<Question>[] = [
    {
      key: "text", label: t("questions.text"), type: "string", filter: true,
      render: (row) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{row.text.length > 110 ? `${row.text.slice(0, 110)}…` : row.text}</ITText>
          <ITText className="text-[10px] text-slate-400">{row.courseCode}{row.topic ? ` · ${row.topic}` : ""}</ITText>
        </div>
      ),
    },
    {
      key: "type", label: t("questions.type"), type: "catalog", width: 160, filter: "catalog", sortable: false,
      catalogOptions: { data: QUESTION_TYPES.map((x) => ({ id: x, name: t(`questions.types.${x}`) })) },
      render: (row) => <ITText className="text-[12px] text-slate-600">{t(`questions.types.${row.type}`)}</ITText>,
    },
    {
      key: "difficulty", label: t("questions.difficulty"), type: "catalog", width: 120, filter: "catalog", sortable: false,
      catalogOptions: { data: DIFFICULTIES.map((x) => ({ id: x, name: t(`questions.difficulties.${x}`) })) },
      render: (row) => <ITText className="text-[12px] text-slate-600">{row.difficulty ? t(`questions.difficulties.${row.difficulty}`) : "—"}</ITText>,
    },
    { key: "points", label: t("questions.points"), type: "number", width: 90, sortable: false },
    {
      key: "status", label: t("questions.status"), type: "catalog", width: 150, filter: "catalog", sortable: false,
      catalogOptions: { data: [{ id: "ACTIVE", name: t("questions.active") }, { id: "INACTIVE", name: t("questions.inactive") }] },
      render: (row) => (
        <ITFlex gap={1} align="center">
          <ITBadget color={row.status === "ACTIVE" ? "success" : "danger"} size="sm">{row.status === "ACTIVE" ? t("questions.active") : t("questions.inactive")}</ITBadget>
          {row.locked && <ITBadget color="secondary" size="sm">{t("questions.inUse")}</ITBadget>}
        </ITFlex>
      ),
    },
    ...(canEdit
      ? [{
          key: "actions", label: t("common:labels.actions"), type: "actions" as const, width: 100,
          actions: (row: Question) => (
            <ITFlex gap={1}>
              <ITButton variant="text" color="secondary" size="sm" ariaLabel={`${t("common:actions.edit")} ${row.text}`} onClick={() => onAction("edit", row)}>
                <FaEdit size={12} />
              </ITButton>
              {row.status === "ACTIVE" ? (
                <ITButton variant="text" color="danger" size="sm" ariaLabel={`${t("common:actions.deactivate")} ${row.text}`} onClick={() => onAction("deactivate", row)}>
                  <FaBan size={12} />
                </ITButton>
              ) : (
                <ITButton variant="text" color="success" size="sm" ariaLabel={`${t("common:actions.reactivate")} ${row.text}`} onClick={() => onAction("reactivate", row)}>
                  <FaUndo size={12} />
                </ITButton>
              )}
            </ITFlex>
          ),
        }]
      : []),
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
      virtualized
      virtualizedMaxHeight={400}
      rowHeight={50}
    />
  );
}
