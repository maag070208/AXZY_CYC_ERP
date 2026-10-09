import { useCallback } from "react";
import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaBan, FaCashRegister } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import { CHARGE_STATUS_COLOR, CHARGE_STATUSES, chargeApi, type Charge } from "@entities/finance";
import { formatDay } from "@shared/lib/day";
import { formatMoney } from "@shared/lib/money";

export type ChargeAction = "pay" | "cancel";

interface Props {
  reloadKey: number;
  onAction: (action: ChargeAction, charge: Charge) => void;
}

/** Cargos server-side (`POST /charges/query`) con cobro y cancelación. */
export default function ChargesTable({ reloadKey, onAction }: Props) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const canPay = useCan("payments.register");
  const canCancel = useCan("charges.cancel");
  const money = (v: number) => formatMoney(v, i18n.language);

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await chargeApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, []);

  const columns: Column<Charge>[] = [
    { key: "studentNumber", label: t("charges.studentNumber"), type: "string", width: 120, filter: true },
    {
      key: "studentName", label: t("charges.student"), type: "string", filter: true, sortable: false,
      render: (row) => <ITText className="text-[12px] font-bold text-slate-700">{row.studentName}</ITText>,
    },
    {
      key: "conceptName", label: t("charges.concept"), type: "string", width: 220,
      render: (row) => (
        <div>
          <ITText className="block text-[12px] text-slate-700">{row.description ?? row.conceptName}</ITText>
          {row.termName && <ITText className="text-[10px] text-slate-400">{row.termName}</ITText>}
        </div>
      ),
    },
    {
      key: "dueDate", label: t("charges.dueDate"), type: "string", width: 130, sortable: false,
      render: (row) => (
        <span className={`text-[12px] ${row.overdue ? "font-bold" : "text-slate-600"}`} style={row.overdue ? { color: "#dc2626" } : undefined}>
          {formatDay(row.dueDate, i18n.language)}
        </span>
      ),
    },
    { key: "total", label: t("charges.total"), type: "number", width: 120, render: (row) => <ITText className="text-[12px] text-slate-700">{money(row.total)}</ITText> },
    { key: "balance", label: t("charges.balance"), type: "number", width: 120, render: (row) => <ITText className="text-[12px] font-black text-slate-800">{money(row.balance)}</ITText> },
    {
      key: "status", label: t("charges.status"), type: "catalog", width: 120, filter: "catalog", sortable: false,
      catalogOptions: { data: CHARGE_STATUSES.map((s) => ({ id: s, name: t(`charges.statuses.${s}`) })) },
      render: (row) => (
        <ITFlex gap={1} align="center">
          <ITBadget color={CHARGE_STATUS_COLOR[row.status]} size="sm">{t(`charges.statuses.${row.status}`)}</ITBadget>
          {row.overdue && <ITBadget color="danger" size="sm">{t("charges.overdue")}</ITBadget>}
        </ITFlex>
      ),
    },
    ...(canPay || canCancel
      ? [{
          key: "actions", label: t("common:labels.actions"), type: "actions" as const, width: 100,
          actions: (row: Charge) => (
            <ITFlex gap={1}>
              {canPay && (row.status === "PENDING" || row.status === "PARTIAL") && (
                <ITButton variant="text" color="success" size="sm" title={t("charges.pay")}
                  ariaLabel={`${t("charges.pay")} ${row.studentName} ${row.description ?? row.conceptName}`} onClick={() => onAction("pay", row)}>
                  <FaCashRegister size={12} />
                </ITButton>
              )}
              {canCancel && row.status === "PENDING" && (
                <ITButton variant="text" color="danger" size="sm" title={t("charges.cancel")}
                  ariaLabel={`${t("charges.cancel")} ${row.studentName} ${row.description ?? row.conceptName}`} onClick={() => onAction("cancel", row)}>
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
