import { useCallback } from "react";
import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaBan, FaReceipt } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import { PAYMENT_METHODS, paymentApi, type Payment } from "@entities/finance";
import { formatDay } from "@shared/lib/day";
import { formatMoney } from "@shared/lib/money";

export type PaymentAction = "receipt" | "cancel";

interface Props {
  reloadKey: number;
  onAction: (action: PaymentAction, payment: Payment) => void;
}

/** Pagos server-side (`POST /payments/query`) con recibo y cancelación. */
export default function PaymentsTable({ reloadKey, onAction }: Props) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const canCancel = useCan("payments.cancel");

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await paymentApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, []);

  const columns: Column<Payment>[] = [
    {
      key: "receiptNumber", label: t("payments.receiptNumber"), type: "string", width: 160, filter: true, sortable: false,
      render: (row) => <ITText className="font-mono text-[12px] font-bold text-slate-700">{row.receiptNumber}</ITText>,
    },
    {
      key: "date", label: t("payments.date"), type: "string", width: 120, sortable: false,
      render: (row) => <ITText className="text-[12px] text-slate-600">{formatDay(row.date, i18n.language)}</ITText>,
    },
    {
      key: "studentName", label: t("payments.student"), type: "string", filter: true,
      render: (row) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{row.studentName}</ITText>
          <ITText className="text-[10px] text-slate-400">{row.chargeDescription ?? row.conceptName}</ITText>
        </div>
      ),
    },
    {
      key: "method", label: t("payments.method"), type: "catalog", width: 140, filter: "catalog",
      catalogOptions: { data: PAYMENT_METHODS.map((m) => ({ id: m, name: t(`payments.methods.${m}`) })) },
      render: (row) => <ITText className="text-[12px] text-slate-600">{t(`payments.methods.${row.method}`)}</ITText>,
    },
    {
      key: "amount", label: t("payments.amount"), type: "number", width: 130, sortable: false,
      render: (row) => (
        <ITText className={`text-[12px] font-black ${row.cancelledAt ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {formatMoney(row.amount, i18n.language)}
        </ITText>
      ),
    },
    {
      key: "cancelled", label: t("payments.status"), type: "boolean", width: 120,
      render: (row) => (
        <span title={row.cancelReason ?? undefined}>
          <ITBadget color={row.cancelledAt ? "danger" : "success"} size="sm">{row.cancelledAt ? t("payments.statusCancelled") : t("payments.current")}</ITBadget>
        </span>
      ),
    },
    { key: "registeredByName", label: t("payments.registeredBy"), type: "string", width: 150 },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 100,
      actions: (row) => (
        <ITFlex gap={1}>
          <ITButton variant="text" color="primary" size="sm" title={t("payments.receiptPdf")}
            ariaLabel={`${t("payments.receiptPdf")} ${row.receiptNumber}`} onClick={() => onAction("receipt", row)}>
            <FaReceipt size={12} />
          </ITButton>
          {canCancel && !row.cancelledAt && (
            <ITButton variant="text" color="danger" size="sm" title={t("payments.cancel")}
              ariaLabel={`${t("payments.cancel")} ${row.receiptNumber}`} onClick={() => onAction("cancel", row)}>
              <FaBan size={12} />
            </ITButton>
          )}
        </ITFlex>
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
