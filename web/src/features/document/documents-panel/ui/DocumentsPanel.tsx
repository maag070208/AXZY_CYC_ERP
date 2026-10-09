import { useState } from "react";
import {
  ITAlert, ITBadget, ITButton, ITConfirmDialog, ITDialog, ITFlex, ITLoader, ITTable, ITText, ITTextarea,
} from "@axzydev/axzy_ui_system";
import type { Column } from "@axzydev/axzy_ui_system";
import { FaCheck, FaDownload, FaFileAlt, FaTimes, FaTrash, FaExclamationTriangle } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import type { StudentDocument } from "@entities/document";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { PanelCard } from "@shared/ui/panel-card";
import { KpiTile } from "@shared/ui/kpi-tile";
import { useDocuments } from "../model/useDocuments";
import UploadCard from "./UploadCard";

interface Props {
  studentId: string;
  /** Alumno en BAJA: solo lectura. */
  readOnly: boolean;
}

const STATUS_COLOR = { PENDIENTE: "warning", VALIDADO: "success", RECHAZADO: "danger" } as const;

const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Expediente documental del alumno (M06). */
export default function DocumentsPanel({ studentId, readOnly }: Props) {
  const { t, i18n } = useTranslation(["documents", "common"]);
  const notify = useNotify();
  const fx = useDocuments(studentId);
  const canUpload = useCan("documents.upload") && !readOnly;
  const canValidate = useCan("documents.validate") && !readOnly;
  const canDelete = useCan("documents.delete") && !readOnly;
  const [reviewing, setReviewing] = useState<{ doc: StudentDocument; status: "VALIDADO" | "RECHAZADO" } | null>(null);
  const [notas, setNotas] = useState("");
  const [deleting, setDeleting] = useState<StudentDocument | null>(null);

  const act = async (call: () => Promise<void>, message: string) => {
    try {
      await call();
      notify.success(message);
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const button = (label: string, doc: StudentDocument, icon: React.ReactNode, onClick: () => void, color = "secondary") => (
    <ITButton variant="text" color={color as "secondary"} size="sm" title={label} ariaLabel={`${label} ${doc.originalName}`} onClick={onClick}>
      {icon}
    </ITButton>
  );

  const columns: Column<StudentDocument>[] = [
    {
      key: "documentType", label: t("table.tipo"), type: "string", width: 200,
      render: (d) => (
        <ITFlex gap={1} align="center">
          <ITText className="text-[12px] font-bold text-slate-700">{d.documentType}</ITText>
          {d.obligatorio && <ITText className="text-danger-500">*</ITText>}
        </ITFlex>
      ),
    },
    {
      key: "originalName", label: t("table.archivo"), type: "string",
      render: (d) => (
        <ITFlex gap={1} align="center"><FaFileAlt size={11} className="text-slate-400" />
          <ITText className="text-[12px] text-slate-600">{d.originalName}</ITText>
        </ITFlex>
      ),
    },
    {
      key: "status", label: t("table.status"), type: "string", width: 130,
      render: (d) => (
        <ITFlex direction="column" gap={1}>
          <ITBadget color={STATUS_COLOR[d.status]} size="sm">{t(`status.${d.status}`)}</ITBadget>
          {d.notas && <ITText className="text-[10px] text-slate-500">{d.notas}</ITText>}
        </ITFlex>
      ),
    },
    { key: "size", label: t("table.size"), type: "string", width: 90, render: (d) => kb(d.size) },
    {
      key: "createdAt", label: t("table.fecha"), type: "string", width: 170,
      render: (d) => (
        <ITFlex direction="column">
          <ITText className="text-[11px] text-slate-600">{new Date(d.createdAt).toLocaleDateString(i18n.language)}</ITText>
          <ITText className="text-[10px] text-slate-400">{d.uploadedByName ?? ""}{d.validatedByName ? ` · ${d.validatedByName}` : ""}</ITText>
        </ITFlex>
      ),
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 150,
      actions: (d) => (
        <ITFlex gap={1}>
          {button(t("actions.download"), d, <FaDownload size={12} />, () => void act(() => fx.download(d), t("actions.download")))}
          {canValidate && d.status === "PENDIENTE" && button(t("actions.validate"), d, <FaCheck size={12} />, () => { setNotas(""); setReviewing({ doc: d, status: "VALIDADO" }); }, "success")}
          {canValidate && d.status === "PENDIENTE" && button(t("actions.reject"), d, <FaTimes size={12} />, () => { setNotas(""); setReviewing({ doc: d, status: "RECHAZADO" }); }, "danger")}
          {canDelete && button(t("actions.delete"), d, <FaTrash size={11} />, () => setDeleting(d), "danger")}
        </ITFlex>
      ),
    },
  ];

  if (fx.loading && !fx.data) return <ITLoader />;
  const data = fx.data;
  const reviewTitle = reviewing
    ? t(reviewing.status === "VALIDADO" ? "review.validateTitle" : "review.rejectTitle", { name: reviewing.doc.originalName })
    : "";

  return (
    <ITFlex direction="column" gap={4}>
      {fx.error && <ITAlert variant="error">{fx.error}</ITAlert>}
      {readOnly && <ITAlert variant="info">{t("readOnly")}</ITAlert>}
      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile label={t("kpi.documents")} value={data.documents.length} icon={<FaFileAlt size={16} />} tone="sky" />
          <KpiTile label={t("kpi.required")} value={data.requiredCount} icon={<FaCheck size={16} />} tone="emerald" />
          <KpiTile label={t("kpi.missing")} value={data.missing.length} icon={<FaExclamationTriangle size={16} />}
            tone={data.missing.length > 0 ? "amber" : "neutral"} />
        </div>
      )}
      {data && (data.missing.length > 0
        ? <ITAlert variant="warning">{t("missingList", { list: data.missing.map((m) => m.nombre).join(", ") })}</ITAlert>
        : <ITAlert variant="success">{t("complete")}</ITAlert>)}

      {canUpload && <UploadCard onUpload={fx.upload} onDone={() => notify.success(t("upload.done"))} />}

      <PanelCard title={t("title")}>
        {!data || data.documents.length === 0 ? (
          <ITText className="text-[12px] text-slate-500">{t("table.empty")}</ITText>
        ) : (
          <ITTable columns={columns as unknown as Column<Record<string, unknown>>[]}
            data={data.documents as unknown as Record<string, unknown>[]} defaultItemsPerPage={20} density="compact" />
        )}
      </PanelCard>

      <ITDialog isOpen={!!reviewing} onClose={() => setReviewing(null)} title={reviewTitle} className="w-full max-w-lg">
        <div role="dialog" aria-label={reviewTitle}>
          <ITFlex direction="column" gap={3}>
            {reviewing?.status === "RECHAZADO" && <ITText className="text-[12px] text-slate-600">{t("review.rejectHint")}</ITText>}
            <ITTextarea name="reviewNotas" label={t("review.notas")} value={notas} onChange={setNotas} rows={3} maxLength={1000} />
            <ITFlex justify="end" gap={2}>
              <ITButton variant="outlined" color="secondary" onClick={() => setReviewing(null)}>{t("common:actions.cancel")}</ITButton>
              <ITButton variant="filled" color={reviewing?.status === "VALIDADO" ? "success" : "danger"}
                onClick={() => {
                  if (!reviewing) return;
                  const { doc, status } = reviewing;
                  setReviewing(null);
                  void act(() => fx.review(doc, status, notas.trim() || undefined),
                    status === "VALIDADO" ? t("review.validated") : t("review.rejected"));
                }}>
                {reviewing?.status === "VALIDADO" ? t("actions.validate") : t("actions.reject")}
              </ITButton>
            </ITFlex>
          </ITFlex>
        </div>
      </ITDialog>
      <ITConfirmDialog isOpen={!!deleting} onClose={() => setDeleting(null)}
        onConfirm={() => {
          const doc = deleting;
          setDeleting(null);
          if (doc) void act(() => fx.remove(doc), t("delete.done"));
        }}
        title={t("delete.title", { name: deleting?.originalName ?? "" })} message={t("delete.message")}
        confirmLabel={t("actions.delete")} cancelLabel={t("common:actions.cancel")} variant="danger" />
    </ITFlex>
  );
}
