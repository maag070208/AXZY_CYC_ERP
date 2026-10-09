import { ITBadget } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import type { Group } from "@entities/group";

export default function GroupStatusBadge({ group }: { group: Pick<Group, "active" | "closedAt" | "available"> }) {
  const { t } = useTranslation(["courses"]);
  if (!group.active) return <ITBadget color="danger" size="sm">{t("groups.inactive")}</ITBadget>;
  if (group.closedAt) return <ITBadget color="secondary" size="sm">{t("groups.closed")}</ITBadget>;
  if (group.available === 0) return <ITBadget color="warning" size="sm">{t("groups.full")}</ITBadget>;
  return <ITBadget color="success" size="sm">{t("groups.open")}</ITBadget>;
}
