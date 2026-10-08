import { useEffect, useState } from "react";
import { ITBadget, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaUserShield } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import {
  permissionApi,
  type PermissionCatalog,
  type RoleAdmin,
} from "@entities/permission";
import { PanelCard } from "@shared/ui/panel-card";
import { KpiTile } from "@shared/ui/kpi-tile";

/**
 * Consola de acceso (placeholder de M02): lee roles y catálogo reales con
 * `permissionApi`. La matriz, políticas y excepciones por persona llegan en
 * iteraciones posteriores del módulo.
 */
export default function RolesPage() {
  const { t } = useTranslation(["common"]);
  const [roles, setRoles] = useState<RoleAdmin[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([permissionApi.roles(), permissionApi.catalog()])
      .then(([roleList, permissionList]) => {
        if (!active) return;
        setRoles(roleList);
        setCatalog(permissionList);
        setError(null);
      })
      .catch((e: any) => {
        if (active) setError(e?.message ?? t("errors.load"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const modules = new Set(catalog.map((permission) => permission.module)).size;

  return (
    <ITPage
      noPadding
      title={t("nav.roles")}
      description={t("home.description")}
      icon={<FaUserShield size={20} />}
      loading={loading}
      error={error}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile
          label={t("nav.roles")}
          value={roles.length}
          icon={<FaUserShield size={16} />}
          tone="violet"
        />
        <KpiTile
          label={t("labels.permissions")}
          value={catalog.length}
          icon={<FaUserShield size={16} />}
          tone="emerald"
        />
        <KpiTile
          label={t("nav.settings")}
          value={modules}
          icon={<FaUserShield size={16} />}
          tone="sky"
        />
      </div>

      <PanelCard title={t("nav.roles")}>
        <ITFlex direction="column" gap={2}>
          {roles.map((role) => (
            <ITFlex
              key={role.key}
              align="center"
              justify="between"
              className="rounded-xl border border-slate-200 px-3 py-2"
            >
              <ITFlex align="center" gap={2}>
                <ITText className="text-[12px] font-black text-slate-700">{role.name}</ITText>
                <ITText className="text-[10px] uppercase tracking-wide text-slate-400">
                  {role.key}
                </ITText>
              </ITFlex>
              <ITFlex align="center" gap={2}>
                {role.system && (
                  <ITBadget color="info" size="lg">
                    system
                  </ITBadget>
                )}
                {role.staff && (
                  <ITBadget color="warning" size="lg">
                    staff
                  </ITBadget>
                )}
                <ITBadget color={role.active ? "success" : "danger"} size="lg">
                  {role.active ? t("labels.active") : t("labels.inactive")}
                </ITBadget>
              </ITFlex>
            </ITFlex>
          ))}
        </ITFlex>
      </PanelCard>
    </ITPage>
  );
}
