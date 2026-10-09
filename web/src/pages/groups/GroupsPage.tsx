import { useState } from "react";
import { ITButton, ITConfirmDialog, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaLayerGroup, FaPlus, FaSync } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { groupApi, type Group } from "@entities/group";
import { GroupsTable, useGroupsTable, type GroupAction } from "@features/group/groups-list";
import { GroupFormDialog } from "@features/group/group-form";

/** `/groups` (M07): grupos por ciclo con cupo, horario y profesor. */
export default function GroupsPage() {
  const { t } = useTranslation(["courses", "common"]);
  const notify = useNotify();
  const navigate = useNavigate();
  const canManage = useCan("groups.manage");
  const fx = useGroupsTable();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [toggling, setToggling] = useState<{ group: Group; active: boolean } | null>(null);

  const onAction = (action: GroupAction, group: Group) => {
    if (action === "view") navigate(`/groups/${group.id}`);
    else if (action === "edit") {
      setEditing(group);
      setFormOpen(true);
    } else setToggling({ group, active: action === "reactivate" });
  };

  const toggle = async () => {
    if (!toggling) return;
    try {
      if (toggling.active) await groupApi.reactivate(toggling.group.id);
      else await groupApi.deactivate(toggling.group.id);
      notify.success(toggling.active ? t("groups.reactivated") : t("groups.deactivated"));
      setToggling(null);
      fx.reload();
    } catch (err) {
      setToggling(null);
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const name = toggling ? `${toggling.group.courseNombre} ${toggling.group.name}` : "";
  return (
    <ITPage
      noPadding
      title={t("groups.title")}
      description={t("groups.description", { count: fx.total })}
      icon={<FaLayerGroup size={20} />}
      actions={
        <ITFlex gap={2}>
          <ITButton variant="outlined" color="secondary" onClick={fx.reload}>
            <ITFlex align="center" gap={1}><FaSync size={11} /><ITText className="font-bold text-[11px]">{t("common:actions.reload")}</ITText></ITFlex>
          </ITButton>
          {canManage && (
            <ITButton variant="filled" color="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="font-bold text-[11px]">{t("groups.new")}</ITText></ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      <GroupsTable fx={fx} onAction={onAction} />
      <GroupFormDialog
        isOpen={formOpen}
        group={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(saved, created) => {
          setFormOpen(false);
          notify.success(created ? t("groups.created") : t("groups.saved"));
          if (created) navigate(`/groups/${saved.id}`);
          else fx.reload();
        }}
      />
      <ITConfirmDialog
        isOpen={!!toggling}
        onClose={() => setToggling(null)}
        onConfirm={() => void toggle()}
        title={toggling?.active ? t("common:actions.reactivate") : t("groups.deactivateTitle", { name })}
        message={toggling?.active ? name : t("groups.deactivateMessage")}
        confirmLabel={toggling?.active ? t("common:actions.reactivate") : t("common:actions.deactivate")}
        cancelLabel={t("common:actions.cancel")}
        variant={toggling?.active ? "success" : "danger"}
      />
    </ITPage>
  );
}
