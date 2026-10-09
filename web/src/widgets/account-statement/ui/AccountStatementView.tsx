import { useCallback, useEffect, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITFlex, ITLoader, ITText } from "@axzydev/axzy_ui_system";
import { FaCashRegister, FaExclamationTriangle, FaFilePdf, FaMoneyBillWave, FaPlus, FaReceipt, FaWallet } from "react-icons/fa";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { CHARGE_STATUS_COLOR, chargeApi, paymentApi, type AccountStatement, type Charge, type Payment } from "@entities/finance";
import { RegisterPaymentDialog } from "@features/finance/register-payment";
import { ChargeFormDialog } from "@features/finance/charge-form";
import { renderStatementPdf } from "../lib/renderFinancePdf";
import { useReceiptPrinter } from "../lib/useReceiptPrinter";
import { formatDay } from "@shared/lib/day";
import { formatMoney } from "@shared/lib/money";
import { KpiTile } from "@shared/ui/kpi-tile";
import { PanelCard } from "@shared/ui/panel-card";

/** Estado de cuenta del alumno: KPIs, cargos con sus pagos, cobro, recibos y PDF. */
export default function AccountStatementView({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const notify = useNotify();
  const canPay = useCan("payments.register");
  const canCharge = useCan("charges.create");
  const printReceipt = useReceiptPrinter();
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<Charge | null>(null);
  const [charging, setCharging] = useState(false);
  const money = (v: number) => formatMoney(v, i18n.language);

  const load = useCallback(() => {
    chargeApi
      .statement(studentId)
      .then((s) => {
        setStatement(s);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [studentId, t]);
  useEffect(load, [load]);

  if (error) return <ITAlert variant="error">{error}</ITAlert>;
  if (!statement) return <ITLoader />;

  const exportPdf = async () => {
    try {
      const blob = await renderStatementPdf(statement, {
        title: t("statement.title"),
        matricula: t("receipt.matricula"),
        alumno: t("receipt.alumno"),
        concepto: t("charges.concepto"),
        vencimiento: t("charges.vencimiento"),
        total: t("charges.total"),
        pagado: t("charges.pagado"),
        saldo: t("charges.saldo"),
        cargos: t("statement.cargos"),
        descuentos: t("statement.descuentos"),
        vencido: t("statement.vencido"),
        empty: t("statement.empty"),
        generated: t("statement.generated", { date: new Date(statement.generadoEn).toLocaleString(i18n.language) }),
        money,
        date: (d) => formatDay(d, i18n.language),
      });
      saveAs(blob, `estado-de-cuenta-${statement.student.matricula}.pdf`);
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.load")));
    }
  };

  const receipt = async (paymentId: string) => {
    try {
      await printReceipt(await paymentApi.get(paymentId));
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.load")));
    }
  };

  const { totals } = statement;
  return (
    <ITFlex direction="column" gap={4}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile label={t("statement.saldo")} value={money(totals.saldo)} icon={<FaWallet size={16} />} tone="sky" />
        <KpiTile label={t("statement.pagado")} value={money(totals.pagado)} icon={<FaMoneyBillWave size={16} />} tone="emerald" />
        <KpiTile label={t("statement.vencido")} value={money(totals.vencido)} icon={<FaExclamationTriangle size={16} />} tone={totals.vencido > 0 ? "rose" : "neutral"} />
      </div>
      <PanelCard
        title={t("statement.title")}
        description={t("statement.generated", { date: new Date(statement.generadoEn).toLocaleString(i18n.language) })}
        actions={
          <>
            {canCharge && (
              <ITButton variant="outlined" color="primary" size="sm" onClick={() => setCharging(true)}>
                <ITFlex align="center" gap={1}><FaPlus size={10} /><ITText className="text-[11px] font-bold">{t("charges.new")}</ITText></ITFlex>
              </ITButton>
            )}
            <ITButton variant="outlined" color="danger" size="sm" onClick={() => void exportPdf()}>
              <ITFlex align="center" gap={1}><FaFilePdf size={11} /><ITText className="text-[11px] font-bold">{t("statement.pdf")}</ITText></ITFlex>
            </ITButton>
          </>
        }
      >
        {statement.charges.length === 0 ? (
          <ITText className="text-[12px] text-slate-500">{t("statement.empty")}</ITText>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]" data-role="statement">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-2">{t("charges.concepto")}</th>
                  <th className="px-2 py-2">{t("charges.vencimiento")}</th>
                  <th className="px-2 py-2 text-right">{t("charges.total")}</th>
                  <th className="px-2 py-2 text-right">{t("charges.pagado")}</th>
                  <th className="px-2 py-2 text-right">{t("charges.saldo")}</th>
                  <th className="px-2 py-2">{t("charges.status")}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {statement.charges.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 align-top" data-charge={c.id}>
                    <td className="px-2 py-2">
                      <span className="block font-bold text-slate-700">{c.descripcion ?? c.conceptNombre}</span>
                      {c.descuento > 0 && <span className="text-[10px] text-slate-400">{t("charges.descuento")}: {money(c.descuento)}</span>}
                      {c.payments.map((p) => (
                        <button key={p.id} type="button" onClick={() => void receipt(p.id)}
                          className="mt-1 flex items-center gap-1 text-[10px] text-blue-600 hover:underline" aria-label={`${t("payments.receiptPdf")} ${p.reciboFolio}`}>
                          <FaReceipt size={9} /> {p.reciboFolio} · {formatDay(p.fecha, i18n.language)} · {money(p.monto)}
                        </button>
                      ))}
                    </td>
                    <td className={`px-2 py-2 ${c.vencido ? "font-bold" : "text-slate-600"}`} style={c.vencido ? { color: "#dc2626" } : undefined}>{formatDay(c.fechaVencimiento, i18n.language)}</td>
                    <td className="px-2 py-2 text-right">{money(c.total)}</td>
                    <td className="px-2 py-2 text-right">{money(c.pagado)}</td>
                    <td className="px-2 py-2 text-right font-black text-slate-800">{money(c.saldo)}</td>
                    <td className="px-2 py-2">
                      <ITBadget color={CHARGE_STATUS_COLOR[c.status]} size="sm">{t(`charges.statuses.${c.status}`)}</ITBadget>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {canPay && c.saldo > 0 && (
                        <ITButton variant="filled" color="success" size="sm" ariaLabel={`${t("charges.pay")} ${c.descripcion ?? c.conceptNombre}`}
                          onClick={() => setPaying(c)}>
                          <ITFlex align="center" gap={1}><FaCashRegister size={10} /><ITText className="text-[11px] font-bold">{t("charges.pay")}</ITText></ITFlex>
                        </ITButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[12px] font-black text-slate-800">
                  <td className="px-2 py-2" colSpan={2}>{t("statement.saldo")}</td>
                  <td className="px-2 py-2 text-right">{money(totals.cargos - totals.descuentos)}</td>
                  <td className="px-2 py-2 text-right">{money(totals.pagado)}</td>
                  <td className="px-2 py-2 text-right" data-role="total-saldo">{money(totals.saldo)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </PanelCard>
      <RegisterPaymentDialog
        charge={paying}
        onClose={() => setPaying(null)}
        onRegistered={(payment: Payment) => {
          setPaying(null);
          notify.success(t("payments.registered", { folio: payment.reciboFolio }));
          load();
          void printReceipt(payment);
        }}
      />
      <ChargeFormDialog
        isOpen={charging}
        student={{ id: statement.student.id, nombreCompleto: statement.student.nombre, matricula: statement.student.matricula }}
        onClose={() => setCharging(false)}
        onSaved={() => {
          setCharging(false);
          notify.success(t("charges.created"));
          load();
        }}
      />
    </ITFlex>
  );
}
