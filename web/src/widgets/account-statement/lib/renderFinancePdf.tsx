import type { AccountStatement, Payment } from "@entities/finance";
import type { ReceiptLabels } from "../ui/ReceiptDocument";
import type { StatementLabels } from "../ui/StatementDocument";

/** `@react-pdf/renderer` pesa: se carga solo al imprimir. */
export const renderReceiptPdf = async (payment: Payment, school: string, labels: ReceiptLabels): Promise<Blob> => {
  const [{ pdf }, { default: ReceiptDocument }] = await Promise.all([import("@react-pdf/renderer"), import("../ui/ReceiptDocument")]);
  return pdf(<ReceiptDocument payment={payment} school={school} labels={labels} />).toBlob();
};

export const renderStatementPdf = async (statement: AccountStatement, labels: StatementLabels): Promise<Blob> => {
  const [{ pdf }, { default: StatementDocument }] = await Promise.all([import("@react-pdf/renderer"), import("../ui/StatementDocument")]);
  return pdf(<StatementDocument statement={statement} labels={labels} />).toBlob();
};
