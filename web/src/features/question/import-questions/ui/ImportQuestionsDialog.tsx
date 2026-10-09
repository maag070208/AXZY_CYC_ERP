import { useEffect, useMemo, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITDialog, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { questionApi, type ImportResult } from "@entities/question";
import { errorMessage } from "@app/toast/useNotify";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

/** Importación CSV en dos pasos: vista previa (no guarda) y aplicar con clave idempotente. */
export default function ImportQuestionsDialog({ isOpen, onClose, onImported }: Props) {
  const { t } = useTranslation(["exams", "common"]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useMemo(() => (isOpen ? `import-${crypto.randomUUID()}` : ""), [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setPreview(null);
    setError(null);
  }, [isOpen]);

  const run = async (apply: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await questionApi.import(file, !apply, apply ? key : undefined);
      if (apply) onImported(result);
      else setPreview(result);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const title = t("questions.importTitle");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-3xl">
      <div role="dialog" aria-label={title}>
        <ITFlex direction="column" gap={3}>
          <ITText className="text-[12px] text-slate-500">{t("questions.importHint")}</ITText>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <label className="flex flex-col gap-1 text-[12px] font-bold text-slate-600">
            {t("questions.importFile")}
            <input type="file" name="csv" accept=".csv,text/csv"
              className="rounded-lg border border-slate-200 p-2 text-[12px] font-normal"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />
          </label>
          {preview && (
            <div data-role="import-preview">
              <ITFlex gap={2} align="center" className="mb-2">
                <ITBadget color={preview.rejected.length ? "warning" : "success"} size="sm">
                  {t("questions.previewSummary", { valid: preview.valid, total: preview.total })}
                </ITBadget>
              </ITFlex>
              {preview.rejected.length > 0 && (
                <div className="mb-2 rounded-xl border border-slate-200 p-2">
                  <ITText className="mb-1 block text-[11px] font-black uppercase text-slate-500">{t("questions.rejected")}</ITText>
                  <ul className="text-[11px] text-slate-600">
                    {preview.rejected.map((r) => (
                      <li key={`${r.row}-${r.code}`}>{t("questions.row")} {r.row}: {r.message} ({r.code})</li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 text-[11px]">
                {preview.sample.map((s) => (
                  <li key={s.row} className="px-2 py-1">
                    <b>{s.courseName}</b> · {t(`questions.types.${s.type}`)} · {s.points} pt — {s.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton variant="outlined" color="primary" disabled={!file || busy} onClick={() => void run(false)}>{t("questions.preview")}</ITButton>
            <ITButton variant="filled" color="primary" disabled={!preview || preview.valid === 0 || busy} onClick={() => void run(true)}>
              {t("questions.apply", { count: preview?.valid ?? 0 })}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </div>
    </ITDialog>
  );
}
