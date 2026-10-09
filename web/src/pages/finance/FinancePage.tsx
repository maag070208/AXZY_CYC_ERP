import { useState } from "react";
import { ITButton, ITConfirmDialog, ITFlex, ITPage, ITTabs, ITText } from "@axzydev/axzy_ui_system";
import { FaBolt, FaCashRegister, FaLayerGroup, FaPlus } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { chargeApi, paymentApi, type Charge, type Payment } from "@entities/finance";
import { ChargesTable, type ChargeAction } from "@features/finance/charges-list";
import { PaymentsTable, type PaymentAction } from "@features/finance/payments-list";
import { FeeConceptsPanel } from "@features/finance/fee-concepts";
import { ChargeFormDialog } from "@features/finance/charge-form";
import { GenerateChargesDialog } from "@features/finance/generate-charges";
import { RegisterPaymentDialog } from "@features/finance/register-payment";
import { useReceiptPrinter } from "@widgets/account-statement";
import { ReasonDialog } from "@shared/ui/reason-dialog";

/** `/finance` (M09): cargos, pagos y conceptos de cobro. */
export default function FinancePage() {
  const { t } = useTranslation(["finance", "common"]);
  const notify = useNotify();
  const canCreate = useCan("charges.create");
  const canGenerate = useCan("charges.generate");
  const printReceipt = useReceiptPrinter();
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lateFees, setLateFees] = useState(false);
  const [paying, setPaying] = useState<Charge | null>(null);
  const [cancellingCharge, setCancellingCharge] = useState<Charge | null>(null);
  const [cancellingPayment, setCancellingPayment] = useState<Payment | null>(null);
  const reload = () => setReloadKey((k) => k + 1);

  const onChargeAction = (action: ChargeAction, charge: Charge) => (action === "pay" ? setPaying(charge) : setCancellingCharge(charge));
  const onPaymentAction = (action: PaymentAction, payment: Payment) =>
    action === "receipt" ? void printReceipt(payment) : setCancellingPayment(payment);

  const guard = async (call: () => Promise<unknown>, message: string, close: () => void) => {
    try {
      await call();
      notify.success(message);
      close();
      reload();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const applyLateFees = async () => {
    try {
      const result = await chargeApi.lateFees();
      notify.success(t("charges.lateFeesDone", result));
      setLateFees(false);
      reload();
    } catch (err) {
      setLateFees(false);
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  return (
    <ITPage
      title={t("page.title")}
      description={t("page.description")}
      icon={<FaCashRegister size={20} />}
      actions={
        <ITFlex gap={2}>
          {canGenerate && (
            <ITButton variant="outlined" color="warning" onClick={() => setLateFees(true)}>
              <ITFlex align="center" gap={1}><FaBolt size={11} /><ITText className="font-bold text-[11px]">{t("charges.lateFees")}</ITText></ITFlex>
            </ITButton>
          )}
          {canGenerate && (
            <ITButton variant="outlined" color="primary" onClick={() => setGenerating(true)}>
              <ITFlex align="center" gap={1}><FaLayerGroup size={11} /><ITText className="font-bold text-[11px]">{t("charges.generate")}</ITText></ITFlex>
            </ITButton>
          )}
          {canCreate && (
            <ITButton variant="filled" color="primary" onClick={() => setCreating(true)}>
              <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="font-bold text-[11px]">{t("charges.new")}</ITText></ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      <ITTabs
        items={[
          { id: "charges", label: t("page.tabs.charges"), content: <ChargesTable reloadKey={reloadKey} onAction={onChargeAction} /> },
          { id: "payments", label: t("page.tabs.payments"), content: <PaymentsTable reloadKey={reloadKey} onAction={onPaymentAction} /> },
          { id: "concepts", label: t("page.tabs.concepts"), content: <FeeConceptsPanel /> },
        ]}
      />
      <ChargeFormDialog isOpen={creating} onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); notify.success(t("charges.created")); reload(); }} />
      <GenerateChargesDialog isOpen={generating} onClose={() => setGenerating(false)}
        onDone={(result) => { setGenerating(false); notify.success(t("charges.generated", result)); reload(); }} />
      <RegisterPaymentDialog
        charge={paying}
        onClose={() => setPaying(null)}
        onRegistered={(payment) => {
          setPaying(null);
          notify.success(t("payments.registered", { folio: payment.reciboFolio }));
          reload();
          void printReceipt(payment);
        }}
      />
      <ReasonDialog
        isOpen={!!cancellingCharge}
        title={t("charges.cancelTitle", { name: cancellingCharge?.studentNombre ?? "" })}
        label={t("charges.motivo")}
        confirmLabel={t("charges.cancel")}
        cancelLabel={t("common:actions.cancel")}
        requiredMessage={t("reasonRequired")}
        onClose={() => setCancellingCharge(null)}
        onConfirm={(motivo) => void (cancellingCharge && guard(() => chargeApi.cancel(cancellingCharge.id, motivo), t("charges.cancelled"), () => setCancellingCharge(null)))}
      />
      <ReasonDialog
        isOpen={!!cancellingPayment}
        title={t("payments.cancelTitle", { folio: cancellingPayment?.reciboFolio ?? "" })}
        message={t("payments.cancelMessage")}
        label={t("charges.motivo")}
        confirmLabel={t("payments.cancel")}
        cancelLabel={t("common:actions.cancel")}
        requiredMessage={t("reasonRequired")}
        onClose={() => setCancellingPayment(null)}
        onConfirm={(motivo) => void (cancellingPayment && guard(() => paymentApi.cancel(cancellingPayment.id, motivo), t("payments.cancelled"), () => setCancellingPayment(null)))}
      />
      <ITConfirmDialog
        isOpen={lateFees}
        onClose={() => setLateFees(false)}
        onConfirm={() => void applyLateFees()}
        title={t("charges.lateFeesTitle")}
        message={t("charges.lateFeesMessage")}
        confirmLabel={t("charges.lateFees")}
        cancelLabel={t("common:actions.cancel")}
        variant="warning"
      />
    </ITPage>
  );
}
