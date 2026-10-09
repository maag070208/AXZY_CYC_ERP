import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ITButton, ITFlex, ITGrid, ITPage, ITStatCard, ITText } from "@axzydev/axzy_ui_system";
import { FaEdit, FaStream, FaWallet } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { programApi, type ProgramDetail } from "@entities/program";
import { ProgramFormDialog } from "@features/programs/program-form";
import { StudyPlanEditor } from "@features/programs/study-plan-editor";
import { PanelCard } from "@shared/ui/panel-card";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <ITText className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</ITText>
      <ITText className="text-[13px] text-slate-700">{value || "—"}</ITText>
    </div>
  );
}

const money = (value: number): string => `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

/** `/programs/:id` (M22): costos y plan de estudios de la carrera. */
export default function ProgramDetailPage() {
  const { t } = useTranslation(["programs", "common"]);
  const crumbs = useBreadcrumbs();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotify();
  const canManage = useCan("programs.manage");
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    programApi
      .get(id)
      .then((p) => { setProgram(p); setError(null); })
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [id, t]);

  useEffect(load, [load, reloadKey]);
  const p = program;

  return (
    <ITPage
      breadcrumbs={crumbs({ label: t("common:nav.programs"), to: "/programs" }, { label: p?.name })}
      title={p ? p.name : t("list.title")}
      description={p ? p.code : undefined}
      icon={<FaStream size={20} />}
      loading={!p && !error}
      error={error}
      backAction={() => navigate("/programs")}
      actions={
        p && canManage && (
          <ITButton variant="outlined" color="primary" onClick={() => setEditOpen(true)}>
            <ITFlex align="center" gap={1}><FaEdit size={11} /><ITText className="text-[11px] font-bold">{t("common:actions.edit")}</ITText></ITFlex>
          </ITButton>
        )
      }
    >
      {p && (
        <ITFlex direction="column" gap={4}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ITStatCard label={t("detail.monthly")} value={money(p.monthlyFee)} icon={<FaWallet size={16} />} />
            <ITStatCard label={t("detail.enrollment")} value={money(p.enrollmentFee)} icon={<FaWallet size={16} />} />
            <ITStatCard label={t("detail.period")} value={`${t(`periodTypes.${p.periodType}`)} · ${p.periodCount}`} icon={<FaStream size={16} />} />
            <ITStatCard label={t("detail.monthsPerPeriod")} value={p.monthsPerPeriod} icon={<FaStream size={16} />} />
          </div>
          <PanelCard>
            <ITGrid container columns={12} spacing={4}>
              <ITGrid item xs={12} md={4}><Field label={t("detail.code")} value={<span className="font-mono">{p.code}</span>} /></ITGrid>
              <ITGrid item xs={12} md={4}><Field label={t("detail.plans")} value={p.plans} /></ITGrid>
              <ITGrid item xs={12} md={4}><Field label={t("detail.description")} value={p.description} /></ITGrid>
            </ITGrid>
          </PanelCard>
          <StudyPlanEditor program={p} readOnly={!canManage} onSaved={() => { notify.success(t("plan.saved")); setReloadKey((k) => k + 1); }} />
        </ITFlex>
      )}
      {p && (
        <ProgramFormDialog
          isOpen={editOpen}
          program={p}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); notify.success(t("list.saved")); setReloadKey((k) => k + 1); }}
        />
      )}
    </ITPage>
  );
}
