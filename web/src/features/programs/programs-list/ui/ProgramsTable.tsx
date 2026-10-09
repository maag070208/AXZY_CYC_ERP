import { useCallback } from "react";
import { ITBadget, ITButton, ITDataTable, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaChevronRight } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { programApi, type Program } from "@entities/program";

interface Props {
  reloadKey: number;
  onTotal?: (total: number) => void;
  onOpen: (program: Program) => void;
}

const money = (value: number): string => `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

/** Listado de carreras (M22). */
export default function ProgramsTable({ reloadKey, onTotal, onOpen }: Props) {
  const { t } = useTranslation(["programs", "common"]);

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await programApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    onTotal?.(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, [onTotal]);

  const columns: Column<Program>[] = [
    {
      key: "name", label: t("list.name"), type: "string", filter: true, sortable: true,
      render: (r) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{r.name}</ITText>
          <ITText className="font-mono text-[10px] text-slate-400">{r.code}</ITText>
        </div>
      ),
    },
    {
      key: "periodType", label: t("list.period"), type: "catalog", width: 200, filter: "catalog", sortable: true,
      catalogOptions: { data: (["BIMONTHLY", "TRIMESTER", "QUADRIMESTER", "SEMESTER"] as const).map((p) => ({ id: p, name: t(`periodTypes.${p}`) })) },
      render: (r) => <ITText className="text-[12px] text-slate-600">{t(`periodTypes.${r.periodType}`)} · {r.periodCount}</ITText>,
    },
    {
      key: "monthlyFee", label: t("list.fees"), type: "number", width: 190,
      render: (r) => (
        <div>
          <ITText className="block text-[12px] text-slate-700">{t("list.monthly")}: {money(r.monthlyFee)}</ITText>
          <ITText className="text-[10px] text-slate-400">{t("list.enrollment")}: {money(r.enrollmentFee)}</ITText>
        </div>
      ),
    },
    { key: "subjects", label: t("list.subjects"), type: "number", width: 100 },
    {
      key: "active", label: t("common:labels.status"), type: "string", width: 110,
      render: (r) => <ITBadget color={r.active ? "success" : "danger"} size="sm">{r.active ? t("common:labels.active") : t("common:labels.inactive")}</ITBadget>,
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 70,
      actions: (r) => (
        <ITButton variant="text" color="secondary" size="sm" ariaLabel={`${t("common:actions.view")} ${r.name}`} onClick={() => onOpen(r)}>
          <FaChevronRight size={12} />
        </ITButton>
      ),
    },
  ];

  return (
    <ITDataTable
      columns={columns as unknown as Column<Record<string, unknown>>[]}
      fetchData={fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
      reloadTrigger={reloadKey}
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
