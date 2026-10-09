import { useCallback } from "react";
import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaRedo } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { notificationApi, type NotificationItem, type NotificationStatus } from "@entities/notification";
import { formatInstant } from "@shared/lib/day";

interface Props {
  reloadKey: number;
  onTotal?: (total: number) => void;
  onChanged: () => void;
}

const STATUS_COLOR: Record<NotificationStatus, "warning" | "success" | "danger" | "secondary"> = {
  QUEUED: "warning",
  SENT: "success",
  FAILED: "danger",
  SKIPPED: "secondary",
};

/** Historial del outbox con reintento de fallidos (M19 §4.2–4.3). */
export default function OutboxTable({ reloadKey, onTotal, onChanged }: Props) {
  const { t, i18n } = useTranslation(["notifications", "common"]);
  const notify = useNotify();
  const canManage = useCan("notifications.manage");

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await notificationApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    onTotal?.(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, [onTotal]);

  const retry = async (row: NotificationItem) => {
    try {
      await notificationApi.retry(row.id);
      notify.success(t("outbox.retried"));
      onChanged();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const columns: Column<NotificationItem>[] = [
    {
      key: "recipient", label: t("outbox.recipient"), type: "string", filter: true, sortable: false,
      render: (r) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{r.recipient}</ITText>
          <ITText className="text-[10px] text-slate-400">{r.origin}{r.templateCode ? ` · ${r.templateCode}` : ""}</ITText>
        </div>
      ),
    },
    {
      key: "channel", label: t("outbox.channel"), type: "catalog", width: 110, filter: "catalog", sortable: false,
      catalogOptions: { data: (["EMAIL", "SMS", "WHATSAPP", "IN_APP"] as const).map((c) => ({ id: c, name: t(`channels.${c}`) })) },
      render: (r) => <ITBadget color="secondary" size="sm">{t(`channels.${r.channel}`)}</ITBadget>,
    },
    {
      key: "subject", label: t("outbox.subject"), type: "string",
      render: (r) => <ITText className="line-clamp-2 text-[12px] text-slate-600">{r.subject ? `${r.subject} — ` : ""}{r.body}</ITText>,
    },
    {
      key: "status", label: t("outbox.state"), type: "catalog", width: 120, filter: "catalog", sortable: false,
      catalogOptions: { data: (["QUEUED", "SENT", "FAILED", "SKIPPED"] as const).map((s) => ({ id: s, name: t(`status.${s}`) })) },
      render: (r) => (
        <ITFlex direction="column" gap={1}>
          <ITBadget color={STATUS_COLOR[r.status]} size="sm">{t(`status.${r.status}`)}</ITBadget>
          <ITText className="text-[10px] text-slate-400">{t("outbox.attempts", { n: r.attempts, max: r.maxAttempts })}</ITText>
          {r.error && <ITText className="text-[10px] text-rose-500">{r.error}</ITText>}
        </ITFlex>
      ),
    },
    {
      key: "createdAt", label: t("outbox.date"), type: "date", width: 170, sortable: false,
      render: (r) => <ITText className="text-[11px] text-slate-500">{formatInstant(r.sentAt ?? r.createdAt, i18n.language)}</ITText>,
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 80,
      actions: (r) => (
        canManage && (r.status === "FAILED" || r.status === "SKIPPED") ? (
          <ITButton variant="text" color="primary" size="sm" title={t("outbox.retry")} ariaLabel={`${t("outbox.retry")} ${r.recipient}`} onClick={() => void retry(r)}>
            <FaRedo size={12} />
          </ITButton>
        ) : null
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
      virtualized
      virtualizedMaxHeight={400}
      rowHeight={50}
    />
  );
}
