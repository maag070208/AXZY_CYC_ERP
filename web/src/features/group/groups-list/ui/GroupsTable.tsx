import { ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaBan, FaEdit, FaEye, FaUndo } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import type { Group } from "@entities/group";
import type { UseGroupsTable } from "../model/useGroupsTable";
import GroupStatusBadge from "./GroupStatusBadge";
import ScheduleSummary from "./ScheduleSummary";

export type GroupAction = "view" | "edit" | "deactivate" | "reactivate";

interface Props {
  fx: UseGroupsTable;
  onAction: (action: GroupAction, group: Group) => void;
}

export default function GroupsTable({ fx, onAction }: Props) {
  const { t } = useTranslation(["courses", "common"]);
  const canManage = useCan("groups.manage");

  const button = (action: GroupAction, group: Group, icon: React.ReactNode, color = "secondary") => (
    <ITButton key={action} variant="text" color={color as "secondary"} size="sm" title={t(`common:actions.${action}`)}
      ariaLabel={`${t(`common:actions.${action}`)} ${group.courseNombre} ${group.name}`} onClick={() => onAction(action, group)}>
      {icon}
    </ITButton>
  );

  const columns: Column<Group>[] = [
    {
      key: "course", label: t("groups.curso"), type: "string", filter: true, sortable: false,
      render: (row) => (
        <button type="button" className="text-left" onClick={() => onAction("view", row)}>
          <ITText className="block text-[12px] font-bold text-slate-700">{row.courseNombre}</ITText>
          <ITText className="font-mono text-[10px] text-slate-400">{row.courseClave}</ITText>
        </button>
      ),
    },
    { key: "name", label: t("groups.nombre"), type: "string", width: 100, filter: true, sortable: false },
    {
      key: "termId", label: t("groups.ciclo"), type: "catalog", width: 150, filter: "catalog", sortable: false,
      catalogOptions: { data: fx.terms.map((term) => ({ id: term.id, name: term.name })) },
      render: (row) => <ITText className="text-[12px] text-slate-600">{row.termNombre}</ITText>,
    },
    {
      key: "teacherNombre", label: t("groups.profesor"), type: "string", width: 180,
      render: (row) => <ITText className="text-[12px] text-slate-600">{row.teacherNombre ?? t("groups.noTeacher")}</ITText>,
    },
    { key: "schedule", label: t("groups.horario"), type: "string", width: 220, render: (row) => <ScheduleSummary slots={row.schedule} /> },
    {
      key: "capacity", label: t("groups.inscritos"), type: "number", width: 110, sortable: false,
      render: (row) => <ITText className="text-[12px] font-bold text-slate-700">{row.inscritos} / {row.capacity}</ITText>,
    },
    { key: "status", label: t("groups.status"), type: "string", width: 110, render: (row) => <GroupStatusBadge group={row} /> },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 130,
      actions: (row) => (
        <ITFlex gap={1}>
          {button("view", row, <FaEye size={12} />, "primary")}
          {canManage && !row.closedAt && button("edit", row, <FaEdit size={12} />)}
          {canManage && row.active && !row.closedAt && button("deactivate", row, <FaBan size={12} />, "danger")}
          {canManage && !row.active && button("reactivate", row, <FaUndo size={12} />, "success")}
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
    />
  );
}
