import type { ReactNode } from "react";

export type KpiTone = "neutral" | "emerald" | "sky" | "amber" | "orange" | "rose" | "violet";

const TONES: Record<KpiTone, { icon: string; dot: string }> = {
  neutral: { icon: "bg-slate-100 text-slate-500", dot: "bg-slate-300" },
  emerald: { icon: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500" },
  sky: { icon: "bg-sky-50 text-sky-600", dot: "bg-sky-500" },
  amber: { icon: "bg-amber-50 text-amber-600", dot: "bg-amber-500" },
  // El tema redefine la paleta "orange" de Tailwind: valores exactos.
  orange: { icon: "bg-[#fff7ed] text-[#ea580c]", dot: "bg-[#f97316]" },
  rose: { icon: "bg-rose-50 text-rose-600", dot: "bg-rose-500" },
  violet: { icon: "bg-violet-50 text-violet-600", dot: "bg-violet-500" },
};

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  /** Color del ícono y del punto de estado; la tarjeta siempre es blanca. */
  tone?: KpiTone;
  /** Línea de contexto bajo el número (con punto de color). */
  hint?: string;
  /** Contenido bajo el número (p. ej. una barra de progreso); reemplaza al `hint`. */
  footer?: ReactNode;
  onClick?: () => void;
}

/**
 * Indicador de tablero: tarjeta blanca, número grande y el color solo en el
 * ícono y el punto de estado (sin fondos de color completos).
 */
export default function KpiTile({ label, value, icon, tone = "neutral", hint, footer, onClick }: KpiTileProps) {
  const style = TONES[tone];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`flex w-full flex-col rounded-2xl border border-slate-200 !bg-white p-4 text-left shadow-sm transition ${
        onClick ? "cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md" : ""
      }`}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate !text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="mt-2 !text-[26px] font-black leading-none tabular-nums text-slate-900">{value}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
          {icon}
        </span>
      </div>
      {footer ? (
        <div className="mt-3 w-full">{footer}</div>
      ) : (
        hint && (
          <p className="mt-3 flex items-center gap-1.5 !text-[11px] text-slate-500">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
            <span className="truncate">{hint}</span>
          </p>
        )
      )}
    </Tag>
  );
}
