import { useEffect, useState } from "react";
import {
  ITAlert,
  ITButton,
  ITCheckbox,
  ITDialog,
  ITFlex,
  ITGrid,
  ITInput,
  ITSelect,
  ITText,
} from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { permissionApi, type RoleAdmin } from "@entities/permission";
import { errorMessage } from "@app/toast/useNotify";

interface Props {
  isOpen: boolean;
  /** Rol a editar; `null` = alta. */
  role: RoleAdmin | null;
  roles: RoleAdmin[];
  onClose: () => void;
  onSaved: (role: RoleAdmin, created: boolean) => void;
}

const ROLE_KEY = /^[A-Z][A-Z0-9_]*$/;

export default function RoleFormDialog({ isOpen, role, roles, onClose, onSaved }: Props) {
  const { t } = useTranslation(["roles", "common"]);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [module, setModule] = useState("");
  const [staff, setStaff] = useState(false);
  const [active, setActive] = useState(true);
  const [copyFrom, setCopyFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setKey(role?.key ?? "");
    setName(role?.name ?? "");
    setModule(role?.module ?? "");
    setStaff(role?.staff ?? false);
    setActive(role?.active ?? true);
    setCopyFrom("");
    setError(null);
  }, [role, isOpen]);

  const keyInvalid = !role && key.length > 0 && !ROLE_KEY.test(key);
  const canSave = !!name.trim() && (role ? true : ROLE_KEY.test(key));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (role) {
        const saved = await permissionApi.updateRole(role.key, {
          ...(role.system ? {} : { name: name.trim(), active }),
          module: module.trim() || null,
          staff,
        });
        onSaved(saved, false);
      } else {
        const saved = await permissionApi.createRole({
          key,
          name: name.trim(),
          ...(module.trim() ? { module: module.trim() } : {}),
          staff,
          ...(copyFrom ? { copyFrom } : {}),
        });
        onSaved(saved, true);
      }
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ITDialog
      isOpen={isOpen}
      onClose={onClose}
      title={role ? t("roles.edit") : t("roles.new")}
      className="w-full max-w-xl"
    >
      <form
        role="dialog"
        aria-label={role ? t("roles.edit") : t("roles.new")}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void save();
        }}
      >
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          {role?.system && <ITAlert variant="info">{t("roles.systemHint")}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="roleKey"
                label={t("roles.key")}
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                disabled={!!role}
                required
                error={keyInvalid ? t("roles.keyHint") : undefined}
              />
              {!role && <ITText className="mt-1 block text-[11px] text-slate-400">{t("roles.keyHint")}</ITText>}
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="roleName"
                label={t("roles.name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!!role?.system}
                required
              />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="roleModule"
                label={t("roles.module")}
                value={module}
                onChange={(e) => setModule(e.target.value)}
              />
            </ITGrid>
            {!role && (
              <ITGrid item xs={12} md={6}>
                <ITSelect
                  name="copyFrom"
                  label={t("roles.copyFrom")}
                  placeholder={t("roles.copyNone")}
                  value={copyFrom}
                  options={roles.map((r) => ({ value: r.key, label: r.name }))}
                  onChange={(e) => setCopyFrom(e.target.value)}
                />
              </ITGrid>
            )}
          </ITGrid>
          <ITFlex gap={4}>
            <ITCheckbox name="roleStaff" label={t("roles.staff")} checked={staff} onChange={setStaff} />
            {role && !role.system && (
              <ITCheckbox name="roleActive" label={t("roles.active")} checked={active} onChange={setActive} />
            )}
          </ITFlex>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>
              {t("common:actions.cancel")}
            </ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving || !canSave}>
              {saving ? t("common:actions.saving") : t("common:actions.save")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
