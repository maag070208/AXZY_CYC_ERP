import { ITPage, ITTabs } from "@axzydev/axzy_ui_system";
import { FaKey, FaUserShield } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useRoles } from "@entities/permission";
import { RolesManager } from "@features/permission/roles-manager";
import { MatrixEditor } from "@features/permission/matrix-editor";
import { PoliciesManager } from "@features/permission/policies-manager";
import { KpiTile } from "@shared/ui/kpi-tile";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** Consola de acceso (`roles.manage`): roles, matriz rol × permiso y políticas ABAC. */
export default function RolesPage() {
  const { t } = useTranslation(["roles", "common"]);
  const crumbs = useBreadcrumbs();
  const { roles, loading, error, reload } = useRoles();

  return (
    <ITPage
      className="m-0! px-4! max-w-screen!"
      breadcrumbs={crumbs({ label: t("common:nav.roles") })}
      noPadding
      title={t("title")}
      description={t("description")}
      icon={<FaUserShield size={20} />}
      loading={loading && roles.length === 0}
      error={error}
      onRetry={reload}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiTile label={t("kpi.roles")} value={roles.length} icon={<FaUserShield size={16} />} tone="violet" />
        <KpiTile
          label={t("roles.users")}
          value={roles.reduce((total, role) => total + role.userCount, 0)}
          icon={<FaKey size={16} />}
          tone="emerald"
        />
      </div>
      <ITTabs
        items={[
          { id: "roles", label: t("tabs.roles"), content: <RolesManager roles={roles} onChanged={reload} /> },
          { id: "matrix", label: t("tabs.matrix"), content: <MatrixEditor roles={roles} /> },
          { id: "policies", label: t("tabs.policies"), content: <PoliciesManager roles={roles} /> },
        ]}
      />
    </ITPage>
  );
}
