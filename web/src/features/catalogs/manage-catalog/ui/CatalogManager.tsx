import { useState } from "react";
import { ITBadget, ITButton, ITConfirmDialog, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaEdit, FaPlus, FaToggleOff, FaUndo } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { catalogApi, type CatalogItem, type CatalogResource } from "@entities/config";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { PanelCard } from "@shared/ui/panel-card";
import { useCatalogTable } from "../model/useCatalogTable";
import CatalogItemDialog from "./CatalogItemDialog";

interface Props {
  resource: CatalogResource;
  /** Con el permiso de escritura del recurso se ofrecen alta, edición y baja. */
  canManage: boolean;
}

/** Catálogo simple de M11: tabla server-side + alta/edición/desactivación lógica. */
export default function CatalogManager({ resource, canManage }: Props) {
  const { t } = useTranslation(["config", "common"]);
  const notify = useNotify();
  const fx = useCatalogTable(resource);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [deactivating, setDeactivating] = useState<CatalogItem | null>(null);

  const done = (message: string) => {
    notify.success(message);
    fx.reload();
  };

  const deactivate = async () => {
    if (!deactivating) return;
    try {
      await catalogApi.deactivate(resource, deactivating.id);
      setDeactivating(null);
      done(t("catalogs.deactivated"));
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const reactivate = async (item: CatalogItem) => {
    try {
      await catalogApi.update(resource, item.id, { active: true });
      done(t("catalogs.reactivated"));
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const columns: Column<CatalogItem>[] = [
    {
      key: "nombre",
      label: t("catalogs.nombre"),
      type: "string",
      filter: true,
      sortable: true,
      render: (row) => <ITText className="text-[12px] font-bold text-slate-700">{row.nombre}</ITText>,
    },
    ...(resource === "levels"
      ? [{ key: "orden", label: t("catalogs.orden"), type: "number" as const, width: 100, sortable: true }]
      : []),
    ...(resource === "document-types"
      ? [
          {
            key: "obligatorio",
            label: t("catalogs.obligatorio"),
            type: "boolean" as const,
            width: 130,
            filter: true,
            sortable: true,
            render: (row: CatalogItem) => (
              <ITBadget color={row.obligatorio ? "warning" : "gray"} size="sm">
                {row.obligatorio ? t("common:labels.yes") : t("common:labels.no")}
              </ITBadget>
            ),
          },
        ]
      : []),
    {
      key: "active",
      label: t("catalogs.active"),
      type: "boolean",
      width: 120,
      filter: true,
      sortable: true,
      render: (row) => (
        <ITBadget color={row.active ? "success" : "danger"} size="sm">
          {row.active ? t("common:labels.active") : t("common:labels.inactive")}
        </ITBadget>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            label: t("common:labels.actions"),
            type: "actions" as const,
            width: 120,
            actions: (row: CatalogItem) => (
              <ITFlex gap={1}>
                <ITButton
                  variant="text"
                  color="secondary"
                  size="sm"
                  ariaLabel={`${t("common:actions.edit")} ${row.nombre}`}
                  onClick={() => {
                    setEditing(row);
                    setFormOpen(true);
                  }}
                >
                  <FaEdit size={12} />
                </ITButton>
                {row.active ? (
                  <ITButton
                    variant="text"
                    color="danger"
                    size="sm"
                    ariaLabel={`${t("common:actions.deactivate")} ${row.nombre}`}
                    onClick={() => setDeactivating(row)}
                  >
                    <FaToggleOff size={12} />
                  </ITButton>
                ) : (
                  <ITButton
                    variant="text"
                    color="success"
                    size="sm"
                    ariaLabel={`${t("common:actions.reactivate")} ${row.nombre}`}
                    onClick={() => void reactivate(row)}
                  >
                    <FaUndo size={12} />
                  </ITButton>
                )}
              </ITFlex>
            ),
          },
        ]
      : []),
  ];

  return (
    <PanelCard
      actions={
        canManage ? (
          <ITButton
            variant="filled"
            color="primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <ITFlex align="center" gap={1}>
              <FaPlus size={11} />
              <ITText className="font-bold text-[11px]">{t("catalogs.new")}</ITText>
            </ITFlex>
          </ITButton>
        ) : (
          <ITBadget color="gray" size="sm">
            {t("catalogs.readOnly")}
          </ITBadget>
        )
      }
    >
      <ITDataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        fetchData={
          fx.fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>
        }
        reloadTrigger={fx.reloadKey}
        defaultItemsPerPage={25}
        itemsPerPageOptions={[25, 50, 100]}
        layout="fixed"
        density="compact"
      />
      <CatalogItemDialog
        resource={resource}
        isOpen={formOpen}
        item={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(_item, created) => {
          setFormOpen(false);
          done(created ? t("catalogs.created") : t("catalogs.saved"));
        }}
      />
      <ITConfirmDialog
        isOpen={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={() => void deactivate()}
        title={t("catalogs.deactivateTitle", { name: deactivating?.nombre ?? "" })}
        message={t("catalogs.deactivateMessage")}
        confirmLabel={t("common:actions.deactivate")}
        cancelLabel={t("common:actions.cancel")}
        variant="danger"
      />
    </PanelCard>
  );
}
