import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Kardex } from "@entities/document";

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
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: "#94a3b8" },
});

export interface KardexLabels {
  title: string;
  matricula: string;
  status: string;
  ingreso: string;
  ciclo: string;
  curso: string;
  grupo: string;
  final: string;
  estatus: string;
  promedio: string;
  empty: string;
  faltantes: string;
  ninguno: string;
  generated: string;
  estatusValues: Record<string, string>;
}

/** Kardex en PDF (`@react-pdf/renderer`): se arma en el navegador con los datos de la API. */
export default function KardexDocument({ kardex, labels }: { kardex: Kardex; labels: KardexLabels }) {
  return (
    <Document title={`Kardex ${kardex.matricula}`} author={kardex.escuela}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.school}>{kardex.escuela}</Text>
          <Text style={styles.title}>{labels.title}</Text>
        </View>
        <View style={styles.row}><Text style={styles.label}>{labels.matricula}</Text><Text>{kardex.matricula}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Nombre</Text><Text>{kardex.nombre}</Text></View>
        <View style={styles.row}><Text style={styles.label}>{labels.status}</Text><Text>{kardex.status}</Text></View>
        <View style={styles.row}><Text style={styles.label}>{labels.ingreso}</Text><Text>{kardex.fechaIngreso}</Text></View>
        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.cell}>{labels.ciclo}</Text>
            <Text style={styles.wide}>{labels.curso}</Text>
            <Text style={styles.cell}>{labels.grupo}</Text>
            <Text style={styles.cell}>{labels.final}</Text>
            <Text style={styles.cell}>{labels.estatus}</Text>
          </View>
          {kardex.entries.length === 0 ? (
            <View style={styles.tr}><Text style={styles.wide}>{labels.empty}</Text></View>
          ) : (
            kardex.entries.map((entry) => (
              <View key={`${entry.termId}-${entry.courseId}`} style={styles.tr}>
                <Text style={styles.cell}>{entry.termNombre}</Text>
                <Text style={styles.wide}>{entry.courseNombre}</Text>
                <Text style={styles.cell}>{entry.grupo}</Text>
                <Text style={styles.cell}>{entry.calificacionFinal ?? "—"}</Text>
                <Text style={styles.cell}>{labels.estatusValues[entry.estatus] ?? entry.estatus}</Text>
              </View>
            ))
          )}
        </View>
        <View style={[styles.row, { marginTop: 10 }]}>
          <Text style={styles.label}>{labels.promedio}</Text><Text>{kardex.promedioGeneral ?? "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{labels.faltantes}</Text>
          <Text>{kardex.documentosFaltantes.length ? kardex.documentosFaltantes.join(", ") : labels.ninguno}</Text>
        </View>
        <Text style={styles.footer} fixed>{labels.generated}</Text>
      </Page>
    </Document>
  );
}
