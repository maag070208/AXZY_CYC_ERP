import { useCallback, useEffect, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITDialog, ITFlex, ITLoader, ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { attendanceApi, type AttendanceRoll, type AttendanceMark } from "@entities/attendance";
import { formatDay } from "@shared/lib/day";

interface Props {
  sessionId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_COLOR: Record<AttendanceMark, "success" | "warning" | "danger"> = {
  PRESENTE: "success",
  RETARDO: "warning",
  FALTA: "danger",
};

/** Estatus de un renglón ya registrado; la justificada queda bloqueada. */
const markOf = (status: AttendanceRoll["rows"][number]["status"]): AttendanceMark =>
  status === "RETARDO" || status === "FALTA" ? status : "PRESENTE";

/**
 * Pase de lista de una sesión (M18 §4.2): todos los inscritos deben tener
 * estatus; los renglones con justificante vigente quedan bloqueados.
 */
export default function RollCallDialog({ sessionId, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation(["attendance", "common"]);
  const notify = useNotify();
  const [roll, setRoll] = useState<AttendanceRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!sessionId) return;
    setRoll(null);
    setError(null);
    attendanceApi
      .getRoll(sessionId)
      .then((r) => {
        setRoll(r);
        setMarks(Object.fromEntries(r.rows.map((row) => [row.enrollmentId, markOf(row.status)])));
      })
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [sessionId, t]);

  useEffect(load, [load]);

  const setAll = (status: AttendanceMark) => {
    if (!roll) return;
    setMarks((prev) => {
      const next = { ...prev };
      for (const row of roll.rows) if (!row.locked) next[row.enrollmentId] = status;
      return next;
    });
  };

  const save = async () => {
    if (!roll || !sessionId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await attendanceApi.saveRoll(
        sessionId,
        roll.rows.map((row) => ({ enrollmentId: row.enrollmentId, status: marks[row.enrollmentId] ?? markOf(row.status) }))
      );
      notify.success(t("roll.saved", { saved: result.saved, skipped: result.skipped }));
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = roll ? t("roll.title", { date: formatDay(roll.fecha, i18n.language) }) : t("roll.titleEmpty");
  return (
    <ITDialog isOpen={!!sessionId} onClose={onClose} title={title} className="w-full max-w-3xl">
      <div role="dialog" aria-label={title}>
        {!roll && !error && <ITLoader />}
        {error && <ITAlert variant="error">{error}</ITAlert>}
        {roll && (
          <ITFlex direction="column" gap={4}>
            <ITFlex justify="between" align="center" wrap="wrap" gap={2}>
              <ITText className="text-[12px] text-slate-500">{roll.group.courseNombre} · {roll.group.nombre} · {roll.group.termNombre}</ITText>
              <ITFlex gap={2}>
                <ITButton variant="outlined" color="success" size="sm" disabled={roll.group.closed} onClick={() => setAll("PRESENTE")}>
                  {t("roll.allPresent")}
                </ITButton>
                <ITButton variant="outlined" color="danger" size="sm" disabled={roll.group.closed} onClick={() => setAll("FALTA")}>
                  {t("roll.allAbsent")}
                </ITButton>
              </ITFlex>
            </ITFlex>
            {roll.group.closed && <ITAlert variant="warning">{t("roll.closed")}</ITAlert>}

            <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200">
              {roll.rows.length === 0 ? (
                <ITText className="block p-4 text-[12px] text-slate-500">{t("roll.empty")}</ITText>
              ) : (
                roll.rows.map((row) => {
                  const value = marks[row.enrollmentId] ?? "PRESENTE";
                  const locked = row.locked || roll.group.closed;
                  return (
                    <ITFlex key={row.enrollmentId} justify="between" align="center" gap={3}
                      className="border-b border-slate-100 px-3 py-2 last:border-b-0">
                      <div className="min-w-0">
                        <ITText className="block truncate text-[12px] font-bold text-slate-700">{row.nombre}</ITText>
                        <ITText className="text-[10px] text-slate-400">
                          {row.matricula}
                          {row.justification === "PENDIENTE" && ` · ${t("justificationStatus.PENDIENTE")}`}
                          {row.justification === "APROBADA" && ` · ${t("justificationStatus.APROBADA")}`}
                        </ITText>
                      </div>
                      <ITFlex gap={1}>
                        {(["PRESENTE", "RETARDO", "FALTA"] as const).map((status) => (
                          <ITButton
                            key={status}
                            size="sm"
                            variant={value === status ? "filled" : "outlined"}
                            color={STATUS_COLOR[status]}
                            disabled={locked}
                            ariaLabel={`${row.nombre} ${t(`status.${status}`)}`}
                            onClick={() => setMarks((prev) => ({ ...prev, [row.enrollmentId]: status }))}
                          >
                            {t(`status.${status}`)}
                          </ITButton>
                        ))}
                        {locked && row.justification && <ITBadget color={row.justification === "APROBADA" ? "success" : "warning"} size="sm">{t("roll.locked")}</ITBadget>}
                      </ITFlex>
                    </ITFlex>
                  );
                })
              )}
            </div>

            <ITFlex justify="end" gap={2}>
              <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
              <ITButton variant="filled" color="primary" disabled={saving || roll.group.closed || roll.rows.length === 0} onClick={() => void save()}>
                {t("roll.save")}
              </ITButton>
            </ITFlex>
          </ITFlex>
        )}
      </div>
    </ITDialog>
  );
}
