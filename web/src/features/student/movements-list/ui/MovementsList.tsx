import { ITAlert, ITBadget, ITLoader, ITTable, ITText } from "@axzydev/axzy_ui_system";
import type { Column } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import type { StudentMovement } from "@entities/student";
import { formatDay } from "@shared/lib/day";
import { PanelCard } from "@shared/ui/panel-card";
import { useMovements } from "../model/useMovements";

interface Props {
  studentId: string;
  reloadKey?: number;
}

/** Historial inmutable de bajas y reingresos (más reciente primero). */
export default function MovementsList({ studentId, reloadKey }: Props) {
  const { t, i18n } = useTranslation(["students", "common"]);
  const fx = useMovements(studentId, reloadKey);

  const columns: Column<StudentMovement>[] = [
    {
      key: "type",
      label: t("movements.tipo"),
      type: "string",
      width: 120,
      render: (m) => (
        <ITBadget color={m.type === "WITHDRAWAL" ? "danger" : "success"} size="sm">
          {t(`movements.${m.type}`)}
        </ITBadget>
      ),
    },
    { key: "date", label: t("movements.fecha"), type: "string", width: 140, render: (m) => formatDay(m.date, i18n.language) },
    { key: "reason", label: t("movements.motivo"), type: "string" },
    {
      key: "notes",
      label: t("movements.observaciones"),
      type: "string",
      render: (m) => <ITText className="text-[11px] text-slate-500">{m.notes ?? "—"}</ITText>,
    },
    { key: "authorName", label: t("movements.autor"), type: "string", width: 180 },
  ];

  return (
    <PanelCard title={t("movements.title")}>
      {fx.error && <ITAlert variant="error">{fx.error}</ITAlert>}
      {fx.loading ? (
        <ITLoader />
      ) : fx.movements.length === 0 ? (
        <ITText className="text-[12px] text-slate-500">{t("movements.empty")}</ITText>
      ) : (
        <ITTable
          columns={columns as unknown as Column<Record<string, unknown>>[]}
          data={fx.movements as unknown as Record<string, unknown>[]}
          defaultItemsPerPage={20}
          density="compact"
        />
      )}
    </PanelCard>
  );
}
