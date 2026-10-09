import { useCallback, useState } from "react";
import { ITFlex, ITPage, ITTabs } from "@axzydev/axzy_ui_system";
import { FaDatabase } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { ImportWizard } from "@features/migration/import-wizard";
import { BatchesTable } from "@features/migration/batches";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/migration` (M20): asistente de importación e historial de lotes. */
export default function MigrationPage() {
  const { t } = useTranslation(["migration", "common"]);
  const crumbs = useBreadcrumbs();
  const [reloadKey, setReloadKey] = useState(0);
  const [total, setTotal] = useState(0);
  const onTotal = useCallback((n: number) => setTotal(n), []);
  const bump = () => setReloadKey((k) => k + 1);

  return (
    <ITPage
      breadcrumbs={crumbs({ label: t("common:nav.migration") })}
      title={t("page.title")}
      description={t("page.description", { count: total })}
      icon={<FaDatabase size={20} />}
    >
      <ITFlex direction="column" gap={4}>
        <ITTabs
          items={[
            { id: "import", label: t("page.tabs.import"), content: <ImportWizard onExecuted={bump} /> },
            { id: "batches", label: t("page.tabs.batches"), content: <BatchesTable reloadKey={reloadKey} onTotal={onTotal} /> },
          ]}
        />
      </ITFlex>
    </ITPage>
  );
}
