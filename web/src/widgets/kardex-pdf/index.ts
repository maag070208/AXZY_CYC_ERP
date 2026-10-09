// Widget del kardex: vista + exportación a PDF.
export type { KardexLabels } from "./ui/KardexDocument";
export { default as KardexView } from "./ui/KardexView";
export { useKardex } from "./model/useKardex";
export { renderKardexPdf } from "./lib/renderKardexPdf";
