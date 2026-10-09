import { useEffect, useState } from "react";
import { FileTypeEnum, ITAlert, ITDropfile, ITFlex, ITInput, ITSelect, UploadStatus } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@entities/document";
import { catalogApi, type CatalogItem } from "@entities/config";
import { errorMessage } from "@app/toast/useNotify";
import { PanelCard } from "@shared/ui/panel-card";

interface Props {
  onUpload: (file: File, documentTypeId: string, notes?: string) => Promise<void>;
  onDone: () => void;
}

/**
 * Subida de un documento: tipo del catálogo M11, notas y archivo. El
 * «Confirmar» del `ITDropfile` sube (la API vuelve a validar tipo y tamaño).
 */
export default function UploadCard({ onUpload, onDone }: Props) {
  const { t } = useTranslation(["documents", "common"]);
  const [types, setTypes] = useState<CatalogItem[]>([]);
  const [typeId, setTypeId] = useState("");
  const [notes, setNotas] = useState("");
  const [status, setStatus] = useState<UploadStatus>(UploadStatus.PENDING);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    catalogApi.options("document-types").then(setTypes).catch(() => setTypes([]));
  }, []);

  const submit = async (file: File) => {
    if (!typeId) return setError(t("upload.typeRequired"));
    if (file.size > MAX_DOCUMENT_BYTES) return setError(t("upload.tooLarge"));
    if (file.type && !(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type)) return setError(t("upload.badType"));
    setStatus(UploadStatus.UPLOADING);
    setError(null);
    try {
      await onUpload(file, typeId, notes.trim() || undefined);
      setStatus(UploadStatus.PENDING);
      setNotas("");
      setResetKey((k) => k + 1);
      onDone();
    } catch (err) {
      setStatus(UploadStatus.ERROR);
      setError(errorMessage(err, t("common:errors.save")));
    }
  };

  return (
    <PanelCard title={t("upload.title")} description={t("upload.hint")}>
      <ITFlex direction="column" gap={3}>
        {error && <ITAlert variant="error">{error}</ITAlert>}
        <ITSelect name="documentTypeId" label={t("upload.type")} value={typeId} required
          options={types.map((type) => ({ value: type.id, label: type.required ? `${type.name} *` : type.name }))}
          onChange={(e) => setTypeId(e.target.value)} />
        <ITInput name="notes" label={t("upload.notas")} value={notes} onChange={(e) => setNotas(e.target.value)} />
        <ITDropfile key={resetKey} onFileSelect={() => setError(null)} onSubmit={(file) => void submit(file)}
          uploadStatus={status} showStatusBadge
          acceptedFileTypes={[FileTypeEnum.PDF, FileTypeEnum.JPEG, FileTypeEnum.JPG, FileTypeEnum.PNG]} />
      </ITFlex>
    </PanelCard>
  );
}
