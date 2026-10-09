// API pública del slice "config" (M11: parámetros y catálogos).
export { catalogApi, settingsApi, termsApi } from "./api/configApi";
export type {
  CatalogInput,
  CatalogItem,
  CatalogResource,
  LateFee,
  Setting,
  SettingKey,
  Term,
  TermInput,
} from "./model/types";
