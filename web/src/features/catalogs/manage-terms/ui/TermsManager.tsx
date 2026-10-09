import { useCallback, useEffect, useState } from "react";
import { ITBadget, ITButton, ITConfirmDialog, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaCheckCircle, FaEdit, FaPlus } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { termsApi, type Term } from "@entities/config";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { PanelCard } from "@shared/ui/panel-card";
import { fromDay } from "../model/day";
import TermDialog from "./TermDialog";

interface Props {
  canManage: boolean;
}

/** Ciclos escolares: solo uno activo; activar uno desactiva el anterior. */
export default function TermsManager({ canManage }: Props) {
  const { t, i18n } = useTranslation(["config", "common"]);
  const notify = useNotify();
  const [reloadKey, setReloadKey] = useState(0);
  const [current, setCurrent] = useState<Term | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Term | null>(null);
  const [activating, setActivating] = useState<Term | null>(null);

  const loadCurrent = useCallback(() => {
    termsApi.active().then(setCurrent).catch(() => setCurrent(null));
  }, []);
  useEffect(loadCurrent, [loadCurrent, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await termsApi.table({
      page: params.page,
      limit: params.limit,
      filters: params.filters,
      sort: params.sort,
    });
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, []);

  const activate = async () => {
    if (!activating) return;
    try {
      await termsApi.activate(activating.id);
      setActivating(null);
      notify.success(t("terms.activated"));
      reload();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const day = (value: string) => fromDay(value).toLocaleDateString(i18n.language, { dateStyle: "medium" });

  const columns: Column<Term>[] = [
    {
      key: "nombre",
      label: t("terms.nombre"),
      type: "string",
      filter: true,
      sortable: false,
      render: (row) => <ITText className="text-[12px] font-bold text-slate-700">{row.nombre}</ITText>,
    },
    { key: "fechaInicio", label: t("terms.fechaInicio"), type: "string", width: 150, sortable: false, render: (row) => day(row.fechaInicio) },
    { key: "fechaFin", label: t("terms.fechaFin"), type: "string", width: 150, sortable: false, render: (row) => day(row.fechaFin) },
    {
      key: "activo",
      label: t("terms.activo"),
      type: "boolean",
      width: 110,
      filter: true,
      sortable: false,
      render: (row) =>
        row.activo ? (
          <ITBadget color="success" size="sm">
            {t("terms.activo")}
          </ITBadget>
        ) : (
          <ITText className="text-[11px] text-slate-400">—</ITText>
        ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            label: t("common:labels.actions"),
            type: "actions" as const,
            width: 140,
            actions: (row: Term) => (
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
                {!row.activo && (
                  <ITButton
                    variant="text"
                    color="success"
                    size="sm"
                    ariaLabel={`${t("terms.activate")} ${row.nombre}`}
                    onClick={() => setActivating(row)}
                  >
                    <FaCheckCircle size={12} />
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
      description={current ? `${t("terms.current")}: ${current.nombre}` : t("terms.none")}
      actions={
        canManage && (
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
              <ITText className="font-bold text-[11px]">{t("terms.new")}</ITText>
            </ITFlex>
          </ITButton>
        )
      }
    >
      <ITDataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        fetchData={fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
        reloadTrigger={reloadKey}
        defaultItemsPerPage={25}
        itemsPerPageOptions={[25, 50]}
        layout="fixed"
        density="compact"
      />
      <TermDialog
        isOpen={formOpen}
        term={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(_term, created) => {
          setFormOpen(false);
          notify.success(created ? t("catalogs.created") : t("catalogs.saved"));
          reload();
        }}
      />
      <ITConfirmDialog
        isOpen={!!activating}
        onClose={() => setActivating(null)}
        onConfirm={() => void activate()}
        title={t("terms.activateTitle", { name: activating?.nombre ?? "" })}
        message={t("terms.activateMessage")}
        confirmLabel={t("terms.activate")}
        cancelLabel={t("common:actions.cancel")}
        variant="success"
      />
    </PanelCard>
  );
}
