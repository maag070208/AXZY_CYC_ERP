import { useCallback, useState } from "react";
import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaBan, FaEdit, FaPlus, FaUndo } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { EDITABLE_FEE_TYPES, feeConceptApi, type FeeConcept } from "@entities/finance";
import { formatMoney } from "@shared/lib/money";
import FeeConceptDialog from "./FeeConceptDialog";

/** Conceptos de cobro: tabla server-side, alta/edición y baja lógica. */
export default function FeeConceptsPanel() {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const notify = useNotify();
  const canManage = useCan("fee_concepts.manage");
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FeeConcept | null>(null);

  const fetchData = useCallback(async (params: ITDataTableFetchParams) => {
    const res = await feeConceptApi.table({ page: params.page, limit: params.limit, filters: params.filters, sort: params.sort });
    return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
  }, []);

  const toggle = async (concept: FeeConcept) => {
    try {
      if (concept.active) await feeConceptApi.deactivate(concept.id);
      else await feeConceptApi.reactivate(concept.id);
      notify.success(concept.active ? t("concepts.deactivated") : t("concepts.reactivated"));
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const columns: Column<FeeConcept>[] = [
    { key: "nombre", label: t("concepts.nombre"), type: "string", filter: true, sortable: false },
    {
      key: "tipo", label: t("concepts.tipo"), type: "catalog", width: 150, filter: "catalog", sortable: false,
      catalogOptions: { data: [...EDITABLE_FEE_TYPES, "RECARGO" as const].map((x) => ({ id: x, name: t(`concepts.types.${x}`) })) },
      render: (row) => <ITText className="text-[12px] text-slate-600">{t(`concepts.types.${row.tipo}`)}</ITText>,
    },
    {
      key: "monto", label: t("concepts.monto"), type: "number", width: 140, sortable: false,
      render: (row) => <ITText className="text-[12px] font-bold text-slate-700">{formatMoney(row.monto, i18n.language)}</ITText>,
    },
    {
      key: "active", label: t("concepts.status"), type: "boolean", width: 120, filter: true,
      render: (row) => <ITBadget color={row.active ? "success" : "danger"} size="sm">{row.active ? t("common:labels.active") : t("common:labels.inactive")}</ITBadget>,
    },
    ...(canManage
      ? [{
          key: "actions", label: t("common:labels.actions"), type: "actions" as const, width: 110,
          actions: (row: FeeConcept) =>
            row.tipo === "RECARGO" ? (
              <ITBadget color="secondary" size="sm">{t("concepts.reserved")}</ITBadget>
            ) : (
              <ITFlex gap={1}>
                <ITButton variant="text" color="secondary" size="sm" ariaLabel={`${t("common:actions.edit")} ${row.nombre}`}
                  onClick={() => { setEditing(row); setFormOpen(true); }}>
                  <FaEdit size={12} />
                </ITButton>
                <ITButton variant="text" color={row.active ? "danger" : "success"} size="sm"
                  ariaLabel={`${row.active ? t("common:actions.deactivate") : t("common:actions.reactivate")} ${row.nombre}`}
                  onClick={() => void toggle(row)}>
                  {row.active ? <FaBan size={12} /> : <FaUndo size={12} />}
                </ITButton>
              </ITFlex>
            ),
        }]
      : []),
  ];

  return (
    <ITFlex direction="column" gap={3}>
      {canManage && (
        <ITFlex justify="end">
          <ITButton variant="filled" color="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="text-[11px] font-bold">{t("concepts.new")}</ITText></ITFlex>
          </ITButton>
        </ITFlex>
      )}
      <ITDataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        fetchData={fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
        reloadTrigger={reloadKey}
        defaultItemsPerPage={25}
        itemsPerPageOptions={[25, 50, 100]}
        layout="fixed"
        density="compact"
      />
      <FeeConceptDialog
        isOpen={formOpen}
        concept={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(_, created) => {
          setFormOpen(false);
          notify.success(created ? t("concepts.created") : t("concepts.saved"));
          setReloadKey((k) => k + 1);
        }}
      />
    </ITFlex>
  );
}
