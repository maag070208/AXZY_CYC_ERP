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
  const [nombre, setNombre] = useState("");
  const [orden, setOrden] = useState("");
  const [obligatorio, setObligatorio] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNombre(item?.nombre ?? "");
    setOrden(item?.orden === null || item?.orden === undefined ? "" : String(item.orden));
    setObligatorio(item?.obligatorio ?? false);
    setTouched(false);
    setError(null);
  }, [item, isOpen]);

  const missing = !nombre.trim();

  const save = async () => {
    setTouched(true);
    if (missing) return;
    setSaving(true);
    setError(null);
    const data = {
      nombre: nombre.trim(),
      ...(resource === "levels" ? { orden: orden === "" ? null : Number.parseInt(orden, 10) } : {}),
      ...(resource === "document-types" ? { obligatorio } : {}),
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
            name="nombre"
            label={t("catalogs.nombre")}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => setTouched(true)}
            required
            autoFocus
            error={touched && missing ? t("catalogs.nombreRequired") : undefined}
          />
          {resource === "levels" && (
            <ITInput
              name="orden"
              type="number"
              label={t("catalogs.orden")}
              value={orden}
              onChange={(e) => setOrden(String(e.target.value ?? ""))}
            />
          )}
          {resource === "document-types" && (
            <ITCheckbox
              name="obligatorio"
              label={t("catalogs.obligatorio")}
              checked={obligatorio}
              onChange={setObligatorio}
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
