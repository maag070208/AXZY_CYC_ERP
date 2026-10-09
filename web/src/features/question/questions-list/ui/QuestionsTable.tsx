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
      key: "enunciado", label: t("questions.enunciado"), type: "string", filter: true,
      render: (row) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{row.enunciado.length > 110 ? `${row.enunciado.slice(0, 110)}…` : row.enunciado}</ITText>
          <ITText className="text-[10px] text-slate-400">{row.courseClave}{row.tema ? ` · ${row.tema}` : ""}</ITText>
        </div>
      ),
    },
    {
      key: "tipo", label: t("questions.tipo"), type: "catalog", width: 160, filter: "catalog", sortable: true,
      catalogOptions: { data: QUESTION_TYPES.map((x) => ({ id: x, name: t(`questions.types.${x}`) })) },
      render: (row) => <ITText className="text-[12px] text-slate-600">{t(`questions.types.${row.tipo}`)}</ITText>,
    },
    {
      key: "dificultad", label: t("questions.dificultad"), type: "catalog", width: 120, filter: "catalog", sortable: true,
      catalogOptions: { data: DIFFICULTIES.map((x) => ({ id: x, name: t(`questions.difficulties.${x}`) })) },
      render: (row) => <ITText className="text-[12px] text-slate-600">{row.dificultad ? t(`questions.difficulties.${row.dificultad}`) : "—"}</ITText>,
    },
    { key: "puntos", label: t("questions.puntos"), type: "number", width: 90, sortable: true },
    {
      key: "status", label: t("questions.status"), type: "catalog", width: 150, filter: "catalog", sortable: true,
      catalogOptions: { data: [{ id: "ACTIVA", name: t("questions.activa") }, { id: "INACTIVA", name: t("questions.inactiva") }] },
      render: (row) => (
        <ITFlex gap={1} align="center">
          <ITBadget color={row.status === "ACTIVA" ? "success" : "danger"} size="sm">{row.status === "ACTIVA" ? t("questions.activa") : t("questions.inactiva")}</ITBadget>
          {row.locked && <ITBadget color="secondary" size="sm">{t("questions.enUso")}</ITBadget>}
        </ITFlex>
      ),
    },
    ...(canEdit
      ? [{
          key: "actions", label: t("common:labels.actions"), type: "actions" as const, width: 100,
          actions: (row: Question) => (
            <ITFlex gap={1}>
              <ITButton variant="text" color="secondary" size="sm" ariaLabel={`${t("common:actions.edit")} ${row.enunciado}`} onClick={() => onAction("edit", row)}>
                <FaEdit size={12} />
              </ITButton>
              {row.status === "ACTIVA" ? (
                <ITButton variant="text" color="danger" size="sm" ariaLabel={`${t("common:actions.deactivate")} ${row.enunciado}`} onClick={() => onAction("deactivate", row)}>
                  <FaBan size={12} />
                </ITButton>
              ) : (
                <ITButton variant="text" color="success" size="sm" ariaLabel={`${t("common:actions.reactivate")} ${row.enunciado}`} onClick={() => onAction("reactivate", row)}>
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
    />
  );
}
