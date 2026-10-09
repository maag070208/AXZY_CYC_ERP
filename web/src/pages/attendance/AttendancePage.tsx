import { useCallback, useState } from "react";
import { ITPage } from "@axzydev/axzy_ui_system";
import { FaClipboardCheck } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { JustificationsTable } from "@features/attendance/justifications-inbox";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/attendance` (M18): bandeja de justificantes del alcance del usuario. */
export default function AttendancePage() {
  const { t } = useTranslation(["attendance", "common"]);
  const crumbs = useBreadcrumbs();
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const onTotal = useCallback((n: number) => setTotal(n), []);

  return (
    <ITPage
      className="m-0! px-4! max-w-screen!"
      breadcrumbs={crumbs({ label: t("common:nav.attendance") })}
      noPadding
      title={t("justifications.pageTitle")}
      description={t("justifications.pageDescription", { count: total })}
      icon={<FaClipboardCheck size={20} />}
    >
      <JustificationsTable reloadKey={reloadKey} onTotal={onTotal} onResolved={() => setReloadKey((k) => k + 1)} />
    </ITPage>
  );
}
