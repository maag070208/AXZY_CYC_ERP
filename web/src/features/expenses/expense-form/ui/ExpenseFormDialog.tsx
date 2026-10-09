import { useEffect, useState } from "react";
import {
  ITAlert,
  ITButton,
  ITDatePicker,
  ITDialog,
  ITFlex,
  ITGrid,
  ITInput,
  ITSelect,
  ITText,
  ITTextarea,
} from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { ApiError } from "@shared/api/client";
import { termsApi } from "@entities/config";
import { EXPENSE_TYPES, expenseApi, type Expense, type ExpenseType } from "@entities/expenses";
import { errorMessage } from "@app/toast/useNotify";
import { fromDay, toDay } from "@shared/lib/day";
import { isValidAmount } from "@shared/lib/money";

interface Props {
  isOpen: boolean;
  /** Gasto a editar; `null` para el alta. */
  expense?: Expense | null;
  onClose: () => void;
  onSaved: (expense: Expense) => void;
}

const pickDay = (value: unknown): string =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? toDay(value) : "";

const today = () => toDay(new Date());

const EMPTY = {
  id: null as string | null,
  termId: "",
  concept: "",
  type: "" as ExpenseType | "",
  vendor: "",
  amount: "",
  date: today(),
  dueDate: "",
  notes: "",
  status: "PENDING" as "PENDING" | "PAID",
};

/** Alta y edición de un gasto institucional (`/expenses`). */
export default function ExpenseFormDialog({ isOpen, expense, onClose, onSaved }: Props) {
  const { t } = useTranslation(["expenses", "common"]);
  const [form, setForm] = useState(EMPTY);
  const [termOptions, setTermOptions] = useState<{ value: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const patch = (values: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...values }));

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSaving(false);
    setForm(
      expense
        ? {
            id: expense.id,
            termId: expense.termId ?? "",
            concept: expense.concept,
            type: expense.type,
            vendor: expense.vendor ?? "",
            amount: String(expense.amount),
            date: expense.date,
            dueDate: expense.dueDate ?? "",
            notes: expense.notes ?? "",
            status: expense.status === "PAID" ? "PAID" : "PENDING",
          }
        : { ...EMPTY, date: today() }
    );
    termsApi
      .options()
      .then((list) => {
        setTermOptions(list.map((term) => ({ value: term.id, label: term.name })));
        if (!expense) patch({ termId: list.find((term) => term.active)?.id ?? "" });
      })
      .catch(() => setTermOptions([]));
  }, [isOpen, expense]);

  const save = async () => {
    const amount = Number(form.amount);
    if (!form.concept.trim() || !form.date || !form.type) {
      setError(t("form.required", { label: !form.concept.trim() ? t("table.concept") : !form.date ? t("table.date") : t("table.type") }));
      return;
    }
    if (!isValidAmount(amount)) {
      setError(t("form.invalidAmount"));
      return;
    }
    if (form.dueDate && form.dueDate < form.date) {
      setError(t("form.dueBeforeDate"));
      return;
    }
    setSaving(true);
    setError(null);
    const data = {
      concept: form.concept.trim(),
      type: form.type as ExpenseType,
      amount,
      date: form.date,
      dueDate: form.dueDate || null,
      vendor: form.vendor.trim() || null,
      notes: form.notes.trim() || null,
      termId: form.termId || null,
      status: form.status,
    };
    try {
      onSaved(form.id ? await expenseApi.update(form.id, data) : await expenseApi.create(data));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(
        code === "DUE_DATE_BEFORE_DATE"
          ? t("form.dueBeforeDate")
          : errorMessage(err, t("common:errors.save"))
      );
    } finally {
      setSaving(false);
    }
  };

  const title = form.id ? t("form.titleEdit") : t("form.titleNew");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-2xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={8}>
              <ITInput name="concept" label={t("table.concept")} required maxLength={200}
                value={form.concept} onChange={(e) => patch({ concept: e.target.value })} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="amount" type="number" label={t("table.amount")} required currencyFormat
                value={form.amount} onChange={(e) => patch({ amount: e.target.value })} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="type" label={t("table.type")} required value={form.type} placeholder="—"
                options={EXPENSE_TYPES.map((x) => ({ value: x.value, label: t(x.label) }))}
                onChange={(e) => patch({ type: e.target.value as ExpenseType })} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="status" label={t("table.status")} required value={form.status}
                options={[{ value: "PENDING", label: t("status.PENDING") }, { value: "PAID", label: t("status.PAID") }]}
                onChange={(e) => patch({ status: e.target.value === "PAID" ? "PAID" : "PENDING" })} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITDatePicker name="date" label={t("table.date")} required value={form.date ? fromDay(form.date) : undefined}
                onChange={(e) => patch({ date: pickDay(e.target.value) })} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITDatePicker name="dueDate" label={t("table.dueDate")} value={form.dueDate ? fromDay(form.dueDate) : undefined}
                minDate={form.date ? fromDay(form.date) : undefined}
                onChange={(e) => patch({ dueDate: pickDay(e.target.value) })} />
              <ITText className="text-[10px] text-slate-400">{t("form.dueDateHint")}</ITText>
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput name="vendor" label={t("table.vendor")} maxLength={200}
                value={form.vendor} onChange={(e) => patch({ vendor: e.target.value })} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="termId" label={t("table.term")} value={form.termId} placeholder="—"
                options={termOptions} onChange={(e) => patch({ termId: e.target.value })} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITTextarea name="notes" label={t("form.notes")} rows={3} maxLength={500}
                value={form.notes} onChange={(value) => patch({ notes: value })} />
            </ITGrid>
          </ITGrid>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>
              {saving ? t("common:actions.saving") : t("common:actions.save")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
