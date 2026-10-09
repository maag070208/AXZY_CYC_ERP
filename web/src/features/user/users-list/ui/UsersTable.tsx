import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type {
  Column,
  ITDataTableFetchParams,
  ITDataTableResponse,
} from "@axzydev/axzy_ui_system";
import { FaEdit, FaKey, FaLockOpen, FaUndo, FaUserShield, FaUserSlash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan, type User } from "@entities/user";
import { roleLabel, type RoleAdmin } from "@entities/permission";
import type { UseUsersTable } from "../model/useUsersTable";

export type UserAction = "edit" | "deactivate" | "reactivate" | "unlock" | "resetPassword" | "permissions";

interface Props {
  fx: UseUsersTable;
  roles: RoleAdmin[];
  /** Id de la sesión: sobre la propia cuenta no se ofrecen bajas ni permisos. */
  currentUserId?: string;
  onAction: (action: UserAction, user: User) => void;
}

const formatDate = (iso: string | null, locale: string): string | null =>
  iso ? new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : null;

export default function UsersTable({ fx, roles, currentUserId, onAction }: Props) {
  const { t, i18n } = useTranslation(["users", "common"]);
  const canEdit = useCan("users.edit");
  const canDelete = useCan("users.delete");
  const canPermissions = useCan("users.permissions");
  const roleName = (key: string) => roleLabel(roles.find((role) => role.key === key) ?? { key });

  const actionButton = (action: UserAction, user: User, icon: React.ReactNode, color = "secondary") => (
    <ITButton
      key={action}
      variant="text"
      color={color as "secondary"}
      size="sm"
      title={t(`actions.${action}`)}
      ariaLabel={`${t(`actions.${action}`)} ${user.username}`}
      onClick={() => onAction(action, user)}
    >
      {icon}
    </ITButton>
  );

  const columns: Column<User>[] = [
    {
      key: "username",
      label: t("table.username"),
      type: "string",
      width: 170,
      filter: true,
      sortable: false,
      render: (u) => <ITText className="text-[12px] font-black text-slate-700">@{u.username}</ITText>,
    },
    {
      key: "name",
      label: t("table.name"),
      type: "string",
      width: 220,
      filter: true,
      sortable: false,
      render: (u) => <ITText className="text-[12px] text-slate-800">{u.name}</ITText>,
    },
    {
      key: "email",
      label: t("table.email"),
      type: "string",
      width: 220,
      filter: true,
      sortable: false,
      truncate: true,
    },
    {
      key: "role",
      label: t("table.roles"),
      type: "catalog",
      width: 200,
      filter: "catalog",
      catalogOptions: { data: roles.map((role) => ({ id: role.key, name: roleLabel(role) })) },
      render: (u) => (
        <ITFlex gap={1} wrap="wrap">
          {u.roles.map((role) => (
            <ITBadget key={role} color="info" size="sm">
              {roleName(role)}
            </ITBadget>
          ))}
        </ITFlex>
      ),
    },
    {
      key: "active",
      label: t("table.status"),
      type: "boolean",
      width: 150,
      filter: true,
      sortable: false,
      render: (u) => (
        <ITFlex gap={1} wrap="wrap">
          <ITBadget color={u.active ? "success" : "danger"} size="sm">
            {u.active ? t("table.statusActive") : t("table.statusInactive")}
          </ITBadget>
          {u.locked && (
            <ITBadget color="warning" size="sm">
              {t("table.locked")}
            </ITBadget>
          )}
        </ITFlex>
      ),
    },
    {
      key: "lastLoginAt",
      label: t("table.lastLogin"),
      type: "string",
      width: 150,
      sortable: false,
      render: (u) => (
        <ITText className="text-[11px] text-slate-500">
          {formatDate(u.lastLoginAt, i18n.language) ?? t("table.never")}
        </ITText>
      ),
    },
    {
      key: "actions",
      label: t("common:labels.actions"),
      type: "actions",
      width: 200,
      actions: (u) => {
        const self = u.id === currentUserId;
        return (
          <ITFlex gap={1} align="center">
            {canEdit && actionButton("edit", u, <FaEdit size={12} />)}
            {canPermissions && !self && actionButton("permissions", u, <FaUserShield size={12} />)}
            {canEdit && !self && actionButton("resetPassword", u, <FaKey size={12} />)}
            {canEdit && u.locked && actionButton("unlock", u, <FaLockOpen size={12} />, "warning")}
            {canDelete && !self && u.active && actionButton("deactivate", u, <FaUserSlash size={12} />, "danger")}
            {canDelete && !u.active && actionButton("reactivate", u, <FaUndo size={12} />, "success")}
          </ITFlex>
        );
      },
    },
  ];

  return (
    <ITDataTable
      columns={columns as unknown as Column<Record<string, unknown>>[]}
      fetchData={
        fx.fetchTableData as unknown as (
          p: ITDataTableFetchParams
        ) => Promise<ITDataTableResponse<Record<string, unknown>>>
      }
      reloadTrigger={fx.reloadKey}
      defaultItemsPerPage={25}
      itemsPerPageOptions={[25, 50, 100]}
      layout="fixed"
      density="compact"
    />
  );
}
