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
  studentNumber: string;
  alumno: string;
  concept: string;
  dueDate: string;
  total: string;
  paid: string;
  balance: string;
  charges: string;
  discounts: string;
  overdue: string;
  empty: string;
  generated: string;
  money: (value: number) => string;
  date: (day: string) => string;
}

/** Estado de cuenta del alumno en PDF: cargos vigentes, sus pagos y totales. */
export default function StatementDocument({ statement, labels }: { statement: AccountStatement; labels: StatementLabels }) {
  const { school, student, totals } = statement;
  return (
    <Document title={`${labels.title} ${student.studentNumber}`} author={school.name}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.school}>{school.name}</Text>
          <Text style={styles.small}>{[school.address, school.phone, school.email].filter(Boolean).join(" · ")}</Text>
          <Text style={{ fontSize: 11, marginTop: 4 }}>{labels.title}</Text>
        </View>
        <View style={styles.row}><Text style={styles.label}>{labels.alumno}</Text><Text>{student.name}</Text></View>
        <View style={styles.row}><Text style={styles.label}>{labels.studentNumber}</Text><Text>{student.studentNumber}</Text></View>
        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.wide}>{labels.concept}</Text>
            <Text style={styles.date}>{labels.dueDate}</Text>
            <Text style={styles.cell}>{labels.total}</Text>
            <Text style={styles.cell}>{labels.paid}</Text>
            <Text style={styles.cell}>{labels.balance}</Text>
          </View>
          {statement.charges.length === 0 ? (
            <View style={styles.tr}><Text style={styles.wide}>{labels.empty}</Text></View>
          ) : (
            statement.charges.map((c) => (
              <View key={c.id} wrap={false}>
                <View style={styles.tr}>
                  <Text style={styles.wide}>{c.description ?? c.conceptName}</Text>
                  <Text style={styles.date}>{labels.date(c.dueDate)}</Text>
                  <Text style={styles.cell}>{labels.money(c.total)}</Text>
                  <Text style={styles.cell}>{labels.money(c.paid)}</Text>
                  <Text style={[styles.cell, { fontFamily: "Helvetica-Bold" }]}>{labels.money(c.balance)}</Text>
                </View>
                {c.payments.map((p) => (
                  <View key={p.id} style={styles.pay}>
                    <Text style={styles.wide}>{`${p.receiptNumber} · ${labels.date(p.date)}`}</Text>
                    <Text style={styles.cell}>{labels.money(p.amount)}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
        <View style={styles.totals}>
          <View style={styles.totalRow}><Text>{labels.charges}</Text><Text>{labels.money(totals.charges)}</Text></View>
          <View style={styles.totalRow}><Text>{labels.discounts}</Text><Text>{labels.money(totals.discounts)}</Text></View>
          <View style={styles.totalRow}><Text>{labels.paid}</Text><Text>{labels.money(totals.paid)}</Text></View>
          <View style={[styles.totalRow, { borderTop: "1pt solid #cbd5e1", fontFamily: "Helvetica-Bold" }]}>
            <Text>{labels.balance}</Text><Text>{labels.money(totals.balance)}</Text>
          </View>
          <View style={styles.totalRow}><Text style={{ color: "#DC2626" }}>{labels.overdue}</Text><Text style={{ color: "#DC2626" }}>{labels.money(totals.overdue)}</Text></View>
        </View>
        <Text style={styles.footer} fixed>{labels.generated}</Text>
      </Page>
    </Document>
  );
}
