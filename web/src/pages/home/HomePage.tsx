import { ITPage } from "@axzydev/axzy_ui_system";
import { FaHouseUser, FaKey, FaUserShield } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import type { RootState } from "@app/store";
import { KpiTile } from "@shared/ui/kpi-tile";
import { PanelCard } from "@shared/ui/panel-card";

export default function HomePage() {
  const { t } = useTranslation(["common"]);
  const user = useSelector((s: RootState) => s.auth.user);
  const permissionCount = Object.keys(user?.permissions ?? {}).length;
  const roles = (user?.roles ?? (user?.role ? [user.role] : [])).join(", ");

  return (
    <ITPage
      title={t("home.title")}
      description={t("home.description")}
      icon={<FaHouseUser size={20} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile
          label={t("home.title")}
          value={user?.name ?? "—"}
          icon={<FaUserShield size={16} />}
          tone="sky"
          hint={t("home.welcome", { name: user?.name ?? "" })}
        />
        <KpiTile
          label={t("labels.role")}
          value={roles || "—"}
          icon={<FaUserShield size={16} />}
          tone="violet"
        />
        <KpiTile
          label={t("labels.permissions")}
          value={permissionCount}
          icon={<FaKey size={16} />}
          tone="emerald"
        />
      </div>

      <div className="mt-4">
        <PanelCard title={t("nav.settings")} description={t("home.description")}>
          <p className="text-[12px] text-slate-600">
            {t("home.welcome", { name: user?.name ?? "" })}
          </p>
        </PanelCard>
      </div>
    </ITPage>
  );
}
