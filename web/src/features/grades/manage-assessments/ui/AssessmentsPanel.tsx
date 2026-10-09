import { useCallback, useEffect, useState } from "react";
import { ITBadget, ITButton, ITConfirmDialog, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import { FaBan, FaEdit, FaPlus } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { assessmentApi, type Assessment } from "@entities/grade";
import { formatDay } from "@shared/lib/day";
import { PanelCard } from "@shared/ui/panel-card";
import AssessmentFormDialog from "./AssessmentFormDialog";

interface Props {
  groupId: string;
  /** Grupo cerrado o sin permiso: solo lectura. */
  readOnly: boolean;
  reloadKey: number;
  onChanged: () => void;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Instrumentos activos del grupo con la suma de ponderaciones. */
export default function AssessmentsPanel({ groupId, readOnly, reloadKey, onChanged }: Props) {
  const { t, i18n } = useTranslation(["grades", "common"]);
  const notify = useNotify();
  const [items, setItems] = useState<Assessment[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Assessment | null>(null);
  const [removing, setRemoving] = useState<Assessment | null>(null);

  const load = useCallback(() => {
    assessmentApi
      .table({ page: 1, limit: 100, filters: { groupId, active: true } })
      .then((res) => setItems(res.data))
      .catch(() => setItems([]));
  }, [groupId]);
  useEffect(load, [load, reloadKey]);

  const total = round2(items.reduce((sum, a) => sum + a.ponderacion, 0));
  const editingWeight = editing?.ponderacion ?? 0;

  const deactivate = async () => {
    if (!removing) return;
    try {
      await assessmentApi.deactivate(removing.id);
      notify.success(t("assessments.deactivated"));
      setRemoving(null);
      onChanged();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  return (
    <PanelCard
      title={t("assessments.title")}
      actions={
        <ITFlex gap={2} align="center">
          <ITBadget color={total === 100 ? "success" : "warning"} size="sm">
            {total === 100 ? t("assessments.weightsOk") : t("assessments.weights", { total })}
          </ITBadget>
          {!readOnly && (
            <ITButton variant="outlined" color="primary" size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <ITFlex align="center" gap={1}><FaPlus size={10} /><ITText className="text-[11px] font-bold">{t("assessments.new")}</ITText></ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      {items.length === 0 ? (
        <ITText className="text-[12px] text-slate-500">{t("assessments.empty")}</ITText>
      ) : (
        <ul className="divide-y divide-slate-100" data-role="assessments">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <ITText className="block text-[12px] font-bold text-slate-700">{a.nombre}</ITText>
                <ITText className="text-[11px] text-slate-500">
                  {t(`assessments.types.${a.tipo}`)} · {a.ponderacion}% · {t("assessments.maxScore")}: {a.maxScore}
                  {a.fecha ? ` · ${formatDay(a.fecha, i18n.language)}` : ""}
                </ITText>
              </div>
              {!readOnly && (
                <ITFlex gap={1}>
                  <ITButton variant="text" color="secondary" size="sm" ariaLabel={`${t("common:actions.edit")} ${a.nombre}`}
                    onClick={() => { setEditing(a); setFormOpen(true); }}>
                    <FaEdit size={12} />
                  </ITButton>
                  <ITButton variant="text" color="danger" size="sm" ariaLabel={`${t("assessments.deactivate")} ${a.nombre}`}
                    onClick={() => setRemoving(a)}>
                    <FaBan size={12} />
                  </ITButton>
                </ITFlex>
              )}
            </li>
          ))}
        </ul>
      )}
      <AssessmentFormDialog
        isOpen={formOpen}
        groupId={groupId}
        assessment={editing}
        available={round2(100 - total + editingWeight)}
        onClose={() => setFormOpen(false)}
        onSaved={(_, created) => {
          setFormOpen(false);
          notify.success(created ? t("assessments.created") : t("assessments.saved"));
          onChanged();
        }}
      />
      <ITConfirmDialog
        isOpen={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => void deactivate()}
        title={t("assessments.deactivateTitle", { name: removing?.nombre ?? "" })}
        message={t("assessments.deactivateMessage")}
        confirmLabel={t("assessments.deactivate")}
        cancelLabel={t("common:actions.cancel")}
        variant="danger"
      />
    </PanelCard>
  );
}
