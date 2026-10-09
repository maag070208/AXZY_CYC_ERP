import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { AccountStatement } from "@entities/finance";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1e293b" },
  header: { borderBottom: "2pt solid #2563EB", paddingBottom: 8, marginBottom: 12 },
  school: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1D4ED8" },
  small: { fontSize: 8, color: "#64748b" },
  row: { flexDirection: "row" },
  label: { width: 90, color: "#64748b" },
  table: { marginTop: 12, border: "1pt solid #cbd5e1" },
  th: { flexDirection: "row", backgroundColor: "#DBEAFE", fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderTop: "1pt solid #e2e8f0" },
  pay: { flexDirection: "row", paddingLeft: 16, color: "#475569", fontSize: 8 },
  cell: { padding: 4, width: 70, textAlign: "right" },
  date: { padding: 4, width: 70 },
  wide: { padding: 4, flex: 1 },
  totals: { marginTop: 12, alignSelf: "flex-end", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: "#94a3b8" },
});

export interface StatementLabels {
  title: string;
  matricula: string;
  alumno: string;
  concepto: string;
  vencimiento: string;
  total: string;
  pagado: string;
  saldo: string;
  cargos: string;
  descuentos: string;
  vencido: string;
  empty: string;
  generated: string;
  money: (value: number) => string;
  date: (day: string) => string;
}

/** Estado de cuenta del alumno en PDF: cargos vigentes, sus pagos y totales. */
export default function StatementDocument({ statement, labels }: { statement: AccountStatement; labels: StatementLabels }) {
  const { escuela, student, totals } = statement;
  return (
    <Document title={`${labels.title} ${student.matricula}`} author={escuela.nombre}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.school}>{escuela.nombre}</Text>
          <Text style={styles.small}>{[escuela.direccion, escuela.telefono, escuela.email].filter(Boolean).join(" · ")}</Text>
          <Text style={{ fontSize: 11, marginTop: 4 }}>{labels.title}</Text>
        </View>
        <View style={styles.row}><Text style={styles.label}>{labels.alumno}</Text><Text>{student.nombre}</Text></View>
        <View style={styles.row}><Text style={styles.label}>{labels.matricula}</Text><Text>{student.matricula}</Text></View>
        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.wide}>{labels.concepto}</Text>
            <Text style={styles.date}>{labels.vencimiento}</Text>
            <Text style={styles.cell}>{labels.total}</Text>
            <Text style={styles.cell}>{labels.pagado}</Text>
            <Text style={styles.cell}>{labels.saldo}</Text>
          </View>
          {statement.charges.length === 0 ? (
            <View style={styles.tr}><Text style={styles.wide}>{labels.empty}</Text></View>
          ) : (
            statement.charges.map((c) => (
              <View key={c.id} wrap={false}>
                <View style={styles.tr}>
                  <Text style={styles.wide}>{c.descripcion ?? c.conceptNombre}</Text>
                  <Text style={styles.date}>{labels.date(c.fechaVencimiento)}</Text>
                  <Text style={styles.cell}>{labels.money(c.total)}</Text>
                  <Text style={styles.cell}>{labels.money(c.pagado)}</Text>
                  <Text style={[styles.cell, { fontFamily: "Helvetica-Bold" }]}>{labels.money(c.saldo)}</Text>
                </View>
                {c.payments.map((p) => (
                  <View key={p.id} style={styles.pay}>
                    <Text style={styles.wide}>{`${p.reciboFolio} · ${labels.date(p.fecha)}`}</Text>
                    <Text style={styles.cell}>{labels.money(p.monto)}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
        <View style={styles.totals}>
          <View style={styles.totalRow}><Text>{labels.cargos}</Text><Text>{labels.money(totals.cargos)}</Text></View>
          <View style={styles.totalRow}><Text>{labels.descuentos}</Text><Text>{labels.money(totals.descuentos)}</Text></View>
          <View style={styles.totalRow}><Text>{labels.pagado}</Text><Text>{labels.money(totals.pagado)}</Text></View>
          <View style={[styles.totalRow, { borderTop: "1pt solid #cbd5e1", fontFamily: "Helvetica-Bold" }]}>
            <Text>{labels.saldo}</Text><Text>{labels.money(totals.saldo)}</Text>
          </View>
          <View style={styles.totalRow}><Text style={{ color: "#DC2626" }}>{labels.vencido}</Text><Text style={{ color: "#DC2626" }}>{labels.money(totals.vencido)}</Text></View>
        </View>
        <Text style={styles.footer} fixed>{labels.generated}</Text>
      </Page>
    </Document>
  );
}
