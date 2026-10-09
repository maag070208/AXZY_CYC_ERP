import { j as jsxRuntimeExports } from './index-FZikiRsc.js';
import { Document, Page, View, Text, StyleSheet } from './react-pdf.browser-BP8EZgFX.js';

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
  sign: { marginTop: 48, borderTop: "1pt solid #94a3b8", width: 220, paddingTop: 4, textAlign: "center", color: "#64748b" }
});
function ReceiptDocument({ payment, school, labels }) {
  const row = (label, value) => /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.row, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.label, children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: value })
  ] });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Document, { title: `${labels.title} ${payment.receiptNumber}`, author: school, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Page, { size: [612, 396], style: styles.page, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.header, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.school, children: school }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.title, children: labels.title })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { color: "#64748b", textAlign: "right" }, children: labels.receiptNumber }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.receiptNumber, children: payment.receiptNumber })
      ] })
    ] }),
    row(labels.date, labels.formatDate(payment.date)),
    row(labels.student, payment.studentName),
    row(labels.studentNumber, payment.studentNumber),
    row(labels.concept, payment.chargeDescription ?? payment.conceptName),
    row(labels.method, labels.methodValue),
    payment.reference ? row(labels.reference, payment.reference) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.amountBox, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: labels.amount }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.amount, children: labels.money(payment.amount) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: [styles.row, { marginTop: 6 }], children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.label, children: labels.balance }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: labels.money(payment.chargeBalance) })
    ] }),
    payment.cancelledAt ? /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cancelled, children: labels.cancelled }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.sign, children: `${labels.cashier}: ${payment.registeredByName}` })
  ] }) });
}

export { ReceiptDocument as default };
