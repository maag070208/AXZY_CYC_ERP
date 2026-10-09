import { ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import type { ScheduleSlot } from "@entities/group";

/** `Lu 08:00–10:00 · Mi 08:00–09:00` */
export default function ScheduleSummary({ slots }: { slots: ScheduleSlot[] }) {
  const { t } = useTranslation(["courses"]);
  return (
    <ITText className="text-[11px] text-slate-600">
      {slots.map((s) => `${t(`daysShort.${s.day}`)} ${s.startTime}–${s.endTime}`).join(" · ") || "—"}
    </ITText>
  );
}
