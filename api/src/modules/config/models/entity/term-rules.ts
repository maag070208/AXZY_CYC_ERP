/**
 * Periodos del ciclo escolar (`Term.calendar`): el calendario configurable de
 * M22 —cuatrimestres, semestres, lo que use la escuela— como `[{ name, startDate,
 * endDate }]`. La cobranza se filtra por periodo y, por defecto, trabaja en el
 * que está corriendo hoy.
 */

export interface TermPeriod {
  name: string;
  startDate: string;
  endDate: string;
  /** ¿Es el periodo que contiene hoy? Solo uno puede serlo. */
  current: boolean;
}

const day = (value: unknown): string | null =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

/**
 * Periodos válidos del calendario, marcando el de hoy. **Pura.** Descarta lo que
 * no traiga nombre y fechas completas en vez de romper la pantalla por un JSON
 * viejo, y ordena por fecha de inicio.
 */
export const parsePeriods = (calendar: unknown, today: string): TermPeriod[] => {
  if (!Array.isArray(calendar)) return [];
  const periods: TermPeriod[] = [];
  for (const item of calendar) {
    if (!item || typeof item !== "object") continue;
    const { name, startDate, endDate } = item as Record<string, unknown>;
    const from = day(startDate);
    const to = day(endDate);
    if (typeof name !== "string" || !name.trim() || !from || !to) continue;
    periods.push({ name: name.trim(), startDate: from, endDate: to, current: today >= from && today <= to });
  }
  return periods.sort((a, b) => a.startDate.localeCompare(b.startDate));
};

/** El periodo de hoy, si el calendario lo tiene. **Pura.** */
export const currentPeriodOf = (periods: readonly TermPeriod[]): TermPeriod | null =>
  periods.find((period) => period.current) ?? null;
