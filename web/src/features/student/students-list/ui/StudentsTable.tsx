import { ITBadget, ITButton, ITDataTable, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaFolderOpen } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import type { Student } from "@entities/student";
import { formatDay } from "@shared/lib/day";
import type { UseStudentsTable } from "../model/useStudentsTable";

interface Props {
  fx: UseStudentsTable;
  onOpen: (student: Student) => void;
}

export default function StudentsTable({ fx, onOpen }: Props) {
  const { t, i18n } = useTranslation(["students", "common"]);

  const columns: Column<Student>[] = [
    {
      key: "studentNumber",
      label: t("table.studentNumber"),
      type: "string",
      width: 130,
      filter: true,
      sortable: false,
      render: (s) => <ITText className="font-mono text-[12px] font-black text-slate-700">{s.studentNumber}</ITText>,
    },
    {
      key: "name",
      label: t("table.name"),
      type: "string",
      filter: true,
      sortable: false,
      render: (s) => <ITText className="text-[12px] text-slate-800">{s.fullName}</ITText>,
    },
    {
      key: "curp",
      label: t("table.curp"),
      type: "string",
      width: 200,
      filter: true,
      sortable: false,
      render: (s) => <ITText className="font-mono text-[11px] text-slate-600">{s.curp}</ITText>,
    },
    {
      key: "status",
      label: t("table.status"),
      type: "catalog",
      width: 130,
      filter: "catalog",
      sortable: false,
      catalogOptions: {
        data: [
          { id: "ACTIVE", name: t("status.ACTIVE") },
          { id: "WITHDRAWN", name: t("status.WITHDRAWN") },
        ],
      },
      render: (s) => (
        <ITBadget color={s.status === "ACTIVE" ? "success" : "danger"} size="sm">
          {t(`status.${s.status}`)}
        </ITBadget>
      ),
    },
    {
      key: "enrollmentDate",
      label: t("table.enrollmentDate"),
      type: "date",
      width: 160,
      filter: "date-range",
      sortable: false,
      render: (s) => <ITText className="text-[11px] text-slate-600">{formatDay(s.enrollmentDate, i18n.language)}</ITText>,
    },
    {
      key: "actions",
      label: "",
      type: "actions",
      width: 70,
      actions: (s) => (
        <ITButton
          variant="text"
          color="secondary"
          size="sm"
          ariaLabel={`${t("table.view")} ${s.studentNumber}`}
          onClick={() => onOpen(s)}
        >
          <FaFolderOpen size={13} />
        </ITButton>
      ),
    },
  ];

  return (
    <ITDataTable
      columns={columns as unknown as Column<Record<string, unknown>>[]}
      fetchData={
        fx.fetchTableData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>
      }
      reloadTrigger={fx.reloadKey}
      onRowClick={(row) => onOpen(row as unknown as Student)}
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
