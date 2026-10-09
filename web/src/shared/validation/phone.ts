import { i18n } from "@shared/i18n";

/** Teléfono: 7 a 20 dígitos y separadores comunes. Vacío = válido. */
export const validatePhone = (value: string | null | undefined): string | null => {
  if (value == null || value.trim() === "") return null;
  return /^[0-9+()\-\s]{7,20}$/.test(value.trim()) ? null : i18n.t("common:validation.invalidPhone");
};
