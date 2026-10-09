import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Payment } from "@entities/finance";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottom: "2pt solid #2563EB", paddingBottom: 8, marginBottom: 14 },
  school: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1D4ED8" },
  title: { fontSize: 11, marginTop: 2 },
  receiptNumber: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  row: { flexDirection: "row", marginBottom: 5 },
  label: { width: 150, color: "#64748b" },
  amountBox: { marginTop: 14, padding: 12, backgroundColor: "#EFF6FF", borderRadius: 4, flexDirection: "row", justifyContent: "space-between" },
  amount: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#1D4ED8" },
  cancelled: { marginTop: 14, padding: 8, border: "2pt solid #DC2626", color: "#DC2626", fontFamily: "Helvetica-Bold", textAlign: "center", fontSize: 14 },
  sign: { marginTop: 48, borderTop: "1pt solid #94a3b8", width: 220, paddingTop: 4, textAlign: "center", color: "#64748b" },
});

export interface ReceiptLabels {
  title: string;
  receiptNumber: string;
  date: string;
  student: string;
  studentNumber: string;
  concept: string;
  method: string;
  reference: string;
  amount: string;
  balance: string;
  cashier: string;
  cancelled: string;
  methodValue: string;
  money: (value: number) => string;
  formatDate: (day: string) => string;
}

/** Recibo de pago (media carta) armado en el navegador con los datos del pago. */
export default function ReceiptDocument({ payment, school, labels }: { payment: Payment; school: string; labels: ReceiptLabels }) {
  const row = (label: string, value: string) => (
    <View style={styles.row}><Text style={styles.label}>{label}</Text><Text>{value}</Text></View>
  );
  return (
    <Document title={`${labels.title} ${payment.receiptNumber}`} author={school}>
      <Page size={[612, 396]} style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.school}>{school}</Text>
            <Text style={styles.title}>{labels.title}</Text>
          </View>
          <View>
            <Text style={{ color: "#64748b", textAlign: "right" }}>{labels.receiptNumber}</Text>
            <Text style={styles.receiptNumber}>{payment.receiptNumber}</Text>
          </View>
        </View>
        {row(labels.date, labels.formatDate(payment.date))}
        {row(labels.student, payment.studentName)}
        {row(labels.studentNumber, payment.studentNumber)}
        {row(labels.concept, payment.chargeDescription ?? payment.conceptName)}
        {row(labels.method, labels.methodValue)}
        {payment.reference ? row(labels.reference, payment.reference) : null}
        <View style={styles.amountBox}>
          <Text>{labels.amount}</Text>
          <Text style={styles.amount}>{labels.money(payment.amount)}</Text>
        </View>
        <View style={[styles.row, { marginTop: 6 }]}>
          <Text style={styles.label}>{labels.balance}</Text><Text>{labels.money(payment.chargeBalance)}</Text>
        </View>
        {payment.cancelledAt ? <Text style={styles.cancelled}>{labels.cancelled}</Text> : null}
        <Text style={styles.sign}>{`${labels.cashier}: ${payment.registeredByName}`}</Text>
      </Page>
    </Document>
  );
}
