import { useCallback, useEffect, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITFlex, ITLoader, ITText } from "@axzydev/axzy_ui_system";
import { FaBell, FaCheckDouble, FaSync } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { notificationApi, type MyNotifications } from "@entities/notification";
import { formatInstant } from "@shared/lib/day";
import { PanelCard } from "@shared/ui/panel-card";

/** Bandeja interna del usuario (campana): avisos ya enviados por el canal INTERNO (M19 §4.5). */
export default function InboxPanel() {
  const { t, i18n } = useTranslation(["notifications", "common"]);
  const notify = useNotify();
  const [data, setData] = useState<MyNotifications | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(() => {
    notificationApi
      .mine()
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [t]);

  useEffect(load, [load, reload]);

  const markAll = async () => {
    try {
      await notificationApi.markRead({ all: true });
      notify.success(t("inbox.marked"));
      setReload((n) => n + 1);
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const markOne = async (id: string) => {
    try {
      await notificationApi.markRead({ ids: [id] });
      setReload((n) => n + 1);
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  return (
    <PanelCard
      title={t("inbox.title")}
      description={data ? t("inbox.description", { count: data.unread }) : undefined}
      actions={
        <ITFlex gap={2}>
          <ITButton variant="outlined" color="secondary" size="sm" onClick={() => setReload((n) => n + 1)}>
            <ITFlex align="center" gap={1}><FaSync size={11} /><ITText className="text-[11px]">{t("common:actions.reload")}</ITText></ITFlex>
          </ITButton>
          {!!data?.unread && (
            <ITButton variant="filled" color="primary" size="sm" onClick={() => void markAll()}>
              <ITFlex align="center" gap={1}><FaCheckDouble size={11} /><ITText className="text-[11px] font-bold">{t("inbox.markAll")}</ITText></ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      {error && <ITAlert variant="error">{error}</ITAlert>}
      {!data && !error && <ITLoader />}
      {data && data.data.length === 0 && <ITAlert variant="info">{t("inbox.empty")}</ITAlert>}
      {data && data.data.length > 0 && (
        <ITFlex direction="column" gap={2}>
          {data.data.map((item) => (
            <ITFlex key={item.id} align="start" gap={3}
              className={`rounded-xl border px-3 py-2 ${item.readAt ? "border-slate-100 bg-white" : "border-sky-200 bg-sky-50"}`}>
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.readAt ? "bg-slate-100 text-slate-400" : "bg-sky-100 text-sky-600"}`}>
                <FaBell size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <ITFlex justify="between" align="center" gap={2}>
                  <ITText className="text-[12px] font-bold text-slate-700">{item.asunto ?? item.origen}</ITText>
                  <ITText className="shrink-0 text-[10px] text-slate-400">{formatInstant(item.createdAt, i18n.language)}</ITText>
                </ITFlex>
                <ITText className="mt-0.5 block whitespace-pre-wrap text-[12px] text-slate-600">{item.cuerpo}</ITText>
              </div>
              {!item.readAt && (
                <ITButton variant="text" color="primary" size="sm" ariaLabel={t("inbox.markOne")} onClick={() => void markOne(item.id)}>
                  <FaCheckDouble size={12} />
                </ITButton>
              )}
            </ITFlex>
          ))}
          <ITFlex justify="end">
            <ITBadget color="secondary" size="sm">{t("inbox.total", { count: data.data.length })}</ITBadget>
          </ITFlex>
        </ITFlex>
      )}
    </PanelCard>
  );
}
