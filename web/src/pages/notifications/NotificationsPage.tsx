import { useState } from "react";
import { ITAlert, ITButton, ITFlex, ITPage, ITTabs, ITText } from "@axzydev/axzy_ui_system";
import { FaBell, FaPaperPlane, FaSync } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { notificationApi, type NotificationItem, type NotificationTemplate } from "@entities/notification";
import { TemplatesTable, TemplateFormDialog } from "@features/notification/templates";
import { OutboxTable, SendDialog } from "@features/notification/outbox";
import { PreferencesTable } from "@features/notification/preferences";
import { InboxPanel } from "@features/notification/inbox";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/notifications` (M19): bandeja interna, plantillas, outbox y preferencias. */
export default function NotificationsPage() {
  const { t } = useTranslation(["notifications", "common"]);
  const crumbs = useBreadcrumbs();
  const notify = useNotify();
  const canView = useCan("notifications.view");
  const canManage = useCan("notifications.manage");
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [draining, setDraining] = useState(false);

  const bump = () => setReloadKey((k) => k + 1);

  const drain = async () => {
    setDraining(true);
    try {
      const result = await notificationApi.drain();
      notify.success(t("outbox.drained", { processed: result.processed, sent: result.sent, retrying: result.retrying, failed: result.failed }));
      bump();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    } finally {
      setDraining(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const items = [
    { id: "inbox", label: t("tabs.inbox"), content: <InboxPanel /> },
    ...(canView
      ? [
          {
            id: "templates",
            label: t("tabs.templates"),
            content: (
              <ITFlex direction="column" gap={3}>
                {canManage && (
                  <ITFlex justify="end">
                    <ITButton variant="filled" color="primary" onClick={openNew}>
                      <ITText className="text-[11px] font-bold">{t("templates.new")}</ITText>
                    </ITButton>
                  </ITFlex>
                )}
                <TemplatesTable reloadKey={reloadKey} onEdit={(tpl) => { setEditing(tpl); setFormOpen(true); }} onChanged={bump} />
              </ITFlex>
            ),
          },
          {
            id: "outbox",
            label: t("tabs.outbox"),
            content: (
              <ITFlex direction="column" gap={3}>
                <ITFlex justify="end" gap={2}>
                  {canManage && (
                    <ITButton variant="outlined" color="primary" disabled={draining} onClick={() => void drain()}>
                      <ITFlex align="center" gap={1}><FaSync size={11} /><ITText className="text-[11px] font-bold">{t("outbox.drain")}</ITText></ITFlex>
                    </ITButton>
                  )}
                  {canManage && (
                    <ITButton variant="filled" color="primary" onClick={() => setSendOpen(true)}>
                      <ITFlex align="center" gap={1}><FaPaperPlane size={11} /><ITText className="text-[11px] font-bold">{t("outbox.send")}</ITText></ITFlex>
                    </ITButton>
                  )}
                </ITFlex>
                <OutboxTable reloadKey={reloadKey} onChanged={bump} />
              </ITFlex>
            ),
          },
          { id: "preferences", label: t("tabs.preferences"), content: <PreferencesTable reloadKey={reloadKey} onChanged={bump} /> },
        ]
      : []),
  ];

  return (
    <ITPage
      breadcrumbs={crumbs({ label: t("common:nav.notifications") })}
      title={t("page.title")}
      description={t("page.description")}
      icon={<FaBell size={20} />}
    >
      <ITFlex direction="column" gap={4}>
        {!canView && <ITAlert variant="info">{t("page.noAdmin")}</ITAlert>}
        <ITTabs items={items} />
      </ITFlex>

      <TemplateFormDialog
        isOpen={formOpen}
        template={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          notify.success(editing ? t("templates.saved") : t("templates.created"));
          bump();
        }}
      />
      <SendDialog
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        onSent={(_item: NotificationItem) => {
          setSendOpen(false);
          notify.success(t("outbox.queued"));
          bump();
        }}
      />
    </ITPage>
  );
}
