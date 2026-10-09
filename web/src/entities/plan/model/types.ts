// Tipos de M22 (planes de pago del alumno).
import type { PeriodType } from "@entities/program";

export type PlanStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface PlanTotals {
  charges: number;
  enrollmentCharges: number;
  monthlyCharges: number;
  amount: number;
}

export interface Plan {
  id: string;
  student: { id: string; studentNumber: string; name: string };
  program: { id: string; code: string; name: string };
  term: { id: string; name: string } | null;
  startDate: string;
  periodType: PeriodType;
  periodCount: number;
  monthsPerPeriod: number;
  monthlyFee: number;
  enrollmentFee: number;
  discountPercent: number | null;
  discountAmount: number | null;
  discountReason: string | null;
  status: PlanStatus;
  totals: PlanTotals;
  firstDueDate: string | null;
  lastDueDate: string | null;
  createdAt: string;
}

export interface PlanCharge {
  id: string;
  planChargeIndex: number | null;
  description: string | null;
  amount: number;
  dueDate: string;
  status: string;
}

export interface PlanDetail extends Plan {
  charges: PlanCharge[];
}

export interface PlanInput {
  studentId: string;
  programId: string;
  termId?: string | null;
  startDate: string;
  discountPercent?: number | null;
  discountAmount?: number | null;
  discountReason?: string | null;
}
