import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaBan, FaEdit, FaUndo } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import type { Course } from "@entities/course";
import type { UseCoursesTable } from "../model/useCoursesTable";

export type CourseAction = "edit" | "deactivate" | "reactivate";

interface Props {
  fx: UseCoursesTable;
  onAction: (action: CourseAction, course: Course) => void;
}

export default function CoursesTable({ fx, onAction }: Props) {
  const { t } = useTranslation(["courses", "common"]);
  const canManage = useCan("courses.manage");

  const button = (action: CourseAction, course: Course, icon: React.ReactNode, color = "secondary") => (
    <ITButton key={action} variant="text" color={color as "secondary"} size="sm" title={t(`common:actions.${action}`)}
      ariaLabel={`${action} ${course.code}`} onClick={() => onAction(action, course)}>
      {icon}
    </ITButton>
  );

  const columns: Column<Course>[] = [
    {
      key: "code", label: t("courses.code"), type: "string", width: 140, filter: true, sortable: false,
      render: (row) => <ITText className="font-mono text-[12px] font-bold text-slate-700">{row.code}</ITText>,
    },
    { key: "name", label: t("courses.name"), type: "string", filter: true, sortable: false },
    {
      key: "levelName", label: t("courses.level"), type: "string", width: 160,
      render: (row) => <ITText className="text-[12px] text-slate-600">{row.levelName ?? t("courses.noLevel")}</ITText>,
    },
    { key: "groupsCount", label: t("courses.groups"), type: "number", width: 120 },
    {
      key: "active", label: t("courses.status"), type: "boolean", width: 120, filter: true, sortable: false,
      render: (row) => (
        <ITBadget color={row.active ? "success" : "danger"} size="sm">
          {row.active ? t("common:labels.active") : t("common:labels.inactive")}
        </ITBadget>
      ),
    },
    ...(canManage
      ? [{
          key: "actions", label: t("common:labels.actions"), type: "actions" as const, width: 110,
          actions: (row: Course) => (
            <ITFlex gap={1}>
              {button("edit", row, <FaEdit size={12} />)}
              {row.active ? button("deactivate", row, <FaBan size={12} />, "danger") : button("reactivate", row, <FaUndo size={12} />, "success")}
            </ITFlex>
          ),
        }]
      : []),
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
