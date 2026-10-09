import { useCallback } from "react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { settingsApi } from "@entities/config";
import type { Payment } from "@entities/finance";
import { formatDay } from "@shared/lib/day";
import { formatMoney } from "@shared/lib/money";
import { renderReceiptPdf } from "./renderFinancePdf";

/** Descarga el recibo de un pago en PDF (nombre de la escuela desde M11). */
export const useReceiptPrinter = () => {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const notify = useNotify();
  return useCallback(
    async (payment: Payment) => {
      try {
        const settings = await settingsApi.list().catch(() => []);
        const school = String(settings.find((s) => s.key === "SCHOOL_NAME")?.value ?? "CYC");
        const blob = await renderReceiptPdf(payment, school, {
          title: t("receipt.title"),
          folio: t("receipt.folio"),
          date: t("receipt.fecha"),
          student: t("receipt.alumno"),
          studentNumber: t("receipt.matricula"),
          concept: t("receipt.concepto"),
          method: t("receipt.metodo"),
          reference: t("receipt.referencia"),
          amount: t("receipt.monto"),
          balance: t("receipt.saldo"),
          cashier: t("receipt.cobro"),
          cancelled: t("receipt.cancelado"),
          methodValue: t(`payments.methods.${payment.method}`),
          money: (v) => formatMoney(v, i18n.language),
          formatDate: (d) => formatDay(d, i18n.language),
        });
        saveAs(blob, `recibo-${payment.receiptNumber}.pdf`);
      } catch (err) {
        notify.error(errorMessage(err, t("common:errors.load")));
      }
    },
    [t, i18n.language, notify]
  );
};
