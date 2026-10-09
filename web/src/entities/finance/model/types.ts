export type FeeConceptType = "ENROLLMENT" | "TUITION" | "MATERIAL" | "LATE_FEE" | "OTHER";
export const EDITABLE_FEE_TYPES: readonly FeeConceptType[] = ["ENROLLMENT", "TUITION", "MATERIAL", "OTHER"];
export type ChargeStatus = "PENDING" | "PARTIAL" | "PAID" | "CANCELLED";
export const CHARGE_STATUSES: readonly ChargeStatus[] = ["PENDING", "PARTIAL", "PAID", "CANCELLED"];
/** Color del badge por estatus. */
export const CHARGE_STATUS_COLOR: Record<ChargeStatus, "warning" | "primary" | "success" | "secondary"> = {
  PENDING: "warning",
  PARTIAL: "primary",
  PAID: "success",
  CANCELLED: "secondary",
};
export type PaymentMethod = "CASH" | "TRANSFER" | "DEPOSIT" | "CARD" | "OTHER";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "TRANSFER", "DEPOSIT", "CARD", "OTHER"];

/** Concepto de cobro (`/fee-concepts`, M09). */
export interface FeeConcept {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  type: FeeConceptType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeeConceptInput {
  name?: string;
  description?: string | null;
  amount?: number;
  type?: FeeConceptType;
}

/** Cargo con total, pagado y saldo calculados por la API. */
export interface Charge {
  id: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  conceptId: string;
  conceptName: string;
  conceptType: FeeConceptType;
  termId: string | null;
  termName: string | null;
  description: string | null;
  amount: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  dueDate: string;
  overdue: boolean;
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
  description?: string | null;
  amount?: number;
  discount?: number;
  dueDate: string;
}

export interface ChargeGenerateInput {
  conceptId: string;
  scope: "group" | "term";
  groupId?: string;
  termId?: string;
  description?: string | null;
  amount?: number;
  discount?: number;
  dueDate: string;
}

export interface Payment {
  id: string;
  chargeId: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  conceptName: string;
  chargeDescription: string | null;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference: string | null;
  receiptNumber: string;
  registeredBy: string;
  registeredByName: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  chargeStatus: ChargeStatus;
  chargeBalance: number;
}

export interface PaymentInput {
  chargeId: string;
  amount: number;
  date?: string;
  method: PaymentMethod;
  reference?: string | null;
}

export interface AccountStatement {
  student: { id: string; studentNumber: string; name: string; status: "ACTIVE" | "WITHDRAWN" };
  school: { name: string; address: string; phone: string; email: string };
  charges: Array<Charge & { payments: Array<{ id: string; receiptNumber: string; date: string; amount: number; method: PaymentMethod }> }>;
  totals: { charges: number; discounts: number; paid: number; balance: number; overdue: number };
  generatedAt: string;
}
