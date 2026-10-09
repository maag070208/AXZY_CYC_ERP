import { useEffect, useState } from "react";
import { ITButton, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { studentApi } from "../api/studentApi";
import type { Student } from "../model/types";

interface Props {
  label: string;
  hint: string;
  emptyText: string;
  actionLabel: string;
  onSelect: (student: Student) => void;
  /** Solo alumnos activos (por defecto). */
  activeOnly?: boolean;
}

/** Búsqueda de alumnos por nombre o matrícula (empieza con dígito = matrícula). */
export default function StudentSearch({ label, hint, emptyText, actionLabel, onSelect, activeOnly = true }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      const filters: Record<string, string> = /^\d/.test(term) ? { studentNumber: term } : { name: term };
      if (activeOnly) filters.status = "ACTIVE";
      studentApi
        .table({ page: 1, limit: 8, filters })
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, activeOnly]);

  return (
    <div>
      <ITInput name="studentSearch" label={label} value={query} onChange={(e) => setQuery(e.target.value)} />
      {query.trim().length < 2 ? (
        <ITText className="mt-1 block text-[11px] text-slate-400">{hint}</ITText>
      ) : results.length === 0 ? (
        <ITText className="mt-1 block text-[12px] text-slate-500">{emptyText}</ITText>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200" data-role="student-results">
          {results.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <ITText className="block text-[12px] font-bold text-slate-700">{s.fullName}</ITText>
                <ITText className="font-mono text-[11px] text-slate-400">{s.studentNumber}</ITText>
              </div>
              <ITButton variant="outlined" color="primary" size="sm" ariaLabel={`${actionLabel} ${s.fullName}`} onClick={() => onSelect(s)}>
                {actionLabel}
              </ITButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
