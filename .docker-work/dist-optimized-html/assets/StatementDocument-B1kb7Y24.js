import { j as jsxRuntimeExports } from './index-N5wHO3Rk.js';
import { Document, Page, View, Text, StyleSheet } from './react-pdf.browser-pBmUyY0y.js';

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
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: "#94a3b8" }
});
function StatementDocument({ statement, labels }) {
  const { school, student, totals } = statement;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Document, { title: `${labels.title} ${student.studentNumber}`, author: school.name, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Page, { size: "LETTER", style: styles.page, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.header, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.school, children: school.name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.small, children: [school.address, school.phone, school.email].filter(Boolean).join(" · ") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { fontSize: 11, marginTop: 4 }, children: labels.title })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.row, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.label, children: labels.alumno }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: student.name })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.row, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.label, children: labels.studentNumber }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: student.studentNumber })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.table, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.th, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.wide, children: labels.concept }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.date, children: labels.dueDate }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.total }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.paid }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.balance })
      ] }),
      statement.charges.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: styles.tr, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.wide, children: labels.empty }) }) : statement.charges.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { wrap: false, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.tr, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.wide, children: c.description ?? c.conceptName }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.date, children: labels.date(c.dueDate) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.money(c.total) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.money(c.paid) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: [styles.cell, { fontFamily: "Helvetica-Bold" }], children: labels.money(c.balance) })
        ] }),
        c.payments.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.pay, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.wide, children: `${p.receiptNumber} · ${labels.date(p.date)}` }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.money(p.amount) })
        ] }, p.id))
      ] }, c.id))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.totals, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.totalRow, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: labels.charges }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: labels.money(totals.charges) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.totalRow, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: labels.discounts }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: labels.money(totals.discounts) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.totalRow, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: labels.paid }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: labels.money(totals.paid) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: [styles.totalRow, { borderTop: "1pt solid #cbd5e1", fontFamily: "Helvetica-Bold" }], children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: labels.balance }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: labels.money(totals.balance) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.totalRow, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { color: "#DC2626" }, children: labels.overdue }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: { color: "#DC2626" }, children: labels.money(totals.overdue) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.footer, fixed: true, children: labels.generated })
  ] }) });
}

export { StatementDocument as default };
