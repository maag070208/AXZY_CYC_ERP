/** Parámetro general (`GET /settings`). */
export interface Setting {
  key: SettingKey;
  value: unknown;
  description: string | null;
  updatedAt: string;
}

export type SettingKey =
  | "SCHOOL_NAME"
  | "SCHOOL_ADDRESS"
  | "SCHOOL_PHONE"
  | "SCHOOL_EMAIL"
  | "SCHOOL_LOGO_PATH"
  | "MIN_PASSING_GRADE"
  | "ATTENDANCE_THRESHOLD"
  | "LATE_FEE"
  | "LANGUAGE";

export interface LateFee {
  enabled: boolean;
  dailyRate: number;
  graceDays: number;
}

/** Recursos de catálogo simple (M11) y su ruta en la API. */
export type CatalogResource = "levels" | "cancellation-reasons" | "document-types";

/** Registro de catálogo simple: los campos extra dependen del recurso. */
export interface CatalogItem {
  id: string;
  nombre: string;
  active: boolean;
  /** Niveles. */
  orden?: number | null;
  /** Tipos de documento. */
  obligatorio?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogInput {
  nombre?: string;
  active?: boolean;
  orden?: number | null;
  obligatorio?: boolean;
}

/** Ciclo escolar; fechas como día del calendario `AAAA-MM-DD`. */
export interface Term {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TermInput {
  nombre?: string;
  fechaInicio?: string;
  fechaFin?: string;
}
