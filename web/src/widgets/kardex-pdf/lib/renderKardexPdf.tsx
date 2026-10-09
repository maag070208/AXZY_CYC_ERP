import type { Kardex } from "@entities/document";
import type { KardexLabels } from "../ui/KardexDocument";

/**
 * Genera el PDF del kardex. `@react-pdf/renderer` pesa: se carga solo al
 * exportar (import dinámico), no en el bundle inicial.
 */
export const renderKardexPdf = async (kardex: Kardex, labels: KardexLabels): Promise<Blob> => {
  const [{ pdf }, { default: KardexDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../ui/KardexDocument"),
  ]);
  return pdf(<KardexDocument kardex={kardex} labels={labels} />).toBlob();
};
