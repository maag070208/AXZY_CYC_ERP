import { useState } from "react";
import { ITButton, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaHistory, FaSync } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { AuditTable } from "@features/audit/audit-list";

/** `/audit` (`audit.view`): bitácora consultable. */
export default function AuditPage() {
  const { t } = useTranslation(["audit", "common"]);
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <ITPage
      noPadding
      title={t("title")}
      description={t("description")}
      icon={<FaHistory size={20} />}
      actions={
        <ITButton variant="outlined" color="secondary" onClick={() => setReloadKey((k) => k + 1)}>
          <ITFlex align="center" gap={1}>
            <FaSync size={11} />
            <ITText className="font-bold text-[11px]">{t("common:actions.reload")}</ITText>
          </ITFlex>
        </ITButton>
      }
    >
      <AuditTable reloadKey={reloadKey} />
    </ITPage>
  );
}
