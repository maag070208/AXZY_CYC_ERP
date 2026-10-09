import { useState } from "react";
import { ITBadget, ITButton, ITConfirmDialog, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import { FaEdit, FaPlus, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { permissionApi, type RoleAdmin } from "@entities/permission";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { PanelCard } from "@shared/ui/panel-card";
import RoleFormDialog from "./RoleFormDialog";

interface Props {
  roles: RoleAdmin[];
  onChanged: () => void;
}

/** Roles dinámicos: alta (con duplicado de permisos), edición y borrado. */
export default function RolesManager({ roles, onChanged }: Props) {
  const { t } = useTranslation(["roles", "common"]);
  const notify = useNotify();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoleAdmin | null>(null);
  const [deleting, setDeleting] = useState<RoleAdmin | null>(null);

  const remove = async () => {
    if (!deleting) return;
    try {
      await permissionApi.deleteRole(deleting.key);
      notify.success(t("roles.deleted"));
      setDeleting(null);
      onChanged();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  return (
    <PanelCard
      actions={
        <ITButton
          variant="filled"
          color="primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <ITFlex align="center" gap={1}>
            <FaPlus size={11} />
            <ITText className="font-bold text-[11px]">{t("roles.new")}</ITText>
          </ITFlex>
        </ITButton>
      }
    >
      <ITFlex direction="column" gap={2}>
        {roles.map((role) => (
          <div
            key={role.key}
            className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
            data-role={role.key}
          >
            <ITFlex direction="column">
              <ITFlex align="center" gap={2}>
                <ITText className="text-[12px] font-black text-slate-700">{role.name}</ITText>
                <ITText className="text-[10px] uppercase tracking-wide text-slate-400">{role.key}</ITText>
              </ITFlex>
              {role.module && <ITText className="text-[11px] text-slate-400">{role.module}</ITText>}
            </ITFlex>
            <ITFlex align="center" gap={2}>
              <ITText className="text-[11px] text-slate-500">
                {t("roles.users")}: {role.userCount}
              </ITText>
              {role.system && (
                <ITBadget color="info" size="sm">
                  {t("roles.system")}
                </ITBadget>
              )}
              {role.staff && (
                <ITBadget color="warning" size="sm">
                  {t("roles.staff")}
                </ITBadget>
              )}
              <ITBadget color={role.active ? "success" : "danger"} size="sm">
                {role.active ? t("common:labels.active") : t("common:labels.inactive")}
              </ITBadget>
              <ITButton
                variant="text"
                color="secondary"
                size="sm"
                ariaLabel={`${t("roles.edit")} ${role.key}`}
                onClick={() => {
                  setEditing(role);
                  setFormOpen(true);
                }}
              >
                <FaEdit size={12} />
              </ITButton>
              {!role.system && (
                <ITButton
                  variant="text"
                  color="danger"
                  size="sm"
                  ariaLabel={`${t("roles.delete")} ${role.key}`}
                  onClick={() => setDeleting(role)}
                >
                  <FaTrash size={12} />
                </ITButton>
              )}
            </ITFlex>
          </div>
        ))}
      </ITFlex>

      <RoleFormDialog
        isOpen={formOpen}
        role={editing}
        roles={roles}
        onClose={() => setFormOpen(false)}
        onSaved={(_role, created) => {
          setFormOpen(false);
          notify.success(created ? t("roles.created") : t("roles.saved"));
          onChanged();
        }}
      />
      <ITConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title={t("roles.deleteTitle", { key: deleting?.key ?? "" })}
        message={t("roles.deleteMessage")}
        confirmLabel={t("roles.delete")}
        cancelLabel={t("common:actions.cancel")}
        variant="danger"
      />
    </PanelCard>
  );
}
