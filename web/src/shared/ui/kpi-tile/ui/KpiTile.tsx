import type { ReactNode } from "react";
import { useITFlatAppearance } from "@axzydev/axzy_ui_system";

export type KpiTone = "neutral" | "emerald" | "sky" | "amber" | "orange" | "rose" | "violet";

const TONES: Record<KpiTone, { icon: string; dot: string; text: string }> = {
  neutral: { icon: "bg-slate-100 text-slate-500", dot: "bg-slate-300", text: "text-slate-500" },
  emerald: { icon: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500", text: "text-emerald-700" },
  sky: { icon: "bg-sky-50 text-sky-600", dot: "bg-sky-500", text: "text-slate-500" },
  amber: { icon: "bg-amber-50 text-amber-600", dot: "bg-amber-500", text: "text-amber-700" },
  orange: { icon: "bg-[#fff7ed] text-[#ea580c]", dot: "bg-[#f97316]", text: "text-[#c2410c]" },
  rose: { icon: "bg-rose-50 text-rose-600", dot: "bg-rose-500", text: "text-rose-600" },
  violet: { icon: "bg-violet-50 text-violet-600", dot: "bg-violet-500", text: "text-slate-500" },
};

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: KpiTone;
  hint?: string;
  footer?: ReactNode;
  onClick?: () => void;
  /** Muestra un skeleton con las mismas dimensiones (evita saltos de layout). */
  loading?: boolean;
}

const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden />
);

export default function KpiTile({ label, value, icon, tone = "neutral", hint, footer, onClick, loading }: KpiTileProps) {
  const style = TONES[tone];
  const flat = useITFlatAppearance();
  const Tag = onClick ? "button" : "div";

  const shape = flat ? "rounded-xl px-5 py-4" : "rounded-2xl p-4 shadow-sm";
  const interactive = onClick
    ? `cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-2 ${
        flat ? "hover:border-slate-300" : "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
      }`
    : "";

  const valueNode = loading ? (
    <Skeleton className="mt-2 h-7 w-24" />
  ) : (
    <p
      title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
      className={`mt-2 truncate leading-none tabular-nums text-slate-900 ${
        flat ? "!text-[28px] font-bold" : "!text-[26px] font-extrabold"
      }`}
    >
      {value}
    </p>
  );

  const bottom = loading ? (
    <Skeleton className="mt-3 h-3 w-32" />
  ) : footer ? (
    <div className="mt-3 w-full">{footer}</div>
  ) : hint ? (
    <p className={`mt-3 flex items-center gap-1.5 !text-[12px] ${flat ? style.text : "text-slate-500"}`}>
      {!flat && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />}
      <span className="truncate" title={hint}>{hint}</span>
    </p>
  ) : null;

  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      aria-busy={loading || undefined}
      className={`flex w-full flex-col border border-slate-200 !bg-white text-left transition ${shape} ${interactive}`}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate !text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          {valueNode}
        </div>
        {!flat && (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
            {icon}
          </span>
        )}
      </div>
      {bottom}
    </Tag>
  );
}