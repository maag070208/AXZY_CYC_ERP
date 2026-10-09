import { useCallback, useEffect, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITDataTable, ITDialog, ITFlex, ITSelect, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaBellSlash, FaPlus, FaUndo } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { preferenceApi, NOTIFICATION_CHANNELS, type NotificationChannel, type NotificationPreference } from "@entities/notification";

interface Props {
  reloadKey: number;
  onTotal?: (total: number) => void;
  onChanged: () => void;
}

interface Draft {
  channel: NotificationChannel;
  recipient: string;
  optOut: boolean;
}

/** Bajas por destinatario y canal; los avisos obligatorios no se pueden dar de baja (M19 §4.4). */
export default function PreferencesTable({ reloadKey, onTotal, onChanged }: Props) {
  const { t } = useTranslation(["notifications", "common"]);
  const notify = useNotify();
  const canManage = useCan("notifications.manage");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await preferenceApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    onTotal?.(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, [onTotal]);

  useEffect(() => {
    if (draft) setError(null);
  }, [draft]);

  const save = async () => {
    if (!draft) return;
    if (!draft.recipient.trim()) {
      setError(t("common:validation.required", { label: t("preferences.destinatario") }));
      return;
    }
    setBusy(true);
    try {
      await preferenceApi.set({ ...draft, recipient: draft.recipient.trim(), reason: reason.trim() || null });
      notify.success(draft.optOut ? t("preferences.optedOut") : t("preferences.restored"));
      setDraft(null);
      onChanged();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<NotificationPreference>[] = [
    {
      key: "recipient", label: t("preferences.destinatario"), type: "string", filter: true, sortable: false,
      render: (r) => <ITText className="text-[12px] font-bold text-slate-700">{r.recipient}</ITText>,
    },
    {
      key: "channel", label: t("outbox.canal"), type: "catalog", width: 120, filter: "catalog", sortable: false,
      catalogOptions: { data: NOTIFICATION_CHANNELS.map((c) => ({ id: c, name: t(`channels.${c}`) })) },
      render: (r) => <ITBadget color="secondary" size="sm">{t(`channels.${r.channel}`)}</ITBadget>,
    },
    {
      key: "optOut", label: t("preferences.estado"), type: "string", width: 140,
      render: (r) => <ITBadget color={r.optOut ? "danger" : "success"} size="sm">{r.optOut ? t("preferences.baja") : t("common.active")}</ITBadget>,
    },
    { key: "reason", label: t("preferences.motivo"), type: "string", render: (r) => <ITText className="text-[11px] text-slate-500">{r.reason ?? "—"}</ITText> },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 70,
      actions: (r) => (
        canManage ? (
          <ITButton variant="text" color={r.optOut ? "success" : "danger"} size="sm"
            title={r.optOut ? t("preferences.restore") : t("preferences.optOut")}
            ariaLabel={`${r.optOut ? t("preferences.restore") : t("preferences.optOut")} ${r.recipient}`}
            onClick={() => { setMotivo(r.reason ?? ""); setDraft({ channel: r.channel, recipient: r.recipient, optOut: !r.optOut }); }}>
            {r.optOut ? <FaUndo size={11} /> : <FaBellSlash size={12} />}
          </ITButton>
        ) : null
      ),
    },
  ];

  const title = draft?.optOut ? t("preferences.optOutTitle") : t("preferences.restoreTitle");
  return (
    <>
      <ITFlex justify="end" className="mb-3">
        {canManage && (
          <ITButton variant="filled" color="primary" onClick={() => { setMotivo(""); setDraft({ channel: "EMAIL", recipient: "", optOut: true }); }}>
            <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="text-[11px] font-bold">{t("preferences.new")}</ITText></ITFlex>
          </ITButton>
        )}
      </ITFlex>
      <ITDataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        fetchData={fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
        reloadTrigger={reloadKey}
        defaultItemsPerPage={25}
        itemsPerPageOptions={[25, 50, 100]}
        layout="fixed"
        density="compact"
      />
      <ITDialog isOpen={!!draft} onClose={() => setDraft(null)} title={title} className="w-full max-w-lg">
        <div role="dialog" aria-label={title}>
          <ITFlex direction="column" gap={4}>
            {error && <ITAlert variant="error">{error}</ITAlert>}
            <ITSelect name="channel" label={t("outbox.canal")} value={draft?.channel ?? "EMAIL"}
              options={NOTIFICATION_CHANNELS.map((c) => ({ value: c, label: t(`channels.${c}`) }))}
              onChange={(e) => setDraft((d) => (d ? { ...d, channel: e.target.value as NotificationChannel } : d))} />
            <ITTextarea name="reason" label={t("preferences.motivo")} value={reason} onChange={setMotivo} rows={2} maxLength={300} />
            <ITFlex justify="end" gap={2}>
              <ITButton variant="outlined" color="secondary" onClick={() => setDraft(null)}>{t("common:actions.cancel")}</ITButton>
              <ITButton variant="filled" color={draft?.optOut ? "danger" : "success"} disabled={busy} onClick={() => void save()}>
                {draft?.optOut ? t("preferences.optOut") : t("preferences.restore")}
              </ITButton>
            </ITFlex>
          </ITFlex>
        </div>
      </ITDialog>
    </>
  );
}
