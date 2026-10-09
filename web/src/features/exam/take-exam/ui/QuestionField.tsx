import { ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import type { AnswerValue, AttemptQuestion } from "@entities/online-exam";

interface Props {
  question: AttemptQuestion;
  value: AnswerValue;
  disabled?: boolean;
  onChange: (value: AnswerValue) => void;
}

/** Captura de la respuesta según el tipo de reactivo (M16 §4.3). */
export default function QuestionField({ question, value, disabled, onChange }: Props) {
  const { t } = useTranslation("exams");
  const name = `q-${question.sortOrder}`;
  if (question.type === "OPEN") {
    return (
      <ITTextarea name={name} label={t("runner.openPlaceholder")} value={typeof value === "string" ? value : ""} rows={4} maxLength={5000}
        disabled={disabled} onChange={(text) => onChange(text)} />
    );
  }
  const multiple = question.type === "MULTIPLE_ANSWER";
  // Opción múltiple y V/F guardan el id de la opción; respuesta múltiple, un arreglo.
  const chosen = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <div role={multiple ? "group" : "radiogroup"} aria-label={t("runner.question", { n: question.sortOrder })} className="flex flex-col gap-2">
      {question.options.map((o) => {
        const checked = chosen.has(o.id);
        return (
          <label key={o.id}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${checked ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={o.id}
              checked={checked}
              disabled={disabled}
              className="h-4 w-4 accent-indigo-600"
              onChange={() => {
                if (!multiple) return onChange(o.id);
                const next = new Set(chosen);
                if (next.has(o.id)) next.delete(o.id);
                else next.add(o.id);
                onChange([...next]);
              }}
            />
            <ITText className="text-[13px] text-slate-700">{o.text}</ITText>
          </label>
        );
      })}
    </div>
  );
}
