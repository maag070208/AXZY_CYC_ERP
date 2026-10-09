import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { t } from "@core/i18n";
import type { ReportColumn, ReportResult } from "../models/entity/report";

const formatCell = (value: unknown, column: ReportColumn): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (column.type === "money") return Number(value).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  if (column.type === "percent") return `${value}%`;
  return String(value);
};

const filterLine = (result: ReportResult): string =>
  Object.entries(result.filters)
    .filter(([key, value]) => value !== undefined && value !== null && value !== "" && key !== "termId")
    .map(([key, value]) => `${key === "termNombre" ? "ciclo" : key}: ${value}`)
    .join(" · ");

/** Hoja de cálculo con los mismos renglones del JSON (montos como número). */
export const toXlsx = (result: ReportResult): Buffer => {
  const sheet = XLSX.utils.json_to_sheet(
    result.rows.map((row) => Object.fromEntries(result.columns.map((c) => [c.label, row[c.key] ?? null])))
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, result.title.slice(0, 31));
  const totals = XLSX.utils.json_to_sheet(Object.entries(result.totals).map(([key, value]) => ({ [t("reports.totals")]: key, valor: value })));
  XLSX.utils.book_append_sheet(book, totals, t("reports.totals").slice(0, 31));
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

/**
 * PDF tabular (carta horizontal) generado en la API: encabezado con escuela,
 * título, filtros y fecha; tabla con salto de página y totales al final.
 */
export const toPdf = (result: ReportResult, school: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const weights = result.columns.map((c) => (c.key === "name" || c.key === "concepto" || c.key === "reason" ? 2.2 : c.type === "text" ? 1.3 : 1));
    const unit = width / weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => w * unit);

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#64748b").text(school.toUpperCase(), left, 36);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text(result.title);
    doc.font("Helvetica").fontSize(8).fillColor("#475569")
      .text(`${t("reports.generatedAt")}: ${new Date(result.generatedAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`);
    const filters = filterLine(result);
    if (filters) doc.text(`${t("reports.filters")}: ${filters}`);
    doc.moveDown(0.6);

    const header = () => {
      const y = doc.y;
      doc.rect(left, y, width, 16).fill("#e0e7ff");
      let x = left;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#1e3a8a");
      result.columns.forEach((c, i) => {
        doc.text(c.label.toUpperCase(), x + 3, y + 5, { width: widths[i] - 6, align: c.type === "text" || c.type === "date" ? "left" : "right", lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + 18;
    };
    header();
    doc.font("Helvetica").fontSize(8).fillColor("#0f172a");
    result.rows.forEach((row, index) => {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 30) {
        doc.addPage();
        header();
        doc.font("Helvetica").fontSize(8).fillColor("#0f172a");
      }
      const y = doc.y;
      if (index % 2 === 1) doc.rect(left, y - 2, width, 14).fill("#f8fafc").fillColor("#0f172a");
      let x = left;
      result.columns.forEach((c, i) => {
        doc.text(formatCell(row[c.key], c), x + 3, y, {
          width: widths[i] - 6, align: c.type === "text" || c.type === "date" ? "left" : "right", lineBreak: false, ellipsis: true,
        });
        x += widths[i];
      });
      doc.y = y + 14;
    });
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a").text(t("reports.totals"), left);
    doc.font("Helvetica").fontSize(8.5);
    for (const [key, value] of Object.entries(result.totals)) {
      const money = ["amount", "saldo", "vencido", "CASH", "TRANSFER", "DEPOSIT", "CARD", "OTHER"].includes(key);
      const label = key === "rows" ? t("reports.rows") : result.columns.find((c) => c.key === key)?.label ?? key;
      const percent = result.columns.find((c) => c.key === key)?.type === "percent";
      const shown = money ? Number(value).toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : percent ? `${value}%` : value;
      doc.text(`${label}: ${shown}`);
    }
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text(
        t("reports.page", { page: i + 1, pages: range.count }),
        left, doc.page.height - 24, { width, align: "right", lineBreak: false }
      );
    }
    doc.end();
  });
