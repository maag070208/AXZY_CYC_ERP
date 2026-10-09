import type { ScheduleSlot } from "@entities/group";

/** Horas seleccionables cada 15 min de 06:00 a 22:00. */
export const TIME_OPTIONS: string[] = Array.from({ length: (22 - 6) * 4 + 1 }, (_, i) => {
  const minutes = 6 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** Mismas reglas que la API: inicio < fin y sin empalmes `[inicio, fin)` el mismo día. */
export const scheduleError = (slots: ScheduleSlot[]): "slotRequired" | "slotRange" | "slotOverlap" | null => {
  if (slots.length === 0) return "slotRequired";
  if (slots.some((s) => toMinutes(s.startTime) >= toMinutes(s.endTime))) return "slotRange";
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (a.day === b.day && toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime)) {
        return "slotOverlap";
      }
    }
  }
  return null;
};
