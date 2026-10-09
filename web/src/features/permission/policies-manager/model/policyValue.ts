import type { PolicyValue } from "@entities/permission";

/**
 * Valor de una condición escrito por la persona → JSON de la API:
 * `true`/`false`, `null`, números, listas separadas por comas y texto (incluye
 * las referencias `@user.id` / `@user.roles`).
 */
export const parsePolicyValue = (raw: string): PolicyValue => {
  const text = raw.trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text.includes(",")) {
    return text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (/^-?\d+(\.\d+)?$/.test(part) ? Number(part) : part));
  }
  return text;
};

/** Inverso de `parsePolicyValue` para precargar el formulario. */
export const formatPolicyValue = (value: PolicyValue): string => {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null) return "";
  return String(value);
};
