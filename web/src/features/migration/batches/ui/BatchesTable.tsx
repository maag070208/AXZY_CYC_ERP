import { useCallback, useState } from "react";
import { ITBadget, ITButton, ITDataTable, ITDialog, ITFlex, ITLoader, ITTable, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaEye } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { migrationApi, type MigrationBatch, type MigrationBatchDetail, type MigrationRejection } from "@entities/migration";
import { formatInstant } from "@shared/lib/day";

interface Props {
  reloadKey: number;
  onTotal?: (total: number) => void;
}

const totalsText = (totals: Record<string, number>): string =>
  Object.entries(totals).map(([key, value]) => `${key}: ${value}`).join(" · ");

/** Historial de lotes de migración con detalle de filas rechazadas (M20). */
export default function BatchesTable({ reloadKey, onTotal }: Props) {
  const { t, i18n } = useTranslation(["migration", "common"]);
  const notify = useNotify();
  const [detail, setDetail] = useState<MigrationBatchDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const open = async (row: MigrationBatch) => {
    setLoading(true);
    try {
      setDetail(await migrationApi.getBatch(row.id));
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.load")));
    } finally {
      setLoading(false);
    }
  };

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await migrationApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    onTotal?.(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, [onTotal]);

  const columns: Column<MigrationBatch>[] = [
    {
      key: "file", label: t("batches.archivo"), type: "string", filter: true, sortable: false,
      render: (r) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{r.file}</ITText>
          <ITText className="text-[10px] text-slate-400">{t(`entities.${r.entity}`)}</ITText>
        </div>
      ),
    },
    {
      key: "mode", label: t("batches.mode"), type: "catalog", width: 120, filter: "catalog", sortable: false,
      catalogOptions: { data: [{ id: "DRY_RUN", name: t("wizard.dryRun") }, { id: "EXECUTE", name: t("wizard.executedBadge") }] },
      render: (r) => <ITBadget color={r.mode === "DRY_RUN" ? "warning" : "success"} size="sm">{r.mode === "DRY_RUN" ? t("wizard.dryRun") : t("wizard.executedBadge")}</ITBadget>,
    },
    {
      key: "status", label: t("batches.status"), type: "string", width: 110,
      render: (r) => <ITBadget color={r.status === "COMPLETED" ? "success" : "danger"} size="sm">{t(`status.${r.status}`)}</ITBadget>,
    },
    {
      key: "totals", label: t("batches.totals"), type: "string",
      render: (r) => <ITText className="text-[11px] text-slate-600">{totalsText(r.totals)}</ITText>,
    },
    {
      key: "createdAt", label: t("batches.fecha"), type: "date", width: 170, sortable: false,
      render: (r) => <ITText className="text-[11px] text-slate-500">{formatInstant(r.executedAt ?? r.createdAt, i18n.language)}</ITText>,
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 70,
      actions: (r) => (
        <ITButton variant="text" color="primary" size="sm" title={t("batches.view")} ariaLabel={`${t("batches.view")} ${r.file}`} onClick={() => void open(r)}>
          <FaEye size={12} />
        </ITButton>
      ),
    },
  ];

  const rows: Column<MigrationRejection>[] = [
    { key: "row", label: t("wizard.row"), type: "number", width: 80 },
    { key: "reason", label: t("wizard.reason"), type: "string", render: (r) => <ITBadget color="danger" size="sm">{t(`reasons.${r.reason}`, { defaultValue: r.reason })}</ITBadget> },
    { key: "value", label: t("wizard.value"), type: "string", render: (r) => <ITText className="font-mono text-[11px] text-slate-600">{r.value ?? "—"}</ITText> },
  ];

  const title = detail ? t("batches.detailTitle", { file: detail.file }) : "";
  return (
    <>
      <ITDataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        fetchData={fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
        reloadTrigger={reloadKey}
        defaultItemsPerPage={25}
        itemsPerPageOptions={[25, 50, 100]}
        layout="fixed"
        density="compact"
      />
      <ITDialog isOpen={!!detail || loading} onClose={() => setDetail(null)} title={title} className="w-full max-w-3xl">
        <div role="dialog" aria-label={title}>
          {loading && <ITLoader />}
          {detail && (
            <ITFlex direction="column" gap={3}>
              <ITFlex gap={3} wrap="wrap">
                <ITText className="text-[12px] text-slate-600">{t("batches.totals")}: <strong>{totalsText(detail.totals)}</strong></ITText>
              </ITFlex>
              {detail.rows.length === 0 ? (
                <ITText className="text-[12px] text-slate-500">{t("batches.noRows")}</ITText>
              ) : (
                <ITTable
                  columns={rows as unknown as Column<Record<string, unknown>>[]}
                  data={detail.rows as unknown as Record<string, unknown>[]}
                  defaultItemsPerPage={20}
                  density="compact"
                />
              )}
            </ITFlex>
          )}
        </div>
      </ITDialog>
    </>
  );
}
