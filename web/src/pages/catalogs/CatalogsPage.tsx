import { ITPage, ITTabs } from "@axzydev/axzy_ui_system";
import { FaListUl } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import type { CatalogResource } from "@entities/config";
import { CatalogManager } from "@features/catalogs/manage-catalog";
import { TermsManager } from "@features/catalogs/manage-terms";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/catalogs`: catálogos base de M11; cada pestaña aparece según su permiso. */
export default function CatalogsPage() {
  const { t } = useTranslation(["config", "common"]);
  const crumbs = useBreadcrumbs();
  const can = {
    levelsView: useCan("levels.view"),
    levelsManage: useCan("levels.manage"),
    termsView: useCan("terms.view"),
    termsManage: useCan("terms.manage"),
    configView: useCan("config.view"),
    configManage: useCan("config.manage"),
  };

  const simple = (resource: CatalogResource, canManage: boolean) => ({
    id: resource,
    label: t(`catalogs.tabs.${resource}`),
    content: <CatalogManager key={resource} resource={resource} canManage={canManage} />,
  });

  const items = [
    ...(can.levelsView ? [simple("levels", can.levelsManage)] : []),
    ...(can.termsView
      ? [{ id: "terms", label: t("catalogs.tabs.terms"), content: <TermsManager canManage={can.termsManage} /> }]
      : []),
    ...(can.configView
      ? [simple("cancellation-reasons", can.configManage), simple("document-types", can.configManage)]
      : []),
  ];

  return (
    <ITPage breadcrumbs={crumbs({ label: t("common:nav.catalogs") })} noPadding title={t("catalogs.title")} description={t("catalogs.description")} icon={<FaListUl size={20} />}>
      <ITTabs items={items} />
    </ITPage>
  );
}
