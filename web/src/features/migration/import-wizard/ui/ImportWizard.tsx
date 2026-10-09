import { useState } from "react";
import { ITAlert, ITBadget, ITButton, ITConfirmDialog, ITFlex, ITSelect, ITTable, ITText } from "@axzydev/axzy_ui_system";
import type { Column } from "@axzydev/axzy_ui_system";
import { FaFileUpload, FaPlay } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { migrationApi, MIGRATION_ENTITIES, type MigrationEntity, type MigrationRejection, type MigrationResult } from "@entities/migration";
import { PanelCard } from "@shared/ui/panel-card";

interface Props {
  onExecuted: () => void;
}

const newKey = (): string => `mig-${crypto.randomUUID()}`;

/** Asistente de importación (M20): previsualizar (`dry-run`) y confirmar la ejecución. */
export default function ImportWizard({ onExecuted }: Props) {
  const { t } = useTranslation(["migration", "common"]);
  const notify = useNotify();
  const [entity, setEntity] = useState<MigrationEntity>("Student");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const preview = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await migrationApi.preview(entity, file);
      setResult(res);
      notify.success(t("wizard.previewed", { rejected: res.totals.rejected ?? 0 }));
    } catch (err) {
      setError(errorMessage(err, t("common:errors.load")));
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!file || !result) return;
    setBusy(true);
    setError(null);
    try {
      const res = await migrationApi.execute(entity, file, result.checksum, newKey());
      setResult(res);
      notify.success(t("wizard.executed", { inserted: res.totals.inserted ?? 0, updated: res.totals.updated ?? 0, rejected: res.totals.rejected ?? 0 }));
      onExecuted();
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const columns: Column<MigrationRejection>[] = [
    { key: "row", label: t("wizard.row"), type: "number", width: 80 },
    {
      key: "reason", label: t("wizard.reason"), type: "string",
      render: (r) => <ITBadget color="danger" size="sm">{t(`reasons.${r.reason}`, { defaultValue: r.reason })}</ITBadget>,
    },
    { key: "value", label: t("wizard.value"), type: "string", render: (r) => <ITText className="font-mono text-[11px] text-slate-600">{r.value ?? "—"}</ITText> },
  ];

  const totals = result ? Object.entries(result.totals) : [];

  return (
    <PanelCard title={t("wizard.title")} description={t("wizard.description")}>
      <ITFlex direction="column" gap={4}>
        <ITAlert variant="info">{t("wizard.backupHint")}</ITAlert>
        {error && <ITAlert variant="error">{error}</ITAlert>}

        <ITFlex gap={3} wrap="wrap" align="end">
          <ITSelect
            name="entity"
            label={t("wizard.entity")}
            value={entity}
            options={MIGRATION_ENTITIES.map((e) => ({ value: e, label: t(`entities.${e}`) }))}
            onChange={(e) => { setEntity(e.target.value as MigrationEntity); reset(); }}
          />
          <label className="flex flex-col gap-1 text-[12px] font-bold text-slate-600">
            {t("wizard.file")}
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              className="rounded-lg border border-slate-200 p-2 text-[12px] font-normal"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); }}
            />
          </label>
          <ITButton variant="outlined" color="primary" disabled={!file || busy} onClick={() => void preview()}>
            <ITFlex align="center" gap={1}><FaFileUpload size={11} /><ITText className="text-[11px] font-bold">{t("wizard.preview")}</ITText></ITFlex>
          </ITButton>
        </ITFlex>

        {result && (
          <ITFlex direction="column" gap={3}>
            <ITFlex gap={3} wrap="wrap" align="center">
              <ITBadget color={result.mode === "DRY_RUN" ? "warning" : "success"} size="sm">
                {result.mode === "DRY_RUN" ? t("wizard.dryRun") : t("wizard.executedBadge")}
              </ITBadget>
              {totals.map(([key, value]) => (
                <ITText key={key} className="text-[12px] text-slate-600">
                  {t(`totals.${key}`, { defaultValue: key })}: <strong>{value}</strong>
                </ITText>
              ))}
            </ITFlex>

            {result.rejected.length === 0 ? (
              <ITAlert variant="success">{t("wizard.noRejected")}</ITAlert>
            ) : (
              <>
                <ITText className="text-[12px] font-bold text-slate-600">{t("wizard.rejectedTitle", { count: result.totals.rejected ?? result.rejected.length })}</ITText>
                <ITTable
                  columns={columns as unknown as Column<Record<string, unknown>>[]}
                  data={result.rejected as unknown as Record<string, unknown>[]}
                  defaultItemsPerPage={10}
                  density="compact"
                />
              </>
            )}

            {result.mode === "DRY_RUN" && (
              <ITFlex justify="end" gap={2}>
                <ITButton variant="outlined" color="secondary" onClick={reset}>{t("common:actions.cancel")}</ITButton>
                <ITButton variant="filled" color="primary" disabled={busy} onClick={() => setConfirmOpen(true)}>
                  <ITFlex align="center" gap={1}><FaPlay size={10} /><ITText className="text-[11px] font-bold">{t("wizard.execute")}</ITText></ITFlex>
                </ITButton>
              </ITFlex>
            )}
          </ITFlex>
        )}
      </ITFlex>

      <ITConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void execute()}
        title={t("wizard.confirmTitle")}
        message={t("wizard.confirmMessage", { entity: t(`entities.${entity}`) })}
        confirmLabel={t("wizard.execute")}
        cancelLabel={t("common:actions.cancel")}
        variant="primary"
      />
    </PanelCard>
  );
}
