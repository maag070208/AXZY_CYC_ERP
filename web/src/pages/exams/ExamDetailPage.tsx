import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ITButton, ITConfirmDialog, ITFlex, ITGrid, ITPage, ITTabs, ITText } from "@axzydev/axzy_ui_system";
import { FaClipboardCheck, FaEdit, FaLock, FaPaperPlane, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { onlineExamApi, type OnlineExamDetail } from "@entities/online-exam";
import { ExamStatusBadge } from "@features/exam/exams-list";
import { ExamFormDialog } from "@features/exam/exam-form";
import { ExamQuestionsBuilder } from "@features/exam/exam-builder";
import { ExamResultsPanel } from "@features/exam/exam-results";
import { formatInstant } from "@shared/lib/day";
import { PanelCard } from "@shared/ui/panel-card";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <ITText className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</ITText>
      <div className="text-[13px] text-slate-700">{value ?? "—"}</div>
    </div>
  );
}

type Pending = "publish" | "close" | "delete" | null;

/** `/exams/:id`: configuración, reactivos y resultados de un examen (M15–M17). */
export default function ExamDetailPage() {
  const { t, i18n } = useTranslation(["exams", "common"]);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotify();
  const canManage = useCan("exams.manage");
  const canPublish = useCan("exams.publish");
  const canResults = useCan("attempts.view");
  const canReview = useCan("attempts.review");
  const [exam, setExam] = useState<OnlineExamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => {
    if (!id) return;
    onlineExamApi.get(id).then((e) => { setExam(e); setError(null); }).catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [id, t]);
  useEffect(load, [load]);

  const run = async () => {
    if (!exam || !pending) return;
    const action = pending;
    setPending(null);
    try {
      if (action === "delete") {
        await onlineExamApi.remove(exam.id);
        notify.success(t("exams.deleted"));
        navigate("/exams");
        return;
      }
      setExam(action === "publish" ? await onlineExamApi.publish(exam.id) : await onlineExamApi.close(exam.id));
      notify.success(action === "publish" ? t("exams.published") : t("exams.closed"));
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const e = exam;
  const builderReadOnly = !e || !canManage || e.status === "CERRADO" || e.intentos > 0;
  const config = e && (
    <PanelCard>
      <ITGrid container columns={12} spacing={4}>
        <ITGrid item xs={12} md={4}><Field label={t("exams.grupo")} value={`${e.courseNombre} · ${e.groupNombre}`} /></ITGrid>
        <ITGrid item xs={12} md={4}><Field label={t("exams.apertura")} value={formatInstant(e.fechaApertura, i18n.language)} /></ITGrid>
        <ITGrid item xs={12} md={4}><Field label={t("exams.cierre")} value={formatInstant(e.fechaCierre, i18n.language)} /></ITGrid>
        <ITGrid item xs={6} md={3}><Field label={t("exams.duracion")} value={e.duracionMin} /></ITGrid>
        <ITGrid item xs={6} md={3}><Field label={t("exams.intentosMax")} value={e.intentosMax} /></ITGrid>
        <ITGrid item xs={6} md={3}><Field label={t("exams.aprobatorio")} value={`${e.puntajeAprobatorio} / ${e.totalPuntos}`} /></ITGrid>
        <ITGrid item xs={6} md={3}><Field label={t("exams.criterio")} value={t(`exams.criterios.${e.criterioIntentos}`)} /></ITGrid>
        <ITGrid item xs={12} md={6}><Field label={t("exams.evaluacion")} value={e.assessmentNombre ?? t("exams.sinEvaluacion")} /></ITGrid>
        <ITGrid item xs={12} md={6}>
          <Field
            label={t("exams.opciones")}
            value={[
              e.aleatorizarPreguntas && t("exams.aleatorizarPreguntas"),
              e.aleatorizarOpciones && t("exams.aleatorizarOpciones"),
              e.mostrarResultado && t("exams.mostrarResultado"),
            ].filter(Boolean).join(" · ") || "—"}
          />
        </ITGrid>
        {e.instrucciones && <ITGrid item xs={12}><Field label={t("exams.instrucciones")} value={<span className="whitespace-pre-line">{e.instrucciones}</span>} /></ITGrid>}
      </ITGrid>
    </PanelCard>
  );

  const confirm = {
    publish: { title: t("exams.publishTitle", { name: e?.titulo ?? "" }), message: t("exams.publishMessage"), label: t("exams.publish"), variant: "primary" as const },
    close: { title: t("exams.closeTitle", { name: e?.titulo ?? "" }), message: t("exams.closeMessage"), label: t("exams.close"), variant: "danger" as const },
    delete: { title: t("exams.delete"), message: e?.titulo ?? "", label: t("exams.delete"), variant: "danger" as const },
  };
  const current = pending ? confirm[pending] : null;

  return (
    <ITPage
      title={e ? e.titulo : t("exams.title")}
      description={e ? `${e.courseNombre} · ${e.groupNombre} · ${e.termNombre}` : undefined}
      icon={<FaClipboardCheck size={20} />}
      loading={!e && !error}
      error={error}
      backAction={() => navigate("/exams")}
      actions={
        e && (
          <ITFlex gap={2} align="center">
            <ExamStatusBadge status={e.status} />
            {canManage && e.status !== "CERRADO" && (
              <ITButton variant="outlined" color="primary" onClick={() => setEditOpen(true)}>
                <ITFlex align="center" gap={1}><FaEdit size={11} /><ITText className="text-[11px] font-bold">{t("common:actions.edit")}</ITText></ITFlex>
              </ITButton>
            )}
            {canManage && e.status === "BORRADOR" && (
              <ITButton variant="outlined" color="danger" onClick={() => setPending("delete")}>
                <ITFlex align="center" gap={1}><FaTrash size={11} /><ITText className="text-[11px] font-bold">{t("exams.delete")}</ITText></ITFlex>
              </ITButton>
            )}
            {canPublish && e.status === "BORRADOR" && (
              <ITButton variant="filled" color="primary" disabled={e.preguntas === 0} onClick={() => setPending("publish")}>
                <ITFlex align="center" gap={1}><FaPaperPlane size={11} /><ITText className="text-[11px] font-bold">{t("exams.publish")}</ITText></ITFlex>
              </ITButton>
            )}
            {canManage && e.status === "PUBLICADO" && (
              <ITButton variant="filled" color="danger" onClick={() => setPending("close")}>
                <ITFlex align="center" gap={1}><FaLock size={11} /><ITText className="text-[11px] font-bold">{t("exams.close")}</ITText></ITFlex>
              </ITButton>
            )}
          </ITFlex>
        )
      }
    >
      {e && (
        <ITTabs
          items={[
            { id: "config", label: t("exams.tabs.config"), content: config },
            {
              id: "questions",
              label: `${t("exams.tabs.questions")} (${e.preguntas})`,
              content: <ExamQuestionsBuilder exam={e} readOnly={builderReadOnly} onSaved={setExam} />,
            },
            ...(canResults && e.status !== "BORRADOR"
              ? [{ id: "results", label: t("exams.tabs.results"), content: <ExamResultsPanel examId={e.id} canReview={canReview} reloadKey={reloadKey} /> }]
              : []),
          ]}
        />
      )}
      {e && (
        <ExamFormDialog
          isOpen={editOpen}
          exam={e}
          onClose={() => setEditOpen(false)}
          onSaved={(saved) => {
            setEditOpen(false);
            setExam(saved);
            notify.success(t("exams.saved"));
          }}
        />
      )}
      <ITConfirmDialog
        isOpen={!!current}
        onClose={() => setPending(null)}
        onConfirm={() => void run()}
        title={current?.title ?? ""}
        message={current?.message ?? ""}
        confirmLabel={current?.label ?? ""}
        cancelLabel={t("common:actions.cancel")}
        variant={current?.variant ?? "primary"}
      />
    </ITPage>
  );
}
