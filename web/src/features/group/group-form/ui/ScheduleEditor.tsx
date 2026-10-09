import { ITButton, ITFlex, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { FaPlus, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { WEEK_DAYS, type ScheduleSlot, type WeekDay } from "@entities/group";
import { TIME_OPTIONS } from "../model/schedule";

interface Props {
  value: ScheduleSlot[];
  onChange: (slots: ScheduleSlot[]) => void;
  error?: string | null;
}

/** Renglones `día · inicio · fin` del horario semanal del grupo. */
export default function ScheduleEditor({ value, onChange, error }: Props) {
  const { t } = useTranslation(["courses"]);
  const update = (index: number, patch: Partial<ScheduleSlot>) =>
    onChange(value.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  const times = TIME_OPTIONS.map((time) => ({ value: time, label: time }));

  return (
    <div data-role="schedule-editor">
      <ITFlex justify="between" align="center" className="mb-2">
        <ITText className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t("groups.schedule")}</ITText>
        <ITButton variant="text" color="primary" size="sm"
          onClick={() => onChange([...value, { day: "MONDAY", startTime: "08:00", endTime: "09:00" }])}>
          <ITFlex align="center" gap={1}><FaPlus size={10} /><ITText className="text-[11px] font-bold">{t("groups.addSlot")}</ITText></ITFlex>
        </ITButton>
      </ITFlex>
      <ITFlex direction="column" gap={2}>
        {value.map((slot, index) => (
          <div key={index} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end rounded-xl border border-slate-200 p-2" data-role="schedule-slot">
            <ITSelect name={`day-${index}`} label={t("groups.day")} value={slot.day} size="sm"
              options={WEEK_DAYS.map((d) => ({ value: d, label: t(`days.${d}`) }))}
              onChange={(e) => update(index, { day: e.target.value as WeekDay })} />
            <ITSelect name={`inicio-${index}`} label={t("groups.startTime")} value={slot.startTime} size="sm" options={times}
              onChange={(e) => update(index, { startTime: e.target.value })} />
            <ITFlex align="end" gap={2}>
              <div className="flex-1">
                <ITSelect name={`fin-${index}`} label={t("groups.endTime")} value={slot.endTime} size="sm" options={times}
                  onChange={(e) => update(index, { endTime: e.target.value })} />
              </div>
              <ITButton variant="text" color="danger" size="sm" title={t("groups.removeSlot")} ariaLabel={t("groups.removeSlot")}
                onClick={() => onChange(value.filter((_, i) => i !== index))}>
                <FaTrash size={11} />
              </ITButton>
            </ITFlex>
          </div>
        ))}
      </ITFlex>
      {error && <ITText className="mt-1 block text-[11px] text-red-600">{error}</ITText>}
    </div>
  );
}
