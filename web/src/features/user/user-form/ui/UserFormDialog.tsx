import {
  ITAlert,
  ITButton,
  ITCheckbox,
  ITDialog,
  ITFlex,
  ITGrid,
  ITInput,
  ITText,
} from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import type { User } from "@entities/user";
import { roleLabel, type RoleAdmin } from "@entities/permission";
import { useUserForm } from "../model/useUserForm";

interface Props {
  isOpen: boolean;
  /** Cuenta a editar; `null` = alta. */
  user: User | null;
  roles: RoleAdmin[];
  /** Sobre la propia cuenta los roles se muestran pero no se editan. */
  currentUserId?: string;
  onClose: () => void;
  onSaved: (user: User, created: boolean) => void;
}

export default function UserFormDialog({ isOpen, user, roles, currentUserId, onClose, onSaved }: Props) {
  const { t } = useTranslation(["users", "common"]);
  const fx = useUserForm(user, (saved) => onSaved(saved, !user));
  const ownAccount = !!user && user.id === currentUserId;
  const assignable = roles.filter((role) => role.active || fx.form.roles.includes(role.key));

  return (
    <ITDialog
      isOpen={isOpen}
      onClose={onClose}
      title={fx.isEdit ? t("form.titleEdit") : t("form.titleNew")}
      className="w-full max-w-2xl"
    >
      <form
        role="dialog"
        aria-label={fx.isEdit ? t("form.titleEdit") : t("form.titleNew")}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void fx.submit();
        }}
      >
        <ITFlex direction="column" gap={4}>
          {fx.error && <ITAlert variant="error">{fx.error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="username"
                label={t("form.username")}
                value={fx.form.username}
                onChange={(e) => fx.setField("username", e.target.value)}
                onBlur={() => fx.blur("username")}
                disabled={fx.isEdit}
                required
                error={fx.errors.username}
              />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="name"
                label={t("form.name")}
                value={fx.form.name}
                onChange={(e) => fx.setField("name", e.target.value)}
                onBlur={() => fx.blur("name")}
                required
                error={fx.errors.name}
              />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="email"
                type="email"
                label={t("form.email")}
                value={fx.form.email}
                onChange={(e) => fx.setField("email", e.target.value)}
                onBlur={() => fx.blur("email")}
                required
                error={fx.errors.email}
              />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="phone"
                label={t("form.phone")}
                value={fx.form.phone}
                onChange={(e) => fx.setField("phone", e.target.value)}
              />
            </ITGrid>
            {!fx.isEdit && (
              <ITGrid item xs={12} md={6}>
                <ITInput
                  name="password"
                  type="password"
                  label={t("form.password")}
                  value={fx.form.password}
                  onChange={(e) => fx.setField("password", e.target.value)}
                  onBlur={() => fx.blur("password")}
                  required
                  error={fx.errors.password}
                />
                <ITText className="mt-1 block text-[11px] text-slate-400">{t("form.passwordHint")}</ITText>
              </ITGrid>
            )}
          </ITGrid>

          <fieldset>
            <ITText as="legend" className="text-[12px] font-bold text-slate-700">
              {t("form.roles")}
            </ITText>
            <ITText className="block text-[11px] text-slate-400">
              {ownAccount ? t("form.ownRoles") : t("form.rolesHint")}
            </ITText>
            <ITFlex gap={4} wrap="wrap" className="mt-2">
              {assignable.map((role) => (
                <ITCheckbox
                  key={role.key}
                  name={`role-${role.key}`}
                  label={roleLabel(role)}
                  checked={fx.form.roles.includes(role.key)}
                  disabled={ownAccount}
                  onChange={(checked) => fx.toggleRole(role.key, checked)}
                />
              ))}
            </ITFlex>
            {fx.errors.roles && (
              <span role="alert" className="mt-1 block text-xs text-red-500">
                {fx.errors.roles}
              </span>
            )}
          </fieldset>

          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>
              {t("form.cancel")}
            </ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={fx.saving}>
              {fx.saving ? t("form.saving") : t("form.save")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
