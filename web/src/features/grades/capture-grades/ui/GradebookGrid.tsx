import { useCallback, useEffect, useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { ITAlert, ITBadget, ITButton, ITConfirmDialog, ITFlex, ITLoader, ITText } from "@axzydev/axzy_ui_system";
import { FaFileExcel, FaLock, FaSave } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { assessmentApi, gradeApi, type Gradebook } from "@entities/grade";
import { useCan } from "@entities/user";
import { PanelCard } from "@shared/ui/panel-card";

interface Props {
  groupId: string;
  reloadKey: number;
  /** Aviso al cerrar el grupo (la página recarga el encabezado). */
  onClosed: () => void;
}

type Draft = Record<string, string>;
const INVALID_CELL = { borderColor: "#ef4444", background: "#fef2f2", color: "#b91c1c" } as const;
const DIRTY_CELL = { borderColor: "#f59e0b", background: "#fffbeb" } as const;
const cellKey = (enrollmentId: string, assessmentId: string) => `${enrollmentId}:${assessmentId}`;

/**
 * Libro de calificaciones editable: alumnos × instrumentos, con la final
 * proyectada por la API. Captura en lote por instrumento, exportación y
 * cierre del grupo (solo con ponderaciones al 100 % y todo capturado).
 */
export default function GradebookGrid({ groupId, reloadKey, onClosed }: Props) {
  const { t, i18n } = useTranslation(["grades", "common"]);
  const notify = useNotify();
  const canCapture = useCan("grades.capture");
  const canClose = useCan("assessments.manage");
  const canExport = useCan("grades.export");
  const [book, setBook] = useState<Gradebook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const load = useCallback(() => {
    gradeApi
      .gradebook(groupId)
      .then((b) => {
        setBook(b);
        setDraft({});
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [groupId, t]);
  useEffect(load, [load, reloadKey]);

  const closed = !!book?.group.closedAt;
  const editable = canCapture && !closed;
  const maxOf = useMemo(() => new Map(book?.assessments.map((a) => [a.id, a.maxScore]) ?? []), [book]);

  const invalid = (key: string): boolean => {
    const raw = draft[key];
    if (raw === undefined || raw.trim() === "") return false;
    const value = Number(raw);
    const max = maxOf.get(key.split(":")[1]) ?? 0;
    return !Number.isFinite(value) || value < 0 || value > max || Math.abs(Math.round(value * 100) - value * 100) > 1e-9;
  };
  const dirtyKeys = Object.keys(draft);
  const hasInvalid = dirtyKeys.some(invalid);

  const save = async () => {
    if (!book || dirtyKeys.length === 0) return;
    setSaving(true);
    try {
      const byAssessment = new Map<string, Array<{ enrollmentId: string; score: number | null }>>();
      for (const key of dirtyKeys) {
        const [enrollmentId, assessmentId] = key.split(":");
        const raw = draft[key].trim();
        const list = byAssessment.get(assessmentId) ?? [];
        list.push({ enrollmentId, score: raw === "" ? null : Number(raw) });
        byAssessment.set(assessmentId, list);
      }
      for (const [assessmentId, grades] of byAssessment) await assessmentApi.capture(assessmentId, grades);
      notify.success(t("gradebook.saved", { count: dirtyKeys.length }));
      load();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const close = async () => {
    try {
      setBook(await gradeApi.close(groupId));
      setConfirmClose(false);
      notify.success(t("gradebook.closed"));
      onClosed();
    } catch (err) {
      setConfirmClose(false);
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const exportExcel = async () => {
    try {
      const blob = await gradeApi.export(groupId);
      saveAs(blob, `calificaciones-${book?.group.courseNombre ?? "grupo"}-${book?.group.nombre ?? ""}.xlsx`);
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.load")));
    }
  };

  if (error) return <ITAlert variant="error">{error}</ITAlert>;
  if (!book) return <ITLoader />;

  return (
    <PanelCard
      title={t("gradebook.title")}
      description={t("gradebook.threshold", { value: book.approvalThreshold })}
      actions={
        <>
          {canExport && (
            <ITButton variant="outlined" color="success" size="sm" onClick={() => void exportExcel()}>
              <ITFlex align="center" gap={1}><FaFileExcel size={11} /><ITText className="text-[11px] font-bold">{t("gradebook.export")}</ITText></ITFlex>
            </ITButton>
          )}
          {editable && book.assessments.length > 0 && (
            <ITButton variant="filled" color="primary" size="sm" disabled={saving || hasInvalid || dirtyKeys.length === 0}
              title={dirtyKeys.length === 0 ? t("gradebook.nothingToSave") : undefined} onClick={() => void save()}>
              <ITFlex align="center" gap={1}><FaSave size={11} /><ITText className="text-[11px] font-bold">{t("gradebook.save")}</ITText></ITFlex>
            </ITButton>
          )}
          {canClose && !closed && (
            <ITButton variant="outlined" color="danger" size="sm" disabled={!book.complete || dirtyKeys.length > 0}
              title={book.complete ? undefined : t("gradebook.incomplete")} onClick={() => setConfirmClose(true)}>
              <ITFlex align="center" gap={1}><FaLock size={11} /><ITText className="text-[11px] font-bold">{t("gradebook.close")}</ITText></ITFlex>
            </ITButton>
          )}
        </>
      }
    >
      {closed && (
        <div className="mb-3">
          <ITAlert variant="info">
            {t("gradebook.closedBanner", { date: new Date(book.group.closedAt as string).toLocaleDateString(i18n.language) })}
          </ITAlert>
        </div>
      )}
      {book.assessments.length === 0 ? (
        <ITText className="text-[12px] text-slate-500">{t("gradebook.noAssessments")}</ITText>
      ) : book.students.length === 0 ? (
        <ITText className="text-[12px] text-slate-500">{t("gradebook.empty")}</ITText>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]" data-role="gradebook">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-400">
                <th className="px-2 py-2">{t("gradebook.student")}</th>
                {book.assessments.map((a) => (
                  <th key={a.id} className="px-2 py-2 text-center">
                    <span className="block text-slate-600">{a.nombre}</span>
                    <span className="font-normal normal-case">{a.ponderacion}% · /{a.maxScore}</span>
                  </th>
                ))}
                <th className="px-2 py-2 text-center">{closed ? t("gradebook.final") : t("gradebook.projection")}</th>
                <th className="px-2 py-2 text-center">{t("gradebook.result")}</th>
              </tr>
            </thead>
            <tbody>
              {book.students.map((row) => (
                <tr key={row.enrollmentId} className="border-b border-slate-100" data-enrollment={row.enrollmentId}>
                  <td className="px-2 py-2">
                    <span className="block font-bold text-slate-700">{row.nombre}</span>
                    <span className="font-mono text-[10px] text-slate-400">{row.matricula}</span>
                  </td>
                  {book.assessments.map((a) => {
                    const key = cellKey(row.enrollmentId, a.id);
                    const saved = row.scores[a.id];
                    const value = draft[key] ?? (saved === null || saved === undefined ? "" : String(saved));
                    const canEditRow = editable && row.enrollmentStatus === "INSCRITO";
                    return (
                      <td key={a.id} className="px-2 py-1 text-center">
                        {canEditRow ? (
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min={0}
                            max={a.maxScore}
                            aria-label={`${row.nombre} · ${a.nombre}`}
                            title={invalid(key) ? t("gradebook.outOfRange", { max: a.maxScore }) : undefined}
                            aria-invalid={invalid(key) || undefined}
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center text-[12px] outline-none focus:border-blue-500"
                            // En línea: el estilo de foco del kit no debe ocultar el estado de la celda.
                            style={invalid(key) ? INVALID_CELL : key in draft ? DIRTY_CELL : undefined}
                            value={value}
                            onChange={(e) => {
                              const next = e.target.value;
                              setDraft((prev) => {
                                const copy = { ...prev };
                                const original = saved === null || saved === undefined ? "" : String(saved);
                                if (next === original) delete copy[key];
                                else copy[key] = next;
                                return copy;
                              });
                            }}
                          />
                        ) : (
                          <span className="text-slate-700">{saved ?? "—"}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center font-black text-slate-800" data-role="final">{row.final ?? "—"}</td>
                  <td className="px-2 py-2 text-center">
                    {row.result ? (
                      <ITBadget color={row.result === "ACREDITADO" ? "success" : "danger"} size="sm">
                        {t(`gradebook.results.${row.result}`)}
                      </ITBadget>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ITConfirmDialog
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => void close()}
        title={t("gradebook.closeTitle", { name: `${book.group.courseNombre} ${book.group.nombre}` })}
        message={t("gradebook.closeMessage")}
        confirmLabel={t("gradebook.close")}
        cancelLabel={t("common:actions.cancel")}
        variant="danger"
      />
    </PanelCard>
  );
}
