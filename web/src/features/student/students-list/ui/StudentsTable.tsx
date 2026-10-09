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
      key: "matricula",
      label: t("table.matricula"),
      type: "string",
      width: 130,
      filter: true,
      sortable: true,
      render: (s) => <ITText className="font-mono text-[12px] font-black text-slate-700">{s.matricula}</ITText>,
    },
    {
      key: "nombre",
      label: t("table.nombre"),
      type: "string",
      filter: true,
      sortable: true,
      render: (s) => <ITText className="text-[12px] text-slate-800">{s.nombreCompleto}</ITText>,
    },
    {
      key: "curp",
      label: t("table.curp"),
      type: "string",
      width: 200,
      filter: true,
      sortable: true,
      render: (s) => <ITText className="font-mono text-[11px] text-slate-600">{s.curp}</ITText>,
    },
    {
      key: "status",
      label: t("table.status"),
      type: "catalog",
      width: 130,
      filter: "catalog",
      sortable: true,
      catalogOptions: {
        data: [
          { id: "ACTIVO", name: t("status.ACTIVO") },
          { id: "BAJA", name: t("status.BAJA") },
        ],
      },
      render: (s) => (
        <ITBadget color={s.status === "ACTIVO" ? "success" : "danger"} size="sm">
          {t(`status.${s.status}`)}
        </ITBadget>
      ),
    },
    {
      key: "fechaIngreso",
      label: t("table.fechaIngreso"),
      type: "date",
      width: 160,
      filter: "date-range",
      sortable: true,
      render: (s) => <ITText className="text-[11px] text-slate-600">{formatDay(s.fechaIngreso, i18n.language)}</ITText>,
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
          ariaLabel={`${t("table.view")} ${s.matricula}`}
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
    />
  );
}
