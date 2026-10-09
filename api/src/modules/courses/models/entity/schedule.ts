/**
 * Horario de un grupo (M07): bloques semanales `{ dia, horaInicio, horaFin }`
 * con horas `HH:mm` de 24 h. Intervalos semiabiertos `[inicio, fin)`: un
 * bloque que termina a las 09:00 no se empalma con otro que empieza a las 09:00.
 * Funciones **puras** (pruebas unitarias sin BD).
 */
export const WEEK_DAYS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export interface ScheduleSlot {
  dia: WeekDay;
  horaInicio: string;
  horaFin: string;
}

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `HH:mm` → minutos desde medianoche. */
export const minutesOf = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** ¿Se traslapan dos bloques? (mismo día y `[a, b)` ∩ `[c, d)` ≠ ∅). */
export const slotsOverlap = (a: ScheduleSlot, b: ScheduleSlot): boolean =>
  a.dia === b.dia &&
  minutesOf(a.horaInicio) < minutesOf(b.horaFin) &&
  minutesOf(b.horaInicio) < minutesOf(a.horaFin);

/** Primer par de bloques que se empalman entre dos horarios, o `null`. */
export const firstConflict = (
  a: readonly ScheduleSlot[],
  b: readonly ScheduleSlot[]
): { mine: ScheduleSlot; theirs: ScheduleSlot } | null => {
  for (const mine of a) {
    for (const theirs of b) {
      if (slotsOverlap(mine, theirs)) return { mine, theirs };
    }
  }
  return null;
};

/** ¿El horario se empalma consigo mismo? */
export const hasInternalOverlap = (slots: readonly ScheduleSlot[]): boolean =>
  slots.some((slot, i) => slots.slice(i + 1).some((other) => slotsOverlap(slot, other)));

/** Orden estable: por día de la semana y hora de inicio. */
export const sortSchedule = (slots: readonly ScheduleSlot[]): ScheduleSlot[] =>
  [...slots].sort(
    (a, b) => WEEK_DAYS.indexOf(a.dia) - WEEK_DAYS.indexOf(b.dia) || minutesOf(a.horaInicio) - minutesOf(b.horaInicio)
  );

/** Lee el `Json` guardado en BD; descarta lo que no tenga la forma esperada. */
export const parseSchedule = (value: unknown): ScheduleSlot[] =>
  Array.isArray(value)
    ? value.filter(
        (s): s is ScheduleSlot =>
          typeof s === "object" &&
          s !== null &&
          WEEK_DAYS.includes((s as ScheduleSlot).dia) &&
          TIME_PATTERN.test(String((s as ScheduleSlot).horaInicio)) &&
          TIME_PATTERN.test(String((s as ScheduleSlot).horaFin))
      )
    : [];
