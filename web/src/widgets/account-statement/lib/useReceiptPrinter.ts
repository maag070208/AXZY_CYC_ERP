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
          fecha: t("receipt.fecha"),
          alumno: t("receipt.alumno"),
          matricula: t("receipt.matricula"),
          concepto: t("receipt.concepto"),
          metodo: t("receipt.metodo"),
          referencia: t("receipt.referencia"),
          monto: t("receipt.monto"),
          saldo: t("receipt.saldo"),
          cobro: t("receipt.cobro"),
          cancelado: t("receipt.cancelado"),
          metodoValue: t(`payments.methods.${payment.metodo}`),
          money: (v) => formatMoney(v, i18n.language),
          date: (d) => formatDay(d, i18n.language),
        });
        saveAs(blob, `recibo-${payment.reciboFolio}.pdf`);
      } catch (err) {
        notify.error(errorMessage(err, t("common:errors.load")));
      }
    },
    [t, i18n.language, notify]
  );
};
