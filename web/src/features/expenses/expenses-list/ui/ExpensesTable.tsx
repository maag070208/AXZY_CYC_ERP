import { useCallback } from "react";
import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaBan, FaEdit } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import {
  EXPENSE_STATUS_COLOR,
  EXPENSE_STATUSES,
  EXPENSE_TYPES,
  expenseApi,
  type Expense,
} from "@entities/expenses";
import { formatDay } from "@shared/lib/day";
import { formatMoney } from "@shared/lib/money";

export type ExpenseAction = "edit" | "cancel";

interface Props {
  reloadKey: number;
  /** Ciclo seleccionado; `undefined` = todos. */
  termId?: string;
  onAction: (action: ExpenseAction, expense: Expense) => void;
}

/** Gastos server-side (`POST /expenses/query`) con edición y cancelación. */
export default function ExpensesTable({ reloadKey, termId, onAction }: Props) {
  const { t, i18n } = useTranslation(["expenses", "common"]);
  const canManage = useCan("expenses.manage");
  const money = (v: number) => formatMoney(v, i18n.language);
  const typeMeta = (type: Expense["type"]) => EXPENSE_TYPES.find((x) => x.value === type);
  const typeLabel = (type: Expense["type"]) => t(`type.${type}`);
  const statusLabel = (status: Expense["status"]) => t(`status.${status}`);

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await expenseApi.table({
      page: params.page,
      limit: params.limit,
      // El ciclo del encabezado manda sobre el filtro por ciclo de la tabla.
      filters: { ...params.filters, ...(termId ? { termId } : {}) },
      sort: params.sort,
    });
    return {
      data: res.data as unknown as Record<string, unknown>[],
      total: res.total,
    };
  }, [termId]);

  const columns: Column<Expense>[] = [
    {
      key: "date", label: t("table.date"), type: "string", width: 130, filter: "date",
      render: (row) => (
        <div>
          <ITText className="block text-[12px] text-slate-700">{formatDay(row.date, i18n.language)}</ITText>
          {row.termName && <ITText className="text-[10px] text-slate-400">{row.termName}</ITText>}
        </div>
      ),
    },
    {
      key: "concept", label: t("table.concept"), type: "string", filter: true, truncate: true,
      render: (row) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{row.concept}</ITText>
          {row.notes && <ITText className="block truncate text-[10px] text-slate-400">{row.notes}</ITText>}
        </div>
      ),
    },
    {
      key: "vendor", label: t("table.vendor"), type: "string", width: 180, filter: true,
      render: (row) => (
        <ITText className="text-[12px] text-slate-600">{row.vendor ?? t("table.noVendor")}</ITText>
      ),
    },
    {
      key: "type", label: t("table.type"), type: "catalog", width: 150, filter: "catalog", sortable: false,
      catalogOptions: { data: EXPENSE_TYPES.map((x) => ({ id: x.value, name: typeLabel(x.value) })) },
      render: (row) => (
        <ITBadget color={typeMeta(row.type)?.color ?? "gray"} size="sm">
          {typeLabel(row.type)}
        </ITBadget>
      ),
    },
    {
      key: "amount", label: t("table.amount"), type: "number", width: 130, align: "right",
      render: (row) => (
        <ITText className="text-[12px] font-black text-slate-800">{money(row.amount)}</ITText>
      ),
    },
    {
      key: "dueDate", label: t("table.dueDate"), type: "string", width: 130, sortable: false,
      render: (row) => (
        <span
          className={`text-[12px] ${row.overdue ? "font-bold" : "text-slate-600"}`}
          style={row.overdue ? { color: "#dc2626" } : undefined}
        >
          {formatDay(row.dueDate, i18n.language)}
        </span>
      ),
    },
    {
      key: "status", label: t("table.status"), type: "catalog", width: 140, filter: "catalog", sortable: false,
      catalogOptions: { data: EXPENSE_STATUSES.map((s) => ({ id: s.value, name: statusLabel(s.value) })) },
      render: (row) => (
        <ITFlex gap={1} align="center">
          <ITBadget color={EXPENSE_STATUS_COLOR[row.status]} size="sm">{statusLabel(row.status)}</ITBadget>
          {row.overdue && <ITBadget color="danger" size="sm">{t("table.overdue")}</ITBadget>}
        </ITFlex>
      ),
    },
    ...(canManage
      ? [{
          key: "actions", label: t("common:labels.actions"), type: "actions" as const, width: 100,
          actions: (row: Expense) => (
            <ITFlex gap={1}>
              {row.status !== "CANCELLED" && (
                <ITButton variant="text" color="primary" size="sm" title={t("actions.edit")}
                  ariaLabel={`${t("actions.edit")} ${row.concept}`} onClick={() => onAction("edit", row)}>
                  <FaEdit size={12} />
                </ITButton>
              )}
              {row.status === "PENDING" && (
                <ITButton variant="text" color="danger" size="sm" title={t("actions.cancel")}
                  ariaLabel={`${t("actions.cancel")} ${row.concept}`} onClick={() => onAction("cancel", row)}>
                  <FaBan size={12} />
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
