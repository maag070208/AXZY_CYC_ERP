import { useState } from "react";
import { ITAlert, ITBadget, ITButton, ITConfirmDialog, ITFlex, ITLoader, ITText } from "@axzydev/axzy_ui_system";
import { FaEdit, FaPlus, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { permissionApi, type Policy, type RoleAdmin } from "@entities/permission";
import { dyn } from "@shared/i18n";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { PanelCard } from "@shared/ui/panel-card";
import { formatPolicyValue } from "../model/policyValue";
import { usePolicies } from "../model/usePolicies";
import PolicyFormDialog from "./PolicyFormDialog";

interface Props {
  roles: RoleAdmin[];
  onChanged?: () => void;
}

/** Políticas ABAC: listado por prioridad, alta, edición y borrado. */
export default function PoliciesManager({ roles, onChanged }: Props) {
  const { t } = useTranslation(["roles", "common"]);
  const tc = dyn(t);
  const notify = useNotify();
  const fx = usePolicies();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState<Policy | null>(null);

  const changed = (message: string) => {
    notify.success(message);
    void fx.reload();
    onChanged?.();
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await permissionApi.deletePolicy(deleting.id);
      setDeleting(null);
      changed(t("policies.deleted"));
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const roleName = (key: string) => roles.find((role) => role.key === key)?.name ?? key;

  return (
    <PanelCard
      description={t("policies.help")}
      actions={
        <ITButton
          variant="filled"
          color="primary"
          disabled={fx.actions.length === 0}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <ITFlex align="center" gap={1}>
            <FaPlus size={11} />
            <ITText className="font-bold text-[11px]">{t("policies.new")}</ITText>
          </ITFlex>
        </ITButton>
      }
    >
      {fx.error && <ITAlert variant="error">{fx.error}</ITAlert>}
      {fx.loading && fx.policies.length === 0 ? (
        <ITLoader />
      ) : fx.policies.length === 0 ? (
        <ITText className="text-[12px] text-slate-500">{t("policies.empty")}</ITText>
      ) : (
        <ITFlex direction="column" gap={2}>
          {fx.policies.map((policy) => (
            <div
              key={policy.id}
              className="flex items-start justify-between rounded-xl border border-slate-200 px-3 py-2"
              data-policy={policy.key}
            >
              <ITFlex direction="column" gap={1}>
                <ITFlex align="center" gap={2} wrap="wrap">
                  <ITBadget color={policy.effect === "DENY" ? "danger" : "success"} size="sm">
                    {t(`policies.${policy.effect}`)}
                  </ITBadget>
                  <ITText className="text-[12px] font-black text-slate-700">{policy.name}</ITText>
                  <ITText className="text-[10px] text-slate-400">{policy.key}</ITText>
                  {!policy.active && (
                    <ITBadget color="gray" size="sm">
                      {t("common:labels.inactive")}
                    </ITBadget>
                  )}
                </ITFlex>
                <ITText className="text-[11px] text-slate-500">
                  {policy.action} · {t("policies.priority")} {policy.priority}
                  {policy.roles.length > 0 && ` · ${policy.roles.map(roleName).join(", ")}`}
                </ITText>
                {policy.conditions.map((condition, index) => (
                  <ITText key={index} className="text-[11px] text-slate-600">
                    • {condition.field} {tc(`operators.${condition.operator}`)}{" "}
                    <code className="rounded bg-slate-100 px-1">{formatPolicyValue(condition.value) || "∅"}</code>
                  </ITText>
                ))}
              </ITFlex>
              <ITFlex gap={1}>
                <ITButton
                  variant="text"
                  color="secondary"
                  size="sm"
                  ariaLabel={`${t("policies.edit")} ${policy.key}`}
                  onClick={() => {
                    setEditing(policy);
                    setFormOpen(true);
                  }}
                >
                  <FaEdit size={12} />
                </ITButton>
                <ITButton
                  variant="text"
                  color="danger"
                  size="sm"
                  ariaLabel={`${t("policies.delete")} ${policy.key}`}
                  onClick={() => setDeleting(policy)}
                >
                  <FaTrash size={12} />
                </ITButton>
              </ITFlex>
            </div>
          ))}
        </ITFlex>
      )}

      <PolicyFormDialog
        isOpen={formOpen}
        policy={editing}
        actions={fx.actions}
        roles={roles}
        onClose={() => setFormOpen(false)}
        onSaved={(_policy, created) => {
          setFormOpen(false);
          changed(created ? t("policies.created") : t("policies.saved"));
        }}
      />
      <ITConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title={t("policies.deleteTitle", { key: deleting?.key ?? "" })}
        message={t("policies.deleteMessage")}
        confirmLabel={t("policies.delete")}
        cancelLabel={t("common:actions.cancel")}
        variant="danger"
      />
    </PanelCard>
  );
}
