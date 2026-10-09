export type FeeConceptType = "INSCRIPCION" | "COLEGIATURA" | "MATERIAL" | "RECARGO" | "OTRO";
export const EDITABLE_FEE_TYPES: readonly FeeConceptType[] = ["INSCRIPCION", "COLEGIATURA", "MATERIAL", "OTRO"];
export type ChargeStatus = "PENDIENTE" | "PARCIAL" | "PAGADO" | "CANCELADO";
export const CHARGE_STATUSES: readonly ChargeStatus[] = ["PENDIENTE", "PARCIAL", "PAGADO", "CANCELADO"];
/** Color del badge por estatus. */
export const CHARGE_STATUS_COLOR: Record<ChargeStatus, "warning" | "primary" | "success" | "secondary"> = {
  PENDIENTE: "warning",
  PARCIAL: "primary",
  PAGADO: "success",
  CANCELADO: "secondary",
};
export type PaymentMethod = "EFECTIVO" | "TRANSFERENCIA" | "DEPOSITO" | "TARJETA" | "OTRO";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["EFECTIVO", "TRANSFERENCIA", "DEPOSITO", "TARJETA", "OTRO"];

/** Concepto de cobro (`/fee-concepts`, M09). */
export interface FeeConcept {
  id: string;
  nombre: string;
  descripcion: string | null;
  monto: number;
  tipo: FeeConceptType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeeConceptInput {
  nombre?: string;
  descripcion?: string | null;
  monto?: number;
  tipo?: FeeConceptType;
}

/** Cargo con total, pagado y saldo calculados por la API. */
export interface Charge {
  id: string;
  studentId: string;
  matricula: string;
  studentNombre: string;
  conceptId: string;
  conceptNombre: string;
  conceptTipo: FeeConceptType;
  termId: string | null;
  termNombre: string | null;
  descripcion: string | null;
  monto: number;
  descuento: number;
  total: number;
  pagado: number;
  saldo: number;
  fechaVencimiento: string;
  vencido: boolean;
  status: ChargeStatus;
  parentChargeId: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface ChargeInput {
  studentId: string;
  conceptId: string;
  termId?: string | null;
  descripcion?: string | null;
  monto?: number;
  descuento?: number;
  fechaVencimiento: string;
}

export interface ChargeGenerateInput {
  conceptId: string;
  scope: "group" | "term";
  groupId?: string;
  termId?: string;
  descripcion?: string | null;
  monto?: number;
  descuento?: number;
  fechaVencimiento: string;
}

export interface Payment {
  id: string;
  chargeId: string;
  studentId: string;
  matricula: string;
  studentNombre: string;
  conceptNombre: string;
  chargeDescripcion: string | null;
  monto: number;
  fecha: string;
  metodo: PaymentMethod;
  referencia: string | null;
  reciboFolio: string;
  registeredBy: string;
  registeredByName: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  chargeStatus: ChargeStatus;
  chargeSaldo: number;
}

export interface PaymentInput {
  chargeId: string;
  monto: number;
  fecha?: string;
  metodo: PaymentMethod;
  referencia?: string | null;
}

export interface AccountStatement {
  student: { id: string; matricula: string; nombre: string; status: "ACTIVO" | "BAJA" };
  escuela: { nombre: string; direccion: string; telefono: string; email: string };
  charges: Array<Charge & { payments: Array<{ id: string; reciboFolio: string; fecha: string; monto: number; metodo: PaymentMethod }> }>;
  totals: { cargos: number; descuentos: number; pagado: number; saldo: number; vencido: number };
  generadoEn: string;
}
