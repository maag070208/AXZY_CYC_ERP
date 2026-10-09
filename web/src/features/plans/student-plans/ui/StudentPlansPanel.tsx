import { useCallback, useState } from "react";
import {
  ITAlert, ITBadget, ITButton, ITDataTable, ITDialog, ITFlex, ITLoader, ITTable, ITText,
} from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaEye, FaPlus } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { planApi, type Plan, type PlanCharge, type PlanDetail, type PlanStatus } from "@entities/plan";
import { formatDay } from "@shared/lib/day";
import { PanelCard } from "@shared/ui/panel-card";
import { ReasonDialog } from "@shared/ui/reason-dialog";
import AssignPlanDialog from "./AssignPlanDialog";

interface Props {
  studentId: string;
  studentName?: string;
  readOnly?: boolean;
}

const STATUS_COLOR: Record<PlanStatus, "success" | "secondary" | "danger"> = {
  ACTIVE: "success",
  COMPLETED: "secondary",
  CANCELLED: "danger",
};

const money = (value: number): string => `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

/** Planes de pago del alumno con generación y cancelación (M22). */
export default function StudentPlansPanel({ studentId, studentName, readOnly }: Props) {
  const { t, i18n } = useTranslation(["programs", "common"]);
  const notify = useNotify();
  const canManage = useCan("plans.manage") && !readOnly;
  const [reloadKey, setReloadKey] = useState(0);
  const [assignOpen, setAssignOpen] = useState(false);
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [cancelling, setCancelling] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const bump = () => setReloadKey((k) => k + 1);

  const open = async (row: Plan) => {
    setLoading(true);
    try {
      setDetail(await planApi.get(row.id));
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.load")));
    } finally {
      setLoading(false);
    }
  };

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await planApi.table({ page: params.page, limit: params.limit, filters: { ...params.filters, studentId } });
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, [studentId]);

  const columns: Column<Plan>[] = [
    {
      key: "program", label: t("plans.program"), type: "string",
      render: (r) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{r.program.name}</ITText>
          <ITText className="font-mono text-[10px] text-slate-400">{r.program.code}</ITText>
        </div>
      ),
    },
    {
      key: "startDate", label: t("plans.start"), type: "date", width: 150, sortable: true,
      render: (r) => <ITText className="text-[12px] text-slate-600">{formatDay(r.startDate, i18n.language)}</ITText>,
    },
    {
      key: "periods", label: t("plans.periods"), type: "number", width: 170,
      render: (r) => <ITText className="text-[12px] text-slate-600">{r.periodCount} × {r.monthsPerPeriod} {t("plans.months")}</ITText>,
    },
    {
      key: "totals", label: t("plans.totals"), type: "number", width: 190,
      render: (r) => (
        <div>
          <ITText className="block text-[12px] text-slate-700">{money(r.totals.amount)}</ITText>
          <ITText className="text-[10px] text-slate-400">{t("plans.charges", { count: r.totals.charges })}</ITText>
        </div>
      ),
    },
    {
      key: "status", label: t("common:labels.status"), type: "string", width: 120,
      render: (r) => <ITBadget color={STATUS_COLOR[r.status]} size="sm">{t(`status.${r.status}`)}</ITBadget>,
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 110,
      actions: (r) => (
        <ITFlex gap={1}>
          <ITButton variant="text" color="primary" size="sm" title={t("plans.view")} ariaLabel={`${t("plans.view")} ${r.program.name}`} onClick={() => void open(r)}>
            <FaEye size={12} />
          </ITButton>
          {canManage && r.status === "ACTIVE" && (
            <ITButton variant="text" color="danger" size="sm" ariaLabel={`${t("plans.cancel")} ${r.program.name}`} onClick={() => setCancelling(r)}>
              {t("plans.cancel")}
            </ITButton>
          )}
        </ITFlex>
      ),
    },
  ];

  const chargeColumns: Column<PlanCharge>[] = [
    { key: "descripcion", label: t("plans.detail.charge"), type: "string", render: (c) => <ITText className="text-[12px] text-slate-700">{c.descripcion ?? "—"}</ITText> },
    { key: "fechaVencimiento", label: t("plans.detail.due"), type: "string", width: 140, render: (c) => <ITText className="text-[12px] text-slate-600">{formatDay(c.fechaVencimiento, i18n.language)}</ITText> },
    { key: "monto", label: t("plans.detail.amount"), type: "string", width: 120, render: (c) => <ITText className="text-[12px] tabular-nums text-slate-700">{money(c.monto)}</ITText> },
    { key: "status", label: t("common:labels.status"), type: "string", width: 120, render: (c) => <ITBadget color="secondary" size="sm">{t(`chargeStatus.${c.status}`, { defaultValue: c.status })}</ITBadget> },
  ];

  const detailTitle = detail ? t("plans.detailTitle", { name: detail.program.name }) : "";
  return (
    <PanelCard
      title={t("plans.title")}
      description={t("plans.description")}
      actions={
        canManage && (
          <ITButton variant="filled" color="primary" onClick={() => setAssignOpen(true)}>
            <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="text-[11px] font-bold">{t("assign.titleShort")}</ITText></ITFlex>
          </ITButton>
        )
      }
    >
      <ITDataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        fetchData={fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
        reloadTrigger={reloadKey}
        defaultItemsPerPage={10}
        density="compact"
      />

      <AssignPlanDialog
        isOpen={assignOpen}
        studentId={studentId}
        studentName={studentName}
        onClose={() => setAssignOpen(false)}
        onSaved={() => { setAssignOpen(false); bump(); }}
      />

      <ITDialog isOpen={!!detail || loading} onClose={() => setDetail(null)} title={detailTitle} className="w-full max-w-3xl">
        <div role="dialog" aria-label={detailTitle}>
          {loading && <ITLoader />}
          {detail && (
            <ITFlex direction="column" gap={3}>
              <ITAlert variant="info">
                {t("plans.detailSummary", { periods: detail.periodCount, months: detail.monthsPerPeriod, charges: detail.totals.charges, amount: money(detail.totals.amount) })}
              </ITAlert>
              <ITTable
                columns={chargeColumns as unknown as Column<Record<string, unknown>>[]}
                data={detail.charges as unknown as Record<string, unknown>[]}
                defaultItemsPerPage={20}
                density="compact"
              />
            </ITFlex>
          )}
        </div>
      </ITDialog>

      <ReasonDialog
        isOpen={!!cancelling}
        title={t("plans.cancelTitle")}
        message={t("plans.cancelHint")}
        label={t("plans.cancelReason")}
        confirmLabel={t("plans.cancel")}
        cancelLabel={t("common:actions.cancel")}
        requiredMessage={t("common:validation.minLength", { label: t("plans.cancelReason"), min: 3 })}
        onClose={() => setCancelling(null)}
        onConfirm={async (reason) => {
          const plan = cancelling;
          if (!plan) return;
          try {
            await planApi.cancel(plan.id, reason);
            setCancelling(null);
            notify.success(t("plans.cancelled"));
            bump();
          } catch (err) {
            notify.error(errorMessage(err, t("common:errors.save")));
          }
        }}
      />
    </PanelCard>
  );
}
