import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaEdit, FaEnvelope, FaUndo, FaUserSlash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { usePermission } from "@entities/user";
import type { Teacher } from "@entities/teacher";
import type { UseTeachersTable } from "../model/useTeachersTable";

export type TeacherAction = "edit" | "resend" | "deactivate" | "reactivate";

interface Props {
  fx: UseTeachersTable;
  onAction: (action: TeacherAction, teacher: Teacher) => void;
}

export default function TeachersTable({ fx, onAction }: Props) {
  const { t } = useTranslation(["teachers", "common"]);
  const editScope = usePermission("teachers.edit");
  const canEdit = editScope !== "NONE";
  const canManage = editScope === "ALL";

  const button = (action: TeacherAction, teacher: Teacher, icon: React.ReactNode, color = "secondary") => (
    <ITButton key={action} variant="text" color={color as "secondary"} size="sm" title={t(`actions.${action}`)}
      ariaLabel={`${t(`actions.${action}`)} ${teacher.email}`} onClick={() => onAction(action, teacher)}>
      {icon}
    </ITButton>
  );

  const columns: Column<Teacher>[] = [
    {
      key: "name", label: t("table.name"), type: "string", filter: true, sortable: false,
      render: (row) => <ITText className="text-[12px] font-bold text-slate-700">{row.fullName}</ITText>,
    },
    { key: "email", label: t("table.email"), type: "string", width: 240, filter: true, sortable: false, truncate: true },
    { key: "specialty", label: t("table.specialty"), type: "string", width: 180, filter: true, sortable: false },
    {
      key: "account", label: t("table.account"), type: "string", width: 200,
      render: (row) =>
        row.account ? (
          <ITFlex direction="column" gap={1}>
            <ITText className="text-[11px] text-slate-600">@{row.account.username}</ITText>
            {row.account.pendingInvitation && <ITBadget color="warning" size="sm">{t("table.pending")}</ITBadget>}
          </ITFlex>
        ) : (
          <ITText className="text-[11px] text-slate-400">{t("table.noAccount")}</ITText>
        ),
    },
    {
      key: "status", label: t("table.status"), type: "catalog", width: 130, filter: "catalog", sortable: false,
      catalogOptions: { data: [{ id: "ACTIVE", name: t("status.ACTIVE") }, { id: "INACTIVE", name: t("status.INACTIVE") }] },
      render: (row) => (
        <ITBadget color={row.status === "ACTIVE" ? "success" : "danger"} size="sm">{t(`status.${row.status}`)}</ITBadget>
      ),
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 150,
      actions: (row) => (
        <ITFlex gap={1}>
          {canEdit && button("edit", row, <FaEdit size={12} />)}
          {canEdit && row.status === "ACTIVE" && row.account?.pendingInvitation && button("resend", row, <FaEnvelope size={12} />, "primary")}
          {canManage && row.status === "ACTIVE" && button("deactivate", row, <FaUserSlash size={12} />, "danger")}
          {canManage && row.status === "INACTIVE" && button("reactivate", row, <FaUndo size={12} />, "success")}
        </ITFlex>
      ),
    },
  ];

  return (
    <ITDataTable
      columns={columns as unknown as Column<Record<string, unknown>>[]}
      fetchData={fx.fetchTableData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
      reloadTrigger={fx.reloadKey}
      defaultItemsPerPage={25}
      itemsPerPageOptions={[25, 50, 100]}
      layout="fixed"
      density="compact"
      virtualized
      virtualizedMaxHeight={400}
      rowHeight={50}
    />
  );
}
