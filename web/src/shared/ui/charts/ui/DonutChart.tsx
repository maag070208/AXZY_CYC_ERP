export interface DonutDatum {
  id: string;
  label: string;
  value: number;
  display: string;
}

interface Props {
  data: DonutDatum[];
  /** Texto del centro (el total). */
  centerLabel: string;
  /** Renglón bajo el total en el centro. */
  centerHint?: string;
  ariaLabel: string;
  /** Máximo de segmentos; el resto se agrupa en «Otros». */
  maxSegments?: number;
  othersLabel?: string;
}

const COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b", "#f97316", "#64748b"];

const polar = (cx: number, cy: number, radius: number, degrees: number) => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
};

/** Sector de dona entre dos ángulos (grados), como path SVG. */
const arc = (cx: number, cy: number, outer: number, inner: number, from: number, to: number): string => {
  const start = polar(cx, cy, outer, to);
  const end = polar(cx, cy, outer, from);
  const startInner = polar(cx, cy, inner, to);
  const endInner = polar(cx, cy, inner, from);
  const large = to - from <= 180 ? "0" : "1";
  return [
    `M ${start.x} ${start.y}`,
    `A ${outer} ${outer} 0 ${large} 0 ${end.x} ${end.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${inner} ${inner} 0 ${large} 1 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
};

/**
 * Dona de participación con leyenda al lado (distribución de alumnos por
 * nivel). SVG puro: sin librería y con los valores en la leyenda, no encima
 * del gráfico.
 */
export default function DonutChart({ data, centerLabel, centerHint, ariaLabel, maxSegments = 6, othersLabel = "Otros" }: Props) {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const visible = data.slice(0, maxSegments);
  const rest = data.slice(maxSegments);
  const segments = rest.length > 0
    ? [...visible, { id: "__others", label: othersLabel, value: rest.reduce((sum, row) => sum + row.value, 0), display: "" }]
    : visible;
  let angle = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center" >
      <svg role="img" aria-label={ariaLabel} viewBox="0 0 180 180" className="h-44 w-44 shrink-0">
        {total <= 0 && <circle cx={90} cy={90} r={70} fill="none" stroke="#e2e8f0" strokeWidth={30} />}
        {total > 0 &&
          segments.map((segment, index) => {
            const sweep = (segment.value / total) * 360;
            const from = angle;
            angle += sweep;
            return (
              <path key={segment.id} d={arc(90, 90, 85, 55, from, angle)} fill={COLORS[index % COLORS.length]}>
                <title>{`${segment.label}: ${segment.display || segment.value}`}</title>
              </path>
            );
          })}
        <text x={90} y={88} textAnchor="middle" fontSize={22} fontWeight={700} fill="#0f172a">
          {centerLabel}
        </text>
        {centerHint && (
          <text x={90} y={104} textAnchor="middle" fontSize={10} fill="#64748b">
            {centerHint}
          </text>
        )}
      </svg>
      <ul className="flex w-full flex-col gap-2">
        {segments.map((segment, index) => (
          <li key={segment.id} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} aria-hidden />
              <span className="truncate font-semibold text-slate-700">{segment.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-500">
              {segment.display || segment.value}
              {total > 0 && <span className="ml-2 text-slate-400">{Math.round((segment.value / total) * 100)}%</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
