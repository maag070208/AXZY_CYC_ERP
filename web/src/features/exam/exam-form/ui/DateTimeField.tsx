import { ITDatePicker, ITSelect } from "@axzydev/axzy_ui_system";
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

const pad = (n: number) => String(n).padStart(2, "0");
const TIMES = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

/** Fecha (calendario) + hora (cada 15 min) del kit, como un solo valor local. */
export default function DateTimeField({ name, label, timeLabel, value, onChange, disabled, required, error }: Props) {
  const [day = "", time = "08:00"] = value ? value.split("T") : [];
  const times = TIMES.includes(time) ? TIMES : [...TIMES, time].sort();
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
      <ITSelect
        name={`${name}-hora`}
        label={timeLabel}
        value={time}
        disabled={disabled || !day}
        options={times.map((x) => ({ value: x, label: x }))}
        onChange={(e) => onChange(`${day}T${e.target.value}`)}
      />
    </div>
  );
}
