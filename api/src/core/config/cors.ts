/**
 * Política de orígenes permitidos para CORS (`WEB_ORIGIN`).
 *
 * Acepta una lista separada por comas y comodines por segmento:
 *   WEB_ORIGIN=https://cyc.axzy.dev,https://*.axzy.dev,http://localhost:5173
 *   WEB_ORIGIN=*            → permite cualquiera
 *
 * Se mantiene puro (sin Express) para probarlo de forma unitaria.
 */

export interface CorsOriginPolicy {
  /** `true` si se permite cualquier origen (`*`). */
  allowAny: boolean;
  /** Orígenes exactos o con comodín (`*`) a comparar. */
  patterns: string[];
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Compila un patrón (`https://*.axzy.dev`) a una expresión regular anclada. */
const patternToRegExp = (pattern: string): RegExp =>
  new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`);

/** Interpreta el valor de `WEB_ORIGIN` (por defecto `*`, el fallback de la config). */
export const parseCorsOrigins = (raw: string | undefined): CorsOriginPolicy => {
  const list = (raw ?? "*")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (list.length === 0 || list.includes("*")) return { allowAny: true, patterns: [] };
  return { allowAny: false, patterns: list };
};

/**
 * ¿El `Origin` de la petición está permitido? Sin `Origin` (mismo origen, curl,
 * server-to-server) se considera permitido: CORS solo aplica a navegadores.
 */
export const isOriginAllowed = (origin: string | undefined, policy: CorsOriginPolicy): boolean => {
  if (policy.allowAny) return true;
  if (!origin) return true;
  return policy.patterns.some((pattern) =>
    pattern.includes("*") ? patternToRegExp(pattern).test(origin) : pattern === origin
  );
};
