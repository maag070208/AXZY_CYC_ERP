import { j as jsxRuntimeExports } from './index-N5wHO3Rk.js';
import { Document, Page, View, Text, StyleSheet } from './react-pdf.browser-pBmUyY0y.js';

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1e293b" },
  header: { borderBottom: "2pt solid #2563EB", paddingBottom: 8, marginBottom: 12 },
  school: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1D4ED8" },
  title: { fontSize: 11, marginTop: 2 },
  row: { flexDirection: "row" },
  label: { width: 110, color: "#64748b" },
  table: { marginTop: 12, border: "1pt solid #cbd5e1" },
  th: { flexDirection: "row", backgroundColor: "#DBEAFE", fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderTop: "1pt solid #e2e8f0" },
  cell: { padding: 4, flex: 1 },
  wide: { padding: 4, flex: 3 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: "#94a3b8" }
});
function KardexDocument({ kardex, labels }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Document, { title: `Kardex ${kardex.studentNumber}`, author: kardex.school, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Page, { size: "LETTER", style: styles.page, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.header, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.school, children: kardex.school }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.title, children: labels.title })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.row, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.label, children: labels.studentNumber }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: kardex.studentNumber })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.row, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.label, children: "Nombre" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: kardex.name })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.row, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.label, children: labels.status }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: kardex.status })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.row, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.label, children: labels.enrollmentDate }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: kardex.enrollmentDate })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.table, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.th, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.termName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.wide, children: labels.courseName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.groupName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.final }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.entryStatus })
      ] }),
      kardex.entries.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(View, { style: styles.tr, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.wide, children: labels.empty }) }) : kardex.entries.map((entry) => /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.tr, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: entry.termName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.wide, children: entry.courseName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: entry.groupName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: entry.finalGrade ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.cell, children: labels.statusValues[entry.status] ?? entry.status })
      ] }, `${entry.termId}-${entry.courseId}`))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: [styles.row, { marginTop: 10 }], children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.label, children: labels.average }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: kardex.overallAverage ?? "—" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(View, { style: styles.row, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.label, children: labels.missing }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { children: kardex.missingDocuments.length ? kardex.missingDocuments.join(", ") : labels.ninguno })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Text, { style: styles.footer, fixed: true, children: labels.generated })
  ] }) });
}

export { KardexDocument as default };
