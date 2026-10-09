import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITCheckbox, ITDialog, ITFlex, ITInput } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { catalogApi, type CatalogItem, type CatalogResource } from "@entities/config";
import { errorMessage } from "@app/toast/useNotify";

interface Props {
  resource: CatalogResource;
  isOpen: boolean;
  item: CatalogItem | null;
  onClose: () => void;
  onSaved: (item: CatalogItem, created: boolean) => void;
}

/** Alta/edición de un registro de catálogo; los campos extra dependen del recurso. */
export default function CatalogItemDialog({ resource, isOpen, item, onClose, onSaved }: Props) {
  const { t } = useTranslation(["config", "common"]);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [required, setRequired] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(item?.name ?? "");
    setSortOrder(item?.sortOrder === null || item?.sortOrder === undefined ? "" : String(item.sortOrder));
    setRequired(item?.required ?? false);
    setTouched(false);
    setError(null);
  }, [item, isOpen]);

  const missing = !name.trim();

  const save = async () => {
    setTouched(true);
    if (missing) return;
    setSaving(true);
    setError(null);
    const data = {
      name: name.trim(),
      ...(resource === "levels" ? { sortOrder: sortOrder === "" ? null : Number.parseInt(sortOrder, 10) } : {}),
      ...(resource === "document-types" ? { required } : {}),
    };
    try {
      if (item) onSaved(await catalogApi.update(resource, item.id, data), false);
      else onSaved(await catalogApi.create(resource, data), true);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ITDialog
      isOpen={isOpen}
      onClose={onClose}
      title={item ? t("catalogs.editTitle") : t("catalogs.newTitle")}
      className="w-full max-w-lg"
    >
      <form
        role="dialog"
        aria-label={item ? t("catalogs.editTitle") : t("catalogs.newTitle")}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITInput
            name="name"
            label={t("catalogs.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            required
            autoFocus
            error={touched && missing ? t("catalogs.nameRequired") : undefined}
          />
          {resource === "levels" && (
            <ITInput
              name="sortOrder"
              type="number"
              label={t("catalogs.sortOrder")}
              value={sortOrder}
              onChange={(e) => setSortOrder(String(e.target.value ?? ""))}
            />
          )}
          {resource === "document-types" && (
            <ITCheckbox
              name="required"
              label={t("catalogs.required")}
              checked={required}
              onChange={setRequired}
            />
          )}
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>
              {t("common:actions.cancel")}
            </ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>
              {saving ? t("common:actions.saving") : t("common:actions.save")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
