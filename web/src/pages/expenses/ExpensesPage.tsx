import { useCallback, useEffect, useState } from "react";
import { ITButton, ITFlex, ITPage, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { FaCheckCircle, FaMoneyBillWave, FaPlus, FaReceipt, FaWallet } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { termsApi, type Term } from "@entities/config";
import { useCan } from "@entities/user";
import { expenseApi, type Expense, type ExpenseSummary } from "@entities/expenses";
import { ExpensesTable, type ExpenseAction } from "@features/expenses/expenses-list";
import { ExpenseFormDialog } from "@features/expenses/expense-form";
import { ReasonDialog } from "@shared/ui/reason-dialog";
import { KpiTile } from "@shared/ui/kpi-tile";
import { formatMoney } from "@shared/lib/money";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/expenses` (M23): gastos institucionales con totales del ciclo. */
export default function ExpensesPage() {
  const { t, i18n } = useTranslation(["expenses", "common"]);
  const crumbs = useBreadcrumbs();
  const notify = useNotify();
  const canManage = useCan("expenses.manage");
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [cancelling, setCancelling] = useState<Expense | null>(null);
  const money = (v: number) => formatMoney(v, i18n.language);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    termsApi.options().then(setTerms).catch(() => setTerms([]));
  }, []);

  const loadSummary = useCallback(() => {
    expenseApi.summary(termId || undefined)
      .then(setSummary)
      .catch((err) => notify.error(errorMessage(err, t("common:errors.load"))));
  }, [notify, t, termId]);

  useEffect(loadSummary, [loadSummary, reloadKey]);

  const onAction = (action: ExpenseAction, expense: Expense) =>
    action === "edit" ? setEditing(expense) : setCancelling(expense);

  const cancel = async (reason: string) => {
    if (!cancelling) return;
    try {
      await expenseApi.cancel(cancelling.id, reason);
      setCancelling(null);
      notify.success(t("messages.cancelled"));
      reload();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  return (
    <ITPage className="m-0! px-4! max-w-screen!" noPadding
      breadcrumbs={crumbs({ label: t("common:nav.expenses") })}
      title={t("page.title")}
      description={t("page.description")}
      icon={<FaReceipt size={20} />}
      actions={
        <ITFlex gap={2}>
          {canManage && (
            <ITButton variant="filled" color="primary" onClick={() => setCreating(true)}>
              <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="font-bold text-[11px]">{t("actions.new")}</ITText></ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      <div className="mb-4 max-w-xs">
        <ITSelect name="termId" label={t("table.term")} value={termId} placeholder={t("summary.allTerms")}
          options={terms.map((term) => ({ value: term.id, label: term.name }))}
          onChange={(e) => setTermId(e.target.value)} />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label={t("summary.total")} value={summary ? money(summary.total) : "—"}
          hint={summary ? t("summary.cycleHint") : undefined}
          icon={<FaWallet size={16} />} tone="sky" />
        <KpiTile label={t("summary.count")} value={summary?.count ?? "—"}
          icon={<FaReceipt size={16} />} tone="violet" />
        <KpiTile label={t("summary.paid")} value={summary ? money(summary.paid) : "—"}
          icon={<FaCheckCircle size={16} />} tone="emerald" />
        <KpiTile label={t("summary.pending")} value={summary ? money(summary.pending) : "—"}
          icon={<FaMoneyBillWave size={16} />} tone={summary && summary.pending > 0 ? "amber" : "neutral"} />
      </div>
      <ExpensesTable reloadKey={reloadKey} termId={termId || undefined} onAction={onAction} />
      <ExpenseFormDialog isOpen={creating || !!editing} expense={editing} onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => {
          const wasEditing = !!editing;
          setCreating(false);
          setEditing(null);
          notify.success(wasEditing ? t("messages.saved") : t("messages.created"));
          reload();
        }} />
      <ReasonDialog
        isOpen={!!cancelling}
        title={t("messages.cancelTitle", { concept: cancelling?.concept ?? "" })}
        message={t("messages.cancelMessage")}
        label={t("messages.reason")}
        confirmLabel={t("actions.cancel")}
        cancelLabel={t("common:actions.cancel")}
        requiredMessage={t("messages.reasonRequired")}
        onClose={() => setCancelling(null)}
        onConfirm={(reason) => void cancel(reason)}
      />
    </ITPage>
  );
}
