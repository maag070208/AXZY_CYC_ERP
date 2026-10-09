import { useTranslation } from "react-i18next";

export interface MonthlySeries {
  month: string;
  income: number;
  expenses: number;
}

interface Props {
  data: MonthlySeries[];
  ariaLabel: string;
  height?: number;
}

/** Mes `AAAA-MM` → «Oct» según el idioma de la interfaz. */
const monthLabel = (month: string, locale: string, short = false): string => {
  const [year, index] = month.split("-").map(Number);
  if (!year || !index) return month;
  return new Intl.DateTimeFormat(locale.startsWith("en") ? "en-US" : "es-MX", {
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
  }).format(new Date(Date.UTC(year, index - 1, 1)));
};

/** Número compacto para los ejes (`$254.8K`). */
const compact = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale.startsWith("en") ? "en-US" : "es-MX", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

/**
 * Ingresos contra gastos por mes: dos barras por periodo sobre un eje con
 * rejilla, más la leyenda. SVG puro (sin librería): el texto no se deforma.
 */
export default function IncomeExpenseChart({ data, ariaLabel, height = 220 }: Props) {
  const { t, i18n } = useTranslation(["reports"]);
  const locale = i18n.language;
  const width = 560;
  const padding = { top: 12, right: 12, bottom: 26, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(...data.flatMap((d) => [d.income, d.expenses]), 1);
  const gridValues = [0, 0.5, 1].map((fraction) => Math.round(max * fraction));
  const step = plotWidth / data.length;
  const barWidth = Math.min(18, (step - 8) / 2);

  const y = (value: number) => padding.top + plotHeight - (value / max) * plotHeight;

  return (
    <div className="flex flex-col gap-3">
      <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(value)}
              y2={y(value)}
              stroke="#e2e8f0"
              strokeWidth={1}
              strokeDasharray={value === 0 ? undefined : "3 4"}
            />
            <text x={padding.left - 8} y={y(value) + 4} textAnchor="end" fontSize={10} fill="#94a3b8">
              {compact(value, locale)}
            </text>
          </g>
        ))}
        {data.map((row, index) => {
          const center = padding.left + step * index + step / 2;
          const label = monthLabel(row.month, locale, true);
          return (
            <g key={row.month}>
              <rect
                x={center - barWidth - 2}
                y={y(row.income)}
                width={barWidth}
                height={Math.max(padding.top + plotHeight - y(row.income), 1)}
                rx={2}
                fill="#2563eb"
              >
                <title>{`${label} · ${t("home.income")}: ${compact(row.income, locale)}`}</title>
              </rect>
              <rect
                x={center + 2}
                y={y(row.expenses)}
                width={barWidth}
                height={Math.max(padding.top + plotHeight - y(row.expenses), 1)}
                rx={2}
                fill="#f97316"
              >
                <title>{`${label} · ${t("home.expenses")}: ${compact(row.expenses, locale)}`}</title>
              </rect>
              <text x={center} y={height - 8} textAnchor="middle" fontSize={10} fill="#64748b">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#2563eb]" aria-hidden />
          {t("home.income")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#f97316]" aria-hidden />
          {t("home.expenses")}
        </li>
      </ul>
    </div>
  );
}
