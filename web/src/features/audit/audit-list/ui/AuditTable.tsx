import { useCallback, useState } from "react";
import { ITBadget, ITButton, ITDataTable, ITDialog, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaEye } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { auditApi, type AuditLog } from "@entities/audit";

const DENIED = new Set(["ACCESS_DENIED", "AUTH_LOGIN_FAILED", "AUTH_ACCOUNT_LOCKED"]);

/** Bitácora server-side (`POST /audit/query`) con detalle antes/después. */
export default function AuditTable({ reloadKey }: { reloadKey?: number }) {
  const { t, i18n } = useTranslation(["audit", "common"]);
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await auditApi.table({
      page: params.page,
      limit: params.limit,
      filters: params.filters,
      sort: params.sort,
    });
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, []);

  const columns: Column<AuditLog>[] = [
    {
      key: "createdAt",
      label: t("table.date"),
      type: "date",
      width: 170,
      filter: "date-range",
      sortable: false,
      render: (row) => (
        <ITText className="text-[11px] text-slate-600">
          {new Date(row.createdAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "medium" })}
        </ITText>
      ),
    },
    {
      key: "action",
      label: t("table.action"),
      type: "string",
      width: 230,
      filter: true,
      render: (row) => (
        <ITBadget color={DENIED.has(row.action) ? "danger" : "info"} size="sm">
          {row.action}
        </ITBadget>
      ),
    },
    { key: "entityType", label: t("table.entity"), type: "string", width: 150, filter: true },
    { key: "entityId", label: t("table.entityId"), type: "string", width: 200, filter: true, truncate: true },
    {
      key: "userName",
      label: t("table.user"),
      type: "string",
      width: 160,
      render: (row) => (
        <ITText className="text-[12px] text-slate-700">{row.userName ?? t("table.system")}</ITText>
      ),
    },
    {
      key: "actions",
      label: "",
      type: "actions",
      width: 60,
      actions: (row) => (
        <ITButton variant="text" color="secondary" size="sm" ariaLabel={t("detail.title")} onClick={() => setDetail(row)}>
          <FaEye size={12} />
        </ITButton>
      ),
    },
  ];

  return (
    <>
      <ITDataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        fetchData={
          fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>
        }
        reloadTrigger={reloadKey}
        defaultItemsPerPage={50}
        itemsPerPageOptions={[25, 50, 100]}
        layout="fixed"
        density="compact"
      />
      <ITDialog isOpen={!!detail} onClose={() => setDetail(null)} title={t("detail.title")} className="w-full max-w-3xl">
        {detail && (
          <ITFlex direction="column" gap={3}>
            <ITText className="text-[12px] text-slate-600">
              <b>{detail.action}</b> · {detail.entityType} {detail.entityId ?? ""} · {detail.userName ?? t("table.system")}
            </ITText>
            <JsonBlock title={t("detail.previous")} value={detail.previousState} empty={t("detail.empty")} />
            <JsonBlock title={t("detail.next")} value={detail.newState} empty={t("detail.empty")} />
            <JsonBlock title={t("detail.metadata")} value={detail.metadata} empty={t("detail.empty")} />
          </ITFlex>
        )}
      </ITDialog>
    </>
  );
}

function JsonBlock({ title, value, empty }: { title: string; value: unknown; empty: string }) {
  return (
    <div>
      <ITText className="text-[11px] font-black uppercase text-slate-500">{title}</ITText>
      <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700">
        {value === null || value === undefined ? empty : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
