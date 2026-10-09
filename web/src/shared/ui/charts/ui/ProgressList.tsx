export interface ProgressItem {
  id: string;
  label: string;
  hint?: string;
  /** 0–1 */
  ratio: number;
}

/** Barras horizontales de avance (ocupación de grupos, cobranza…). */
export default function ProgressList({ items }: { items: ProgressItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const pct = Math.round(Math.min(Math.max(item.ratio, 0), 1) * 100);
        const color = pct >= 100 ? "#f59e0b" : pct >= 75 ? "#10b981" : "#3b82f6";
        return (
          <li key={item.id}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-700">{item.label}</span>
              <span className="text-slate-500">{item.hint ?? `${pct}%`}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: "#f1f5f9" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
