import { useEffect, useMemo, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { PAYMENT_METHODS, paymentApi, type Charge, type Payment, type PaymentMethod } from "@entities/finance";
import { errorMessage } from "@app/toast/useNotify";
import { cents, formatMoney, isValidAmount } from "@shared/lib/money";

interface Props {
  charge: Pick<Charge, "id" | "studentNombre" | "conceptNombre" | "description" | "saldo"> | null;
  onClose: () => void;
  onRegistered: (payment: Payment) => void;
}

/**
 * Cobro en ventanilla: monto (por defecto el saldo), método y referencia. La
 * `Idempotency-Key` de cada apertura evita cobrar dos veces con un doble clic.
 */
export default function RegisterPaymentDialog({ charge, onClose, onRegistered }: Props) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const [amountInput, setAmountInput] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useMemo(() => (charge ? `pay-${crypto.randomUUID()}` : ""), [charge]);

  useEffect(() => {
    if (!charge) return;
    setAmountInput(String(charge.saldo));
    setMethod("CASH");
    setReference("");
    setFieldError(undefined);
    setError(null);
  }, [charge]);

  const save = async () => {
    if (!charge) return;
    const amount = Number(amountInput);
    if (!isValidAmount(amount) || cents(amount) > charge.saldo) {
      setFieldError(t("payments.exceeds", { saldo: formatMoney(charge.saldo, i18n.language) }));
      return;
    }
    setFieldError(undefined);
    setSaving(true);
    setError(null);
    try {
      onRegistered(await paymentApi.register({ chargeId: charge.id, amount: amount, method, reference: reference.trim() || null }, idempotencyKey));
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = t("payments.registerTitle", { concept: charge?.description ?? charge?.conceptNombre ?? "" });
  return (
    <ITDialog isOpen={!!charge} onClose={onClose} title={title} className="w-full max-w-lg">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITFlex justify="between" className="rounded-xl border border-slate-200 px-3 py-2">
            <div>
              <ITText className="block text-[10px] font-black uppercase text-slate-400">{t("payments.alumno")}</ITText>
              <ITText className="text-[13px] font-bold text-slate-700">{charge?.studentNombre}</ITText>
            </div>
            <div className="text-right">
              <ITText className="block text-[10px] font-black uppercase text-slate-400">{t("payments.saldo")}</ITText>
              <ITText className="text-[16px] font-black text-slate-800" data-role="saldo">{formatMoney(charge?.saldo ?? 0, i18n.language)}</ITText>
            </div>
          </ITFlex>
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              <ITInput name="amount" type="number" label={t("payments.monto")} value={amountInput} required error={fieldError}
                onChange={(e) => setAmountInput(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="method" label={t("payments.metodo")} value={method}
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`payments.methods.${m}`) }))}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITInput name="reference" label={t("payments.referencia")} value={reference} onChange={(e) => setReference(e.target.value)} />
            </ITGrid>
          </ITGrid>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="success" disabled={saving}>{t("payments.register")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
