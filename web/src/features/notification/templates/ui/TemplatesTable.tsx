import { useCallback } from "react";
import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaEdit, FaPowerOff, FaRedo } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { templateApi, type NotificationTemplate } from "@entities/notification";

interface Props {
  reloadKey: number;
  onTotal?: (total: number) => void;
  onEdit: (template: NotificationTemplate) => void;
  onChanged: () => void;
}

/** Plantillas de notificación por clave y canal (M19 §4.1). */
export default function TemplatesTable({ reloadKey, onTotal, onEdit, onChanged }: Props) {
  const { t } = useTranslation(["notifications", "common"]);
  const notify = useNotify();
  const canManage = useCan("notifications.manage");

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await templateApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    onTotal?.(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, [onTotal]);

  const toggle = async (row: NotificationTemplate) => {
    try {
      if (row.active) await templateApi.deactivate(row.id);
      else await templateApi.reactivate(row.id);
      notify.success(row.active ? t("templates.deactivated") : t("templates.reactivated"));
      onChanged();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const columns: Column<NotificationTemplate>[] = [
    {
      key: "name", label: t("templates.name"), type: "string", filter: true, sortable: false,
      render: (r) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{r.name}</ITText>
          <ITText className="font-mono text-[10px] text-slate-400">{r.code}</ITText>
        </div>
      ),
    },
    {
      key: "channel", label: t("templates.channel"), type: "catalog", width: 120, filter: "catalog", sortable: false,
      catalogOptions: { data: (["EMAIL", "SMS", "WHATSAPP", "IN_APP"] as const).map((c) => ({ id: c, name: t(`channels.${c}`) })) },
      render: (r) => <ITBadget color="secondary" size="sm">{t(`channels.${r.channel}`)}</ITBadget>,
    },
    { key: "sentCount", label: t("templates.sentCount"), type: "number", width: 100 },
    {
      key: "required", label: t("templates.required"), type: "string", width: 110,
      render: (r) => <ITText className="text-[11px] text-slate-500">{r.required ? t("common:labels.yes") : t("common:labels.no")}</ITText>,
    },
    {
      key: "active", label: t("templates.state"), type: "string", width: 110,
      render: (r) => <ITBadget color={r.active ? "success" : "danger"} size="sm">{r.active ? t("common.active") : t("common.inactive")}</ITBadget>,
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 110,
      actions: (r) => (
        <ITFlex gap={1}>
          {canManage && (
            <ITButton variant="text" color="primary" size="sm" title={t("common:actions.edit")} ariaLabel={`${t("common:actions.edit")} ${r.name}`} onClick={() => onEdit(r)}>
              <FaEdit size={12} />
            </ITButton>
          )}
          {canManage && (
            <ITButton variant="text" color={r.active ? "danger" : "success"} size="sm" title={r.active ? t("common:actions.deactivate") : t("common:actions.reactivate")} ariaLabel={`${r.active ? t("common:actions.deactivate") : t("common:actions.reactivate")} ${r.name}`} onClick={() => void toggle(r)}>
              {r.active ? <FaPowerOff size={12} /> : <FaRedo size={12} />}
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
