import { ITDatePicker, ITTimePicker } from "@axzydev/axzy_ui_system";
import { fromDay, toDay } from "@shared/lib/day";

interface Props {
  name: string;
  label: string;
  timeLabel: string;
  /** Valor local `AAAA-MM-DDTHH:mm` ("" sin valor). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

/** Fecha (calendario) + hora del kit, como un solo valor local. */
export default function DateTimeField({ name, label, timeLabel, value, onChange, disabled, required, error }: Props) {
  const [day = "", time = "08:00"] = value ? value.split("T") : [];
  return (
    <div className="grid grid-cols-[1fr_7rem] items-start gap-2">
      <ITDatePicker
        name={name}
        label={label}
        required={required}
        disabled={disabled}
        error={error}
        value={day ? fromDay(day) : undefined}
        onChange={(e) => {
          const next = e.target.value;
          if (next instanceof Date) onChange(`${toDay(next)}T${time}`);
        }}
      />
      <ITTimePicker
        name={`${name}-time`}
        label={timeLabel}
        value={time}
        required={required}
        disabled={disabled || !day}
        onChange={(e) => onChange(`${day}T${e.target.value}`)}
      />
    </div>
  );
}
