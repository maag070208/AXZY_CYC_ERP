import {
  ITBadget,
  ITDataTable,
  ITFlex,
  ITText,
} from "@axzydev/axzy_ui_system";
import type {
  Column,
  ITDataTableFetchParams,
  ITDataTableResponse,
} from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import type { User } from "@entities/user";
import { dyn } from "@shared/i18n";
import type { UseUsersTable } from "../model/useUsersTable";

interface Props {
  fx: UseUsersTable;
}

export default function UsersTable({ fx }: Props) {
  const { t: tt } = useTranslation(["users", "common"]);
  const tr = dyn(tt);

  const columns: Column<User>[] = [
    {
      key: "username",
      label: tt("table.username"),
      type: "string",
      width: 160,
      filter: true,
      sortable: true,
      render: (u) => (
        <ITText className="text-[12px] font-black text-slate-700">@{u.username}</ITText>
      ),
    },
    {
      key: "name",
      label: tt("table.name"),
      type: "string",
      width: 260,
      filter: true,
      sortable: true,
      render: (u) => <ITText className="text-[12px] text-slate-800">{u.name}</ITText>,
    },
    {
      key: "role",
      label: tt("table.role"),
      type: "string",
      width: 160,
      filter: true,
      sortable: false,
      render: (u) => (
        <ITBadget color="info" size="lg">
          {tr(`roles.${u.role}`, { defaultValue: u.role })}
        </ITBadget>
      ),
    },
    {
      key: "active",
      label: tt("table.status"),
      type: "boolean",
      width: 130,
      filter: true,
      sortable: false,
      render: (u) => (
        <ITBadget color={u.active ? "success" : "danger"} size="lg">
          {u.active ? tt("table.statusActive") : tt("table.statusInactive")}
        </ITBadget>
      ),
    },
  ];

  return (
    <ITFlex direction="column" className="w-full">
      <ITDataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        fetchData={
          fx.fetchTableData as unknown as (
            p: ITDataTableFetchParams
          ) => Promise<ITDataTableResponse<Record<string, unknown>>>
        }
        reloadTrigger={fx.reloadKey}
        defaultItemsPerPage={50}
        itemsPerPageOptions={[25, 50, 100]}
        layout="fixed"
        density="compact"
        virtualized
        virtualizedMaxHeight={480}
        rowHeight={50}
      />
    </ITFlex>
  );
}
