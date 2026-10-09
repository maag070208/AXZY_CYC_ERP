export interface BarDatum {
  label: string;
  value: number;
  /** Texto del valor sobre la barra (p. ej. dinero formateado). */
  display?: string;
}

interface Props {
  data: BarDatum[];
  /** Tope del eje; por defecto el mayor valor. */
  max?: number;
  height?: number;
  color?: string;
  ariaLabel: string;
}

/**
 * Barras verticales con HTML/CSS (sin librería ni SVG estirado: el texto no
 * se deforma). Accesible: `role="img"` con etiqueta y `title` por barra.
 */
export default function BarChart({ data, max, height = 180, color = "#2563eb", ariaLabel }: Props) {
  const top = Math.max(max ?? 0, ...data.map((d) => d.value), 1);
  return (
    <div role="img" aria-label={ariaLabel} className="flex w-full items-end gap-2" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end" title={`${d.label}: ${d.display ?? d.value}`}>
          <span className="mb-1 text-[10px] font-bold tabular-nums" style={{ color: "#334155" }}>{d.display ?? d.value}</span>
          <div
            className="w-3/5 rounded-t-md"
            style={{ height: `${Math.max((d.value / top) * (height - 40), 2)}px`, background: color, opacity: 0.9 }}
          />
          <span className="mt-1 text-[10px]" style={{ color: "#64748b" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
