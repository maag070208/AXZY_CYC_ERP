import { useEffect, useState } from "react";
import {
  ITAlert,
  ITButton,
  ITDatePicker,
  ITDialog,
  ITFlex,
  ITInput,
  ITSelect,
  ITText,
  ITTextarea,
} from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { studentApi, type MovementResult, type MovementType, type Student } from "@entities/student";
import { catalogApi, type CatalogItem } from "@entities/config";
import { errorMessage } from "@app/toast/useNotify";
import { fromDay, toDay } from "@shared/lib/day";

interface Props {
  /** Movimiento a registrar; `null` = cerrado. */
  kind: MovementType | null;
  student: Student;
  onClose: () => void;
  onDone: (result: MovementResult) => void;
}

/** Baja o reingreso con motivo (catálogo M11 o texto libre), fecha y observaciones. */
export default function MovementDialog({ kind, student, onClose, onDone }: Props) {
  const { t } = useTranslation(["students", "common"]);
  const [reasons, setReasons] = useState<CatalogItem[]>([]);
  const [reasonId, setReasonId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(toDay(new Date()));
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind) return;
    setReasonId("");
    setMotivo("");
    setFecha(toDay(new Date()));
    setObservaciones("");
    setError(null);
    if (kind === "BAJA") {
      catalogApi.options("cancellation-reasons").then(setReasons).catch(() => setReasons([]));
    }
  }, [kind]);

  const title =
    kind === "BAJA"
      ? t("movements.bajaTitle", { name: student.nombreCompleto })
      : t("movements.reingresoTitle", { name: student.nombreCompleto });

  const confirm = async () => {
    if (!kind) return;
    if (motivo.trim().length < 3) return setError(t("movements.motivoRequired"));
    setSaving(true);
    setError(null);
    const data = {
      motivo: motivo.trim(),
      reasonId: reasonId || null,
      fecha,
      observaciones: observaciones.trim() || null,
    };
    try {
      onDone(kind === "BAJA" ? await studentApi.baja(student.id, data) : await studentApi.reingreso(student.id, data));
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ITDialog isOpen={!!kind} onClose={onClose} title={title} className="w-full max-w-lg">
      <div role="dialog" aria-label={title}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITText className="text-[12px] text-slate-600">
            {kind === "BAJA" ? t("movements.bajaMessage") : t("movements.reingresoMessage")}
          </ITText>
          {kind === "BAJA" && reasons.length > 0 && (
            <ITSelect
              name="reasonId"
              label={t("movements.reason")}
              placeholder={t("movements.reasonNone")}
              value={reasonId}
              options={reasons.map((r) => ({ value: r.id, label: r.name }))}
              onChange={(e) => {
                setReasonId(e.target.value);
                const reason = reasons.find((r) => r.id === e.target.value);
                if (reason) setMotivo(reason.name);
              }}
            />
          )}
          <ITInput name="motivo" label={t("movements.motivo")} value={motivo} required
            onChange={(e) => setMotivo(e.target.value)} />
          <ITDatePicker name="fecha" label={t("movements.fecha")} value={fromDay(fecha)} maxDate={new Date()}
            onChange={(e) => {
              const value = e.target.value;
              if (value instanceof Date && !Number.isNaN(value.getTime())) setFecha(toDay(value));
            }} />
          <ITTextarea name="observaciones" label={t("movements.observaciones")} value={observaciones}
            onChange={setObservaciones} rows={3} maxLength={1000} />
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>
              {t("common:actions.cancel")}
            </ITButton>
            <ITButton variant="filled" color={kind === "BAJA" ? "danger" : "success"} disabled={saving}
              onClick={() => void confirm()}>
              {kind === "BAJA" ? t("movements.confirmBaja") : t("movements.confirmReingreso")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </div>
    </ITDialog>
  );
}
