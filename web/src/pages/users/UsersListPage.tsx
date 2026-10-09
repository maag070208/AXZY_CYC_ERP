import { useState } from "react";
import { ITButton, ITConfirmDialog, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaPlus, FaSync, FaUsers } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import type { RootState } from "@app/store";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan, usersApi, type User } from "@entities/user";
import { useRoles } from "@entities/permission";
import { UsersTable, useUsersTable, type UserAction } from "@features/user/users-list";
import { UserFormDialog } from "@features/user/user-form";
import { DeactivateUserDialog, ResetPasswordDialog } from "@features/user/user-actions";
import { UserPermissionsDialog } from "@features/user/user-permissions";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/users`: listado server-side + alta/edición, baja/reactivación, desbloqueo y permisos. */
export default function UsersListPage() {
  const { t } = useTranslation(["users", "common"]);
  const crumbs = useBreadcrumbs();
  const notify = useNotify();
  const canCreate = useCan("users.create");
  const currentUserId = useSelector((s: RootState) => s.auth.user?.id);
  const fx = useUsersTable();
  const { roles } = useRoles();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [reactivating, setReactivating] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [permissionsOf, setPermissionsOf] = useState<User | null>(null);

  const done = (message: string) => {
    notify.success(message);
    fx.reload();
  };

  const onAction = async (action: UserAction, user: User) => {
    switch (action) {
      case "edit":
        setEditing(user);
        setFormOpen(true);
        return;
      case "deactivate":
        setDeactivating(user);
        return;
      case "reactivate":
        setReactivating(user);
        return;
      case "resetPassword":
        setResetting(user);
        return;
      case "permissions":
        setPermissionsOf(user);
        return;
      case "unlock":
        try {
          await usersApi.unlock(user.id);
          done(t("unlock.done"));
        } catch (err) {
          notify.error(errorMessage(err, t("common:errors.save")));
        }
    }
  };

  const reactivate = async () => {
    if (!reactivating) return;
    try {
      await usersApi.reactivate(reactivating.id);
      setReactivating(null);
      done(t("reactivate.done"));
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  return (
    <ITPage
      className="m-0! px-4! max-w-screen!"
      breadcrumbs={crumbs({ label: t("common:nav.users") })}
      title={t("list.title")}
      description={t("list.description", { count: fx.total })}
      noPadding
      icon={<FaUsers size={20} />}
      actions={
        <ITFlex gap={2}>
          <ITButton variant="outlined" color="secondary" onClick={fx.reload}>
            <ITFlex align="center" gap={1}>
              <FaSync size={11} />
              <ITText className="font-bold text-[11px]">{t("common:actions.reload")}</ITText>
            </ITFlex>
          </ITButton>
          {canCreate && (
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
                <ITText className="font-bold text-[11px]">{t("list.new")}</ITText>
              </ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      <UsersTable fx={fx} roles={roles} currentUserId={currentUserId} onAction={onAction} />

      {formOpen && (
        <UserFormDialog
          isOpen={formOpen}
          user={editing}
          roles={roles}
          currentUserId={currentUserId}
          onClose={() => setFormOpen(false)}
          onSaved={(_user, created) => {
            setFormOpen(false);
            done(created ? t("form.created") : t("form.saved"));
          }}
        />
      )}
      <DeactivateUserDialog
        user={deactivating}
        onClose={() => setDeactivating(null)}
        onDone={() => {
          setDeactivating(null);
          done(t("deactivate.done"));
        }}
      />
      <ResetPasswordDialog
        user={resetting}
        onClose={() => setResetting(null)}
        onDone={() => {
          setResetting(null);
          done(t("resetPassword.done"));
        }}
      />
      <ITConfirmDialog
        isOpen={!!reactivating}
        onClose={() => setReactivating(null)}
        onConfirm={() => void reactivate()}
        title={t("reactivate.title", { name: reactivating?.name ?? "" })}
        message={t("reactivate.message")}
        confirmLabel={t("actions.reactivate")}
        cancelLabel={t("common:actions.cancel")}
        variant="success"
      />
      <UserPermissionsDialog user={permissionsOf} onClose={() => setPermissionsOf(null)} />
    </ITPage>
  );
}
