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

/** Anillo completo: dos semicírculos, para una sola categoría al 100 %. */
const ring = (cx: number, cy: number, outer: number, inner: number): string => {
  const top = { x: cx, y: cy - outer };
  const bottom = { x: cx, y: cy + outer };
  const topInner = { x: cx, y: cy - inner };
  const bottomInner = { x: cx, y: cy + inner };
  return [
    `M ${top.x} ${top.y}`,
    `A ${outer} ${outer} 0 1 1 ${bottom.x} ${bottom.y}`,
    `A ${outer} ${outer} 0 1 1 ${top.x} ${top.y}`,
    `L ${topInner.x} ${topInner.y}`,
    `A ${inner} ${inner} 0 1 0 ${bottomInner.x} ${bottomInner.y}`,
    `A ${inner} ${inner} 0 1 0 ${topInner.x} ${topInner.y}`,
    "Z",
  ].join(" ");
};

/**
 * Sector de dona entre dos ángulos (grados), como path SVG. Un arco completo
 * (360°) degenera en un path vacío, así que se dibuja como un anillo.
 */
const arc = (cx: number, cy: number, outer: number, inner: number, from: number, to: number): string => {
  const sweep = to - from;
  if (sweep >= 359.99) return ring(cx, cy, outer, inner);
  const start = polar(cx, cy, outer, to);
  const end = polar(cx, cy, outer, from);
  const startInner = polar(cx, cy, inner, to);
  const endInner = polar(cx, cy, inner, from);
  const large = sweep <= 180 ? "0" : "1";
  return [
    `M ${start.x} ${start.y}`,
    `A ${outer} ${outer} 0 ${large} 0 ${end.x} ${end.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${inner} ${inner} 0 ${large} 1 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
};

/**
 * Dona de participación con la leyenda debajo: cada renglón trae su color, la
 * etiqueta, el valor validado con su porcentaje y una barra fina de
 * participación, que es lo que hace legible comparar categorías. SVG puro, sin
 * librería, y con el total al centro como referencia.
 */
export default function DonutChart({ data, centerLabel, centerHint, ariaLabel, maxSegments = 6, othersLabel = "Otros" }: Props) {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const visible = data.slice(0, maxSegments);
  const rest = data.slice(maxSegments);
  const segments =
    rest.length > 0
      ? [...visible, { id: "__others", label: othersLabel, value: rest.reduce((sum, row) => sum + row.value, 0), display: "" }]
      : visible;
  let angle = 0;

  return (
    <div className="flex flex-col items-center gap-6" data-role="donut">
      <div className="relative shrink-0">
        <svg role="img" aria-label={ariaLabel} viewBox="0 0 200 200" className="h-40 w-40">
          {total <= 0 && <circle cx={100} cy={100} r={76} fill="none" stroke="#e2e8f0" strokeWidth={24} />}
          {total > 0 &&
            segments.map((segment, index) => {
              const sweep = (segment.value / total) * 360;
              const from = angle;
              angle += sweep;
              return (
                <path key={segment.id} d={arc(100, 100, 90, 64, from, angle)} fill={COLORS[index % COLORS.length]}>
                  <title>{`${segment.label}: ${segment.display || segment.value}`}</title>
                </path>
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-[30px] font-bold leading-none tabular-nums text-slate-900">{centerLabel}</p>
          {centerHint && <p className="mt-1.5 text-[11px] font-medium text-slate-500">{centerHint}</p>}
        </div>
      </div>

      <ul className="flex w-full flex-col gap-3">
        {segments.map((segment, index) => {
          const share = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          return (
            <li key={segment.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} aria-hidden />
                  <span className="truncate font-semibold text-slate-700">{segment.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  <span className="font-bold text-slate-700">{segment.display || segment.value}</span>
                  <span className="ml-2 font-semibold text-slate-500">{share}%</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${share}%`, background: COLORS[index % COLORS.length] }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
