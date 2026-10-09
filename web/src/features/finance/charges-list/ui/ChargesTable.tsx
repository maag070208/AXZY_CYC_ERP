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
    { key: "matricula", label: t("charges.matricula"), type: "string", width: 120, filter: true },
    {
      key: "studentNombre", label: t("charges.alumno"), type: "string", filter: true, sortable: true,
      render: (row) => <ITText className="text-[12px] font-bold text-slate-700">{row.studentNombre}</ITText>,
    },
    {
      key: "conceptNombre", label: t("charges.concepto"), type: "string", width: 220,
      render: (row) => (
        <div>
          <ITText className="block text-[12px] text-slate-700">{row.descripcion ?? row.conceptNombre}</ITText>
          {row.termNombre && <ITText className="text-[10px] text-slate-400">{row.termNombre}</ITText>}
        </div>
      ),
    },
    {
      key: "fechaVencimiento", label: t("charges.vencimiento"), type: "string", width: 130, sortable: true,
      render: (row) => (
        <span className={`text-[12px] ${row.vencido ? "font-bold" : "text-slate-600"}`} style={row.vencido ? { color: "#dc2626" } : undefined}>
          {formatDay(row.fechaVencimiento, i18n.language)}
        </span>
      ),
    },
    { key: "total", label: t("charges.total"), type: "number", width: 120, render: (row) => <ITText className="text-[12px] text-slate-700">{money(row.total)}</ITText> },
    { key: "saldo", label: t("charges.saldo"), type: "number", width: 120, render: (row) => <ITText className="text-[12px] font-black text-slate-800">{money(row.saldo)}</ITText> },
    {
      key: "status", label: t("charges.status"), type: "catalog", width: 120, filter: "catalog", sortable: true,
      catalogOptions: { data: CHARGE_STATUSES.map((s) => ({ id: s, name: t(`charges.statuses.${s}`) })) },
      render: (row) => (
        <ITFlex gap={1} align="center">
          <ITBadget color={CHARGE_STATUS_COLOR[row.status]} size="sm">{t(`charges.statuses.${row.status}`)}</ITBadget>
          {row.vencido && <ITBadget color="danger" size="sm">{t("charges.vencido")}</ITBadget>}
        </ITFlex>
      ),
    },
    ...(canPay || canCancel
      ? [{
          key: "actions", label: t("common:labels.actions"), type: "actions" as const, width: 100,
          actions: (row: Charge) => (
            <ITFlex gap={1}>
              {canPay && (row.status === "PENDIENTE" || row.status === "PARCIAL") && (
                <ITButton variant="text" color="success" size="sm" title={t("charges.pay")}
                  ariaLabel={`${t("charges.pay")} ${row.studentNombre} ${row.descripcion ?? row.conceptNombre}`} onClick={() => onAction("pay", row)}>
                  <FaCashRegister size={12} />
                </ITButton>
              )}
              {canCancel && row.status === "PENDIENTE" && (
                <ITButton variant="text" color="danger" size="sm" title={t("charges.cancel")}
                  ariaLabel={`${t("charges.cancel")} ${row.studentNombre} ${row.descripcion ?? row.conceptNombre}`} onClick={() => onAction("cancel", row)}>
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
    />
  );
}
