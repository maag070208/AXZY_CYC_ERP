import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITConfirmDialog, ITFlex, ITLoader, ITPage, ITSelect, ITTabs, ITText } from "@axzydev/axzy_ui_system";
import { FaBolt, FaCashRegister, FaLayerGroup, FaPlus } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { termsApi, type Term } from "@entities/config";
import { chargeApi, paymentApi, type Charge, type Payment } from "@entities/finance";
import { ChargesTable, type ChargeAction } from "@features/finance/charges-list";
import { PaymentsTable, type PaymentAction } from "@features/finance/payments-list";
import { FeeConceptsPanel } from "@features/finance/fee-concepts";
import { ChargeFormDialog } from "@features/finance/charge-form";
import { GenerateChargesDialog } from "@features/finance/generate-charges";
import { RegisterPaymentDialog } from "@features/finance/register-payment";
import { useReceiptPrinter } from "@widgets/account-statement";
import { ReasonDialog } from "@shared/ui/reason-dialog";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/finance` (M09): cargos, pagos y conceptos de cobro. */
export default function FinancePage() {
  const { t } = useTranslation(["finance", "common"]);
  const crumbs = useBreadcrumbs();
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
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [periodName, setPeriodName] = useState("");
  // Cobranza trabaja en el ciclo en curso: arranca en el activo ("" = todos).
  const [activeTermId, setActiveTermId] = useState<string | null>(null);
  // Hasta saber cuál es el ciclo activo no se consultan las tablas: evita traer
  // todos los ciclos y corregir después.
  const [termReady, setTermReady] = useState(false);
  const reload = () => setReloadKey((k) => k + 1);

  // Periodos del ciclo elegido y el rango de vencimientos a filtrar.
  const periods = terms.find((term) => term.id === termId)?.periods ?? [];
  const period = periods.find((item) => item.name === periodName) ?? null;
  // La tabla tipa los rangos con `Date`; el filtro viaja como ISO y la API lo
  // recorta a día (`AAAA-MM-DD`).
  const dueRange: [Date, Date] | null = period
    ? [new Date(`${period.startDate}T00:00:00`), new Date(`${period.endDate}T00:00:00`)]
    : null;
  const currentPeriodName = (list: Term["periods"]): string => list.find((item) => item.current)?.name ?? "";

  // Al cambiar de ciclo, el periodo vuelve al que corre en ese ciclo.
  useEffect(() => {
    const list = terms.find((term) => term.id === termId)?.periods ?? [];
    setPeriodName(currentPeriodName(list));
  }, [termId, terms]);

  useEffect(() => {
    let stale = false;
    Promise.all([termsApi.options(), termsApi.active()])
      .then(([options, active]) => {
        if (stale) return;
        setTerms(options);
        setActiveTermId(active?.id ?? null);
        setTermId(active?.id ?? "");
      })
      .catch(() => undefined)
      .finally(() => !stale && setTermReady(true));
    return () => {
      stale = true;
    };
  }, []);

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
    <ITPage className="m-0! px-4! max-w-screen!" noPadding
      breadcrumbs={crumbs({ label: t("common:nav.finance") })}
      title={t("page.title")}
      description={t("page.description")}
      icon={<FaCashRegister size={20} />}
      actions={
        <ITFlex gap={2} align="end">
          <div className="w-[190px]">
            <ITSelect
              name="termId"
              size="sm"
              label={t("page.term")}
              value={termId}
              placeholder={t("page.allTerms")}
              options={terms.map((term) => ({ value: term.id, label: term.name }))}
              onChange={(e) => setTermId(e.target.value)}
            />
          </div>
          <div className="w-[190px]">
            <ITSelect
              name="period"
              size="sm"
              label={t("page.period")}
              value={periodName}
              disabled={periods.length === 0}
              placeholder={t("page.allPeriods")}
              options={periods.map((item) => ({ value: item.name, label: item.name }))}
              onChange={(e) => setPeriodName(e.target.value)}
            />
          </div>
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
      {activeTermId && termId !== activeTermId && (
        <div className="mb-3">
          <ITAlert variant={termId ? "warning" : "info"}>{termId ? t("page.notActiveTerm") : t("page.allTermsHint")}</ITAlert>
        </div>
      )}
      <ITTabs
        items={[
          // `key` por ciclo: al cambiar de ciclo la tabla se rehace y consulta con el filtro nuevo.
          { id: "charges", label: t("page.tabs.charges"), content: termReady ? <ChargesTable key={`charges-${termId}-${periodName}`} reloadKey={reloadKey} termId={termId} dueRange={dueRange} onAction={onChargeAction} /> : <ITLoader /> },
          { id: "payments", label: t("page.tabs.payments"), content: termReady ? <PaymentsTable key={`payments-${termId}-${periodName}`} reloadKey={reloadKey} termId={termId} dueRange={dueRange} onAction={onPaymentAction} /> : <ITLoader /> },
          { id: "concepts", label: t("page.tabs.concepts"), content: <FeeConceptsPanel /> },
        ]}
      />
      <ChargeFormDialog isOpen={creating} defaultTermId={termId} onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); notify.success(t("charges.created")); reload(); }} />
      <GenerateChargesDialog isOpen={generating} defaultTermId={termId} onClose={() => setGenerating(false)}
        onDone={(result) => { setGenerating(false); notify.success(t("charges.generated", result)); reload(); }} />
      <RegisterPaymentDialog
        charge={paying}
        onClose={() => setPaying(null)}
        onRegistered={(payment) => {
          setPaying(null);
          notify.success(t("payments.registered", { receiptNumber: payment.receiptNumber }));
          reload();
          void printReceipt(payment);
        }}
      />
      <ReasonDialog
        isOpen={!!cancellingCharge}
        title={t("charges.cancelTitle", { name: cancellingCharge?.studentName ?? "" })}
        label={t("charges.reason")}
        confirmLabel={t("charges.cancel")}
        cancelLabel={t("common:actions.cancel")}
        requiredMessage={t("reasonRequired")}
        onClose={() => setCancellingCharge(null)}
        onConfirm={(reason) => void (cancellingCharge && guard(() => chargeApi.cancel(cancellingCharge.id, reason), t("charges.cancelled"), () => setCancellingCharge(null)))}
      />
      <ReasonDialog
        isOpen={!!cancellingPayment}
        title={t("payments.cancelTitle", { receiptNumber: cancellingPayment?.receiptNumber ?? "" })}
        message={t("payments.cancelMessage")}
        label={t("charges.reason")}
        confirmLabel={t("payments.cancel")}
        cancelLabel={t("common:actions.cancel")}
        requiredMessage={t("reasonRequired")}
        onClose={() => setCancellingPayment(null)}
        onConfirm={(reason) => void (cancellingPayment && guard(() => paymentApi.cancel(cancellingPayment.id, reason), t("payments.cancelled"), () => setCancellingPayment(null)))}
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
