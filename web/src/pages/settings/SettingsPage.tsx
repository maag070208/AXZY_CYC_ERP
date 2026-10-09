import { ITPage } from "@axzydev/axzy_ui_system";
import { FaCog } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@app/store";
import { useNotify } from "@app/toast/useNotify";
import { meThunk, useCan } from "@entities/user";
import { SettingsForm } from "@features/config/edit-settings";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/settings`: parámetros generales (lectura `config.view`, escritura `config.manage`). */
export default function SettingsPage() {
  const { t } = useTranslation(["config", "common"]);
  const crumbs = useBreadcrumbs();
  const dispatch = useDispatch<AppDispatch>();
  const notify = useNotify();
  const canManage = useCan("config.manage");

  return (
    <ITPage breadcrumbs={crumbs({ label: t("common:nav.settings") })} title={t("settings.title")} description={t("settings.description")} icon={<FaCog size={20} />}>
      <SettingsForm
        canManage={canManage}
        onSaved={() => {
          notify.success(t("settings.saved"));
          // El idioma del sistema puede haber cambiado: `/auth/me` lo trae.
          void dispatch(meThunk());
        }}
      />
    </ITPage>
  );
}
