import { useCallback, useState } from "react";
import { ITBadget, ITButton, ITDataTable, ITDialog, ITFlex, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { saveAs } from "file-saver";
import { FaCheck, FaFileAlt, FaTimes } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { usePermission } from "@entities/user";
import { justificationApi, type Justification, type JustificationStatus } from "@entities/attendance";
import { formatDay } from "@shared/lib/day";

interface Props {
  reloadKey: number;
  onTotal?: (total: number) => void;
  /** Se llama tras resolver un justificante para que el contenedor recargue. */
  onResolved?: () => void;
}

const STATUS_COLOR: Record<JustificationStatus, "warning" | "success" | "danger"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

/** Bandeja de justificantes con aprobación/rechazo y descarga (M18 §4.4–4.5). */
export default function JustificationsTable({ reloadKey, onTotal, onResolved }: Props) {
  const { t, i18n } = useTranslation(["attendance", "common"]);
  const notify = useNotify();
  const justifyScope = usePermission("attendance.justify");
  // Resolver exige alcance AREA/ALL; el alumno (OWN) solo ve cómo va su trámite.
  const canResolve = justifyScope === "AREA" || justifyScope === "ALL";
  const [resolving, setResolving] = useState<{ row: Justification; status: "APPROVED" | "REJECTED" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await justificationApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    onTotal?.(res.total);
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, [onTotal]);

  const download = async (row: Justification) => {
    try {
      saveAs(await justificationApi.file(row.id), row.fileName ?? "justification");
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.load")));
    }
  };

  const confirm = async () => {
    if (!resolving) return;
    setBusy(true);
    try {
      await justificationApi.resolve(resolving.row.id, { status: resolving.status, note: note.trim() || null });
      notify.success(resolving.status === "APPROVED" ? t("justifications.approved") : t("justifications.rejected"));
      setResolving(null);
      onResolved?.();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Justification>[] = [
    {
      key: "name", label: t("justifications.student"), type: "string", filter: true, sortable: false,
      render: (r) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{r.name}</ITText>
          <ITText className="text-[10px] text-slate-400">{r.studentNumber}</ITText>
        </div>
      ),
    },
    {
      key: "courseName", label: t("justifications.groupName"), type: "string",
      render: (r) => <ITText className="text-[12px] text-slate-600">{r.courseName} · {r.groupName}</ITText>,
    },
    {
      key: "date", label: t("justifications.date"), type: "date", width: 150, sortable: false,
      render: (r) => <ITText className="text-[12px] text-slate-600">{formatDay(r.date, i18n.language)}{r.time ? ` · ${r.time}` : ""}</ITText>,
    },
    {
      key: "reason", label: t("justifications.reason"), type: "string",
      render: (r) => <ITText className="text-[12px] text-slate-600">{r.reason}</ITText>,
    },
    {
      key: "status", label: t("justifications.state"), type: "catalog", width: 120, filter: "catalog", sortable: false,
      catalogOptions: { data: (["PENDING", "APPROVED", "REJECTED"] as const).map((s) => ({ id: s, name: t(`justificationStatus.${s}`) })) },
      render: (r) => (
        <ITFlex direction="column" gap={1}>
          <ITBadget color={STATUS_COLOR[r.status]} size="sm">{t(`justificationStatus.${r.status}`)}</ITBadget>
          {r.note && <ITText className="text-[10px] text-slate-500">{r.note}</ITText>}
        </ITFlex>
      ),
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 120,
      actions: (r) => (
        <ITFlex gap={1}>
          {r.hasFile && (
            <ITButton variant="text" color="secondary" size="sm" title={t("justifications.download")} ariaLabel={`${t("justifications.download")} ${r.fileName ?? ""}`} onClick={() => void download(r)}>
              <FaFileAlt size={12} />
            </ITButton>
          )}
          {canResolve && r.status === "PENDING" && (
            <>
              <ITButton variant="text" color="success" size="sm" title={t("justifications.approve")} ariaLabel={`${t("justifications.approve")} ${r.name}`} onClick={() => { setNote(""); setResolving({ row: r, status: "APPROVED" }); }}>
                <FaCheck size={12} />
              </ITButton>
              <ITButton variant="text" color="danger" size="sm" title={t("justifications.reject")} ariaLabel={`${t("justifications.reject")} ${r.name}`} onClick={() => { setNote(""); setResolving({ row: r, status: "REJECTED" }); }}>
                <FaTimes size={11} />
              </ITButton>
            </>
          )}
        </ITFlex>
      ),
    },
  ];

  const title = resolving
    ? t(resolving.status === "APPROVED" ? "justifications.approveTitle" : "justifications.rejectTitle", { name: resolving.row.name })
    : "";
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
        virtualized
        virtualizedMaxHeight={400}
        rowHeight={50}
      />
      <ITDialog isOpen={!!resolving} onClose={() => setResolving(null)} title={title} className="w-full max-w-lg">
        <div role="dialog" aria-label={title}>
          <ITFlex direction="column" gap={4}>
            <ITText className="text-[12px] text-slate-600">{resolving?.row.reason}</ITText>
            {resolving?.status === "REJECTED" && <ITText className="text-[12px] text-slate-500">{t("justifications.rejectHint")}</ITText>}
            <ITTextarea name="note" label={t("justifications.note")} value={note} onChange={setNote} rows={3} maxLength={500} />
            <ITFlex justify="end" gap={2}>
              <ITButton variant="outlined" color="secondary" onClick={() => setResolving(null)}>{t("common:actions.cancel")}</ITButton>
              <ITButton variant="filled" color={resolving?.status === "APPROVED" ? "success" : "danger"} disabled={busy} onClick={() => void confirm()}>
                {resolving?.status === "APPROVED" ? t("justifications.approve") : t("justifications.reject")}
              </ITButton>
            </ITFlex>
          </ITFlex>
        </div>
      </ITDialog>
    </>
  );
}
