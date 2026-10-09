import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Payment } from "@entities/finance";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottom: "2pt solid #2563EB", paddingBottom: 8, marginBottom: 14 },
  school: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1D4ED8" },
  title: { fontSize: 11, marginTop: 2 },
  folio: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  row: { flexDirection: "row", marginBottom: 5 },
  label: { width: 150, color: "#64748b" },
  amountBox: { marginTop: 14, padding: 12, backgroundColor: "#EFF6FF", borderRadius: 4, flexDirection: "row", justifyContent: "space-between" },
  amount: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#1D4ED8" },
  cancelled: { marginTop: 14, padding: 8, border: "2pt solid #DC2626", color: "#DC2626", fontFamily: "Helvetica-Bold", textAlign: "center", fontSize: 14 },
  sign: { marginTop: 48, borderTop: "1pt solid #94a3b8", width: 220, paddingTop: 4, textAlign: "center", color: "#64748b" },
});

export interface ReceiptLabels {
  title: string;
  folio: string;
  fecha: string;
  alumno: string;
  matricula: string;
  concepto: string;
  metodo: string;
  referencia: string;
  monto: string;
  saldo: string;
  cobro: string;
  cancelado: string;
  metodoValue: string;
  money: (value: number) => string;
  date: (day: string) => string;
}

/** Recibo de pago (media carta) armado en el navegador con los datos del pago. */
export default function ReceiptDocument({ payment, school, labels }: { payment: Payment; school: string; labels: ReceiptLabels }) {
  const row = (label: string, value: string) => (
    <View style={styles.row}><Text style={styles.label}>{label}</Text><Text>{value}</Text></View>
  );
  return (
    <Document title={`${labels.title} ${payment.reciboFolio}`} author={school}>
      <Page size={[612, 396]} style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.school}>{school}</Text>
            <Text style={styles.title}>{labels.title}</Text>
          </View>
          <View>
            <Text style={{ color: "#64748b", textAlign: "right" }}>{labels.folio}</Text>
            <Text style={styles.folio}>{payment.reciboFolio}</Text>
          </View>
        </View>
        {row(labels.fecha, labels.date(payment.fecha))}
        {row(labels.alumno, payment.studentNombre)}
        {row(labels.matricula, payment.matricula)}
        {row(labels.concepto, payment.chargeDescripcion ?? payment.conceptNombre)}
        {row(labels.metodo, labels.metodoValue)}
        {payment.referencia ? row(labels.referencia, payment.referencia) : null}
        <View style={styles.amountBox}>
          <Text>{labels.monto}</Text>
          <Text style={styles.amount}>{labels.money(payment.monto)}</Text>
        </View>
        <View style={[styles.row, { marginTop: 6 }]}>
          <Text style={styles.label}>{labels.saldo}</Text><Text>{labels.money(payment.chargeSaldo)}</Text>
        </View>
        {payment.cancelledAt ? <Text style={styles.cancelled}>{labels.cancelado}</Text> : null}
        <Text style={styles.sign}>{`${labels.cobro}: ${payment.registeredByName}`}</Text>
      </Page>
    </Document>
  );
}
