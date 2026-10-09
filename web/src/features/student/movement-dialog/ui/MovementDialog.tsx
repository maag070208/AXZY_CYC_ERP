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
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(toDay(new Date()));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind) return;
    setReasonId("");
    setReason("");
    setDate(toDay(new Date()));
    setNotes("");
    setError(null);
    if (kind === "WITHDRAWAL") {
      catalogApi.options("cancellation-reasons").then(setReasons).catch(() => setReasons([]));
    }
  }, [kind]);

  const title =
    kind === "WITHDRAWAL"
      ? t("movements.withdrawalTitle", { name: student.fullName })
      : t("movements.reentryTitle", { name: student.fullName });

  const confirm = async () => {
    if (!kind) return;
    if (reason.trim().length < 3) return setError(t("movements.reasonRequired"));
    setSaving(true);
    setError(null);
    const data = {
      reason: reason.trim(),
      reasonId: reasonId || null,
      date,
      notes: notes.trim() || null,
    };
    try {
      onDone(kind === "WITHDRAWAL" ? await studentApi.withdraw(student.id, data) : await studentApi.reenter(student.id, data));
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
            {kind === "WITHDRAWAL" ? t("movements.withdrawalMessage") : t("movements.reentryMessage")}
          </ITText>
          {kind === "WITHDRAWAL" && reasons.length > 0 && (
            <ITSelect
              name="reasonId"
              label={t("movements.reason")}
              placeholder={t("movements.reasonNone")}
              value={reasonId}
              options={reasons.map((r) => ({ value: r.id, label: r.name }))}
              onChange={(e) => {
                setReasonId(e.target.value);
                const reason = reasons.find((r) => r.id === e.target.value);
                if (reason) setReason(reason.name);
              }}
            />
          )}
          <ITInput name="reason" label={t("movements.reasonField")} value={reason} required
            onChange={(e) => setReason(e.target.value)} />
          <ITDatePicker name="date" label={t("movements.date")} value={fromDay(date)} maxDate={new Date()}
            onChange={(e) => {
              const value = e.target.value;
              if (value instanceof Date && !Number.isNaN(value.getTime())) setDate(toDay(value));
            }} />
          <ITTextarea name="notes" label={t("movements.notes")} value={notes}
            onChange={setNotes} rows={3} maxLength={1000} />
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>
              {t("common:actions.cancel")}
            </ITButton>
            <ITButton variant="filled" color={kind === "WITHDRAWAL" ? "danger" : "success"} disabled={saving}
              onClick={() => void confirm()}>
              {kind === "WITHDRAWAL" ? t("movements.confirmWithdrawal") : t("movements.confirmReentry")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </div>
    </ITDialog>
  );
}
