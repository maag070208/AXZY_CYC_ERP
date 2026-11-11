import { useCallback, useState } from "react";
import { ITBadget, ITButton, ITDataTable, ITFlex, ITSegmentedControl, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaBan, FaCashRegister } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import { CHARGE_STATUS_COLOR, CHARGE_STATUSES, chargeApi, type Charge } from "@entities/finance";
import { formatDay } from "@shared/lib/day";
import { formatMoney } from "@shared/lib/money";

export type ChargeAction = "pay" | "cancel";

/**
 * Filtros rápidos de cobranza. Por defecto «Sin pagar»: lo que hay que cobrar.
 * `filters` es lo que viaja a la API además del ciclo y el periodo.
 */
type QuickKey = "quick.pending" | "quick.overdue" | "quick.paid" | "quick.all";

const QUICK: Array<{ value: string; key: QuickKey; filters: Record<string, unknown> }> = [
  { value: "pending", key: "quick.pending", filters: { pending: true } },
  { value: "overdue", key: "quick.overdue", filters: { overdue: true } },
  { value: "paid", key: "quick.paid", filters: { pending: false } },
  { value: "all", key: "quick.all", filters: {} },
];

interface Props {
  reloadKey: number;
  /** Ciclo en curso de la pantalla ("" = todos). */
  termId: string;
  /** Rango de vencimientos del periodo elegido (`null` = todos). */
  dueRange: [Date, Date] | null;
  onAction: (action: ChargeAction, charge: Charge) => void;
}

/** Cargos server-side (`POST /charges/query`) con cobro y cancelación. */
export default function ChargesTable({ reloadKey, termId, dueRange, onAction }: Props) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const [quick, setQuick] = useState(QUICK[0]);
  const [quickTick, setQuickTick] = useState(0);
  const canPay = useCan("payments.register");
  const canCancel = useCan("charges.cancel");
  const money = (v: number) => formatMoney(v, i18n.language);

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    // El ciclo de la pantalla manda sobre los filtros de columna.
    // Ciclo y periodo de la pantalla mandan sobre los filtros de columna.
    const filters = {
      ...(params.filters ?? {}),
      ...(termId ? { termId } : {}),
      ...(dueRange ? { dueDate: dueRange } : {}),
      ...quick.filters,
    };
    const res = await chargeApi.table({ page: params.page, limit: params.limit, filters, sort: params.sort });
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, [termId, dueRange, quick]);

  const columns: Column<Charge>[] = [
    { key: "studentNumber", label: t("charges.studentNumber"), type: "string", width: 120, filter: true },
    {
      key: "studentName", label: t("charges.student"), type: "string",  width: 180,filter: true, sortable: false,
      render: (row) => <ITText className="text-[12px] font-bold text-slate-700">{row.studentName}</ITText>,
    },
    {
      key: "conceptName", label: t("charges.concept"), type: "string", width: 160,
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
    {
      // Un solo importe: el saldo (lo que se debe). El total solo se repite
      // cuando aporta algo —hubo pago o descuento— porque en un cargo intacto
      // son el mismo número.
      key: "balance", label: t("charges.balance"), type: "number", width: 140, sortable: false,
      render: (row) => (
        <div>
          <ITText className="block text-[12px] font-black tabular-nums text-slate-800">{money(row.balance)}</ITText>
          {(row.paid > 0 || row.discount > 0) && (
            <ITText className="block text-[10px] tabular-nums text-slate-400">
              {t("charges.total")} {money(row.total)}
              {row.paid > 0 ? ` · ${t("charges.paid")} ${money(row.paid)}` : ""}
            </ITText>
          )}
        </div>
      ),
    },
    {
      key: "status", label: t("charges.status"), type: "catalog", width: 140, filter: "catalog", sortable: false,
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
    <div className="flex flex-col gap-3">
      <ITSegmentedControl
        size="sm"
        value={quick.value}
        onChange={(value) => {
          const next = QUICK.find((item) => item.value === value);
          if (!next) return;
          setQuick(next);
          setQuickTick((n) => n + 1);
        }}
        options={QUICK.map((item) => ({ value: item.value, label: t(item.key) }))}
      />
    <ITDataTable
      showViewToggle={false}
      columns={columns as unknown as Column<Record<string, unknown>>[]}
      fetchData={fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
      reloadTrigger={reloadKey + quickTick}
      defaultItemsPerPage={25}
      itemsPerPageOptions={[25, 50, 100]}
      layout="fixed"
      density="compact"
      virtualized
      virtualizedMaxHeight={400}
      rowHeight={50}
    />
    </div>
  );
}
