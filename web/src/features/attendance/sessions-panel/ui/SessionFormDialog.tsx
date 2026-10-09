import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDatePicker, ITDialog, ITFlex, ITGrid, ITInput, ITTimePicker } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { attendanceApi, type AttendanceSession } from "@entities/attendance";
import { fromDay, toDay } from "@shared/lib/day";
import { validateRequired } from "@shared/validation";

interface Props {
  isOpen: boolean;
  groupId: string;
  onClose: () => void;
  onSaved: (session: AttendanceSession) => void;
}

type Errors = Partial<Record<"date" | "topic", string>>;

const pickDay = (value: unknown): string => (value instanceof Date && !Number.isNaN(value.getTime()) ? toDay(value) : "");

/** Alta de una sesión de asistencia (M18 §4.1). No se permiten fechas futuras. */
export default function SessionFormDialog({ isOpen, groupId, onClose, onSaved }: Props) {
  const { t } = useTranslation(["attendance", "common"]);
  const [date, setFecha] = useState("");
  const [time, setHora] = useState("");
  const [topic, setTema] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFecha(toDay(new Date()));
    setHora("");
    setTema("");
    setErrors({});
    setError(null);
  }, [isOpen]);

  const save = async () => {
    const next: Errors = {
      date: validateRequired(date, t("form.fecha")) ?? undefined,
      topic: topic.trim().length > 200 ? t("common:validation.minLength", { label: t("form.tema"), min: 0 }) : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    setError(null);
    try {
      const session = await attendanceApi.createSession(groupId, {
        date,
        time: time || null,
        topic: topic.trim() || null,
      });
      onSaved(session);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = t("form.title");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-lg">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={7}>
              <ITDatePicker name="date" label={t("form.fecha")} required error={errors.date} maxDate={new Date()}
                value={date ? fromDay(date) : undefined}
                onChange={(e) => setFecha(pickDay(e.target.value))} />
            </ITGrid>
            <ITGrid item xs={12} md={5}>
              <ITTimePicker name="time" label={t("form.hora")} value={time} onChange={(e) => setHora(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITInput name="topic" label={t("form.tema")} value={topic} maxLength={200} onChange={(e) => setTema(e.target.value)} />
            </ITGrid>
          </ITGrid>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{t("common:actions.save")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
